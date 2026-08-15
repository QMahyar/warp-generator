/**
 * WARP account module (ticket 02) — registration, rotation, KV.
 *
 * Owns everything account-shaped:
 *   - registerAccount()   — the Cloudflare registration flow
 *                           (registerClient → enableWarp, the same two calls
 *                           the legacy per-request generator used, 10 s
 *                           timeout and okhttp UA preserved).
 *   - extractAccountRecord — pure: snapshot the account material out of the
 *                           enableWarp response (private key, client id,
 *                           token, peer pubkey, v4/v6, reserved,
 *                           registeredAt).
 *   - read/write/deleteAccount — thin helpers over the `ACCOUNT` KV binding
 *                           (JSON record under key "account").
 *   - describeAccountError — maps thrown errors to operator-readable messages.
 *
 * Record shape (the ACCOUNT KV value; ticket 10 added source/verified/verifiedAt
 * and made clientId/token nullable for credential-less conf imports):
 *   { privateKey, clientId|null, token|null, peerPublicKey, v4, v6,
 *     reserved, source: 'register'|'import', verified: boolean,
 *     verifiedAt: ISO|null, registeredAt }
 *
 * Write ordering contract: the panel's Register/Rotate/Import handlers
 * (worker/index.js) call the account/import module first and writeAccount()
 * only when parse (+ optional verification) succeeded — a failed action
 * leaves KV untouched. Nothing else in the worker writes the account;
 * subscription routes only read it.
 *
 * Environment notes:
 *   - `Buffer` comes from the 'buffer' module (worker bundle under
 *     nodejs_compat; Node builtin under `node --test`).
 *   - `tweetnacl` is imported lazily inside generateKeyPair() so that
 *     `node --test` (no node_modules in this repo) can import the pure parts
 *     of this module without stubbing. The worker bundle bundles it like the
 *     static import in api-handler.js.
 */

import { Buffer } from 'buffer';

export const ACCOUNT_KV_KEY = 'account';

const CF_BASE = 'https://api.cloudflareclient.com/v0i1909051800';
const CF_HEADERS = { 'User-Agent': 'okhttp/3.12.1', 'Content-Type': 'application/json' };
const CF_TIMEOUT_MS = 10000; // keep: same 10 s ceiling as the legacy handler

/** Errors thrown by this module always carry a human-readable message. */
export class AccountError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = 'AccountError';
    this.status = status; // upstream HTTP status when the upstream rejected us
    if (cause !== null) this.cause = cause;
  }
}

// ---- Keypair (lazy tweetnacl import — see module header) ----

async function generateKeyPair() {
  const { default: nacl } = await import('tweetnacl');
  const kp = nacl.box.keyPair(); // X25519, same as the legacy handler
  return {
    privateKey: Buffer.from(kp.secretKey).toString('base64'),
    publicKey: Buffer.from(kp.publicKey).toString('base64'),
  };
}

// ---- Cloudflare WARP API ----

function cfStatusMessage(status) {
  if (status === 429) return 'Cloudflare is rate-limiting registrations from this network. Wait a few minutes, then try again — or import an existing account from the account card instead.';
  if (status >= 400 && status < 500) return `Cloudflare rejected the registration (HTTP ${status}).`;
  return `Cloudflare registration API error (HTTP ${status}). Try again later.`;
}

/** fetch + JSON with the okhttp UA, 10 s timeout and readable failure mapping. */
async function cfFetch(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(CF_TIMEOUT_MS) });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new AccountError(`Timed out after ${CF_TIMEOUT_MS / 1000} s waiting for Cloudflare. Try again.`, { cause: err });
    }
    throw new AccountError('Network error while reaching api.cloudflareclient.com. Try again.', { cause: err });
  }
  if (!res.ok) throw new AccountError(cfStatusMessage(res.status), { status: res.status });
  return res.json();
}

/** POST /reg — returns { id, token } for the fresh registration. */
export async function registerClient(publicKey) {
  const data = await cfFetch(`${CF_BASE}/reg`, {
    method: 'POST',
    headers: CF_HEADERS,
    body: JSON.stringify({
      install_id: '', tos: new Date().toISOString(), key: publicKey,
      fcm_token: '', type: 'ios', locale: 'en_US',
    }),
  });
  const result = data && data.result;
  if (!result || !result.id || !result.token) {
    throw new AccountError('Cloudflare returned a malformed registration response (missing client id or token).');
  }
  return { id: result.id, token: result.token };
}

/** PATCH /reg/:id — enables WARP on the registration; returns the full config. */
export async function enableWarp(clientId, token) {
  return cfFetch(`${CF_BASE}/reg/${clientId}`, {
    method: 'PATCH',
    headers: { ...CF_HEADERS, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ warp_enabled: true }),
  });
}

// ---- Account record (pure) ----

/**
 * Snapshot the account material out of the enableWarp response. This record
 * IS what gets stored in the ACCOUNT KV binding and what subscription
 * renderers consume. Throws AccountError with a readable message when the
 * response does not carry the expected shape.
 */
export function extractAccountRecord(warp, keypair, { clientId, token, now = () => Date.now() } = {}) {
  const result = warp && warp.result;
  const config = result && result.config;
  const peer = config && config.peers && config.peers[0];
  const iface = config && config.interface;

  if (!config || !peer || typeof peer.public_key !== 'string' || !peer.public_key) {
    throw new AccountError('Cloudflare returned a malformed account response (missing peer public key). Try again.');
  }
  if (!iface || !iface.addresses || typeof iface.addresses.v4 !== 'string' || !iface.addresses.v4) {
    throw new AccountError('Cloudflare returned a malformed account response (missing interface address). Try again.');
  }
  if (typeof clientId !== 'string' || !clientId || typeof token !== 'string' || !token) {
    throw new AccountError('Cloudflare returned a malformed account response (missing client id or token).');
  }

  return {
    privateKey: keypair.privateKey,
    clientId,
    token,
    peerPublicKey: peer.public_key,
    v4: iface.addresses.v4,
    v6: typeof iface.addresses.v6 === 'string' ? iface.addresses.v6 : '',
    reserved: typeof config.client_id === 'string' ? config.client_id : '',
    source: 'register',
    verified: false, // ticket 10: register/rotate never soft-check; only imports carry verdicts
    verifiedAt: null,
    registeredAt: new Date(now()).toISOString(),
  };
}

const REQUIRED_FIELDS = ['privateKey', 'peerPublicKey', 'v4', 'registeredAt'];
const OPTIONAL_STRING_FIELDS = ['v6', 'reserved'];
// Conf imports carry no credentials — stored as null. Nullable now (ticket 10);
// register/rotate records never have null here.
const NULLABLE_STRING_FIELDS = ['clientId', 'token'];

/** Shape check for records read back from KV (corrupt/foreign values → null). */
export function isValidAccountRecord(record) {
  if (!record || typeof record !== 'object') return false;
  for (const f of REQUIRED_FIELDS) {
    if (typeof record[f] !== 'string' || record[f] === '') return false;
  }
  for (const f of NULLABLE_STRING_FIELDS) {
    const v = record[f];
    if (v !== null && (typeof v !== 'string' || v === '')) return false;
  }
  for (const f of OPTIONAL_STRING_FIELDS) {
    if (typeof record[f] !== 'string') return false;
  }
  if (Number.isNaN(new Date(record.registeredAt).getTime())) return false;
  // ticket 10 fields — required on new records, tolerated as absent on
  // pre-import records stored by earlier ticket-02 deploys (legacy compat:
  // an existing account must survive the upgrade, not read as corrupt).
  if (record.source !== undefined && record.source !== 'register' && record.source !== 'import') return false;
  if (record.verified !== undefined && typeof record.verified !== 'boolean') return false;
  if (record.verifiedAt !== undefined && record.verifiedAt !== null && Number.isNaN(new Date(record.verifiedAt).getTime())) return false;
  return true;
}

/**
 * The non-sensitive view the panel card renders. Never exposes privateKey /
 * clientId / token; the verdict fields (ticket 10) are safe to show. Legacy
 * records without source/verified (pre-import deploys) read as registered /
 * unverified.
 */
export function publicAccount(record) {
  return {
    registeredAt: record.registeredAt,
    v4: record.v4,
    source: record.source === 'import' ? 'import' : 'register',
    verified: record.verified === true,
    verifiedAt: record.verifiedAt || null,
  };
}

// ---- KV helpers (binding injected; fake-friendly for tests) ----

/** Read the stored account; null when absent, corrupt or malformed. */
export async function readAccount(binding) {
  if (!binding) return null;
  const raw = await binding.get(ACCOUNT_KV_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    return isValidAccountRecord(record) ? record : null;
  } catch {
    return null;
  }
}

/** Fail fast when the ACCOUNT binding is not configured (before network). */
export function assertAccountBinding(binding) {
  if (!binding) {
    throw new AccountError('ACCOUNT KV binding is missing — add a kv_namespaces entry named ACCOUNT (see wrangler.jsonc).');
  }
}

/** Persist the account record. Call ONLY after the registration succeeded. */
export async function writeAccount(binding, record) {
  assertAccountBinding(binding);
  await binding.put(ACCOUNT_KV_KEY, JSON.stringify(record));
}

export async function deleteAccount(binding) {
  if (!binding) return;
  await binding.delete(ACCOUNT_KV_KEY);
}

// ---- Error mapping ----

/** Map any thrown error to an operator-readable message. */
export function describeAccountError(err) {
  if (err instanceof AccountError) return err.message;
  if (err && err.name === 'AbortError') return 'Timed out after 10 s waiting for Cloudflare. Try again.';
  if (err instanceof TypeError) return 'Network error while reaching api.cloudflareclient.com. Try again.';
  const status = err && err.status;
  if (status === 429) return cfStatusMessage(429);
  if (typeof status === 'number' && status >= 400) return cfStatusMessage(status);
  return err && err.message ? err.message : 'Unknown registration error.';
}

/**
 * The full Register/Rotate flow: fresh keypair → /reg → enable WARP → record.
 * Returns the account record; callers persist it with writeAccount().
 */
export async function registerAccount({ now = () => Date.now() } = {}) {
  const keypair = await generateKeyPair();
  const { id, token } = await registerClient(keypair.publicKey);
  const warp = await enableWarp(id, token);
  return extractAccountRecord(warp, keypair, { clientId: id, token, now });
}