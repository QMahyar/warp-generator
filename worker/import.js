/**
 * WARP account import module (ticket 10) — parsers, soft verification, flow.
 *
 * The panel's Import action accepts an existing WARP account in one of two
 * formats and auto-detects between them:
 *
 *   - WireGuard .conf (official app / wgcf export): `[Interface]` PrivateKey
 *     (base64) + Address (one or two CIDRs — v4 and/or v6) + optional DNS;
 *     `[Peer]` PublicKey + AllowedIPs. Everything else is ignored —
 *     deliberately including Endpoint: the panel's endpoint list rules which
 *     servers configs use (spec §Endpoint semantics).
 *
 *   - registration JSON (warp-reg style): the registerClient `result` object
 *     (id, token) plus the enableWarp config — `interface.addresses`
 *     (v4/v6), `interface.private_key` (the *client's* own key, which lives
 *     with the operator and must be pasted along), `peers[].public_key`,
 *     and reserved from `config.client_id` (base64, mirroring
 *     extractAccountRecord's field choice) or a `reserved` field (bytes
 *     array / base64 string). Either the `{result:{...}}` wrapper or the
 *     unwrapped result object is accepted.
 *
 * Both parse to the same record shape as Register/Rotate (see account.js)
 * plus source:'import', verified and verifiedAt — and since ticket 01 the
 * flow does NOT write KV: the caller (worker/index.js) splices the returned
 * record into the state snapshot (append for a new account, replace for an
 * existing slot). Soft verification: imports carrying BOTH a client id and a
 * token are checked against Cloudflare's `GET /reg/<id>` (same base URL
 * family, okhttp UA and 10 s timeout as registerClient). 2xx → verified,
 * anything else (HTTP rejection, network error, timeout) → failed — the
 * verdict is stored and the card shows it; a failed check NEVER blocks the
 * store. Conf-only imports have no credentials: stored unverified, no
 * network call.
 */

import { Buffer } from 'buffer';
import { AccountError } from './account.js';

const CF_BASE = 'https://api.cloudflareclient.com/v0i1909051800';
const CF_HEADERS = { 'User-Agent': 'okhttp/3.12.1' };
const CF_TIMEOUT_MS = 10000; // same 10 s ceiling as registerAccount

// ---- shared key checks ----

const BASE64_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * WireGuard keys are 32 raw bytes, standard base64 (WARP keys come from the
 * API as such; base64url variants are normalized for wgcf-style exports).
 * Throws a readable AccountError on anything else.
 */
function requireKey(value, what, missingMessage = `${what} is missing.`) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AccountError(missingMessage);
  }
  if (!BASE64_RE.test(value.trim())) {
    throw new AccountError(`${what} is not valid base64 (expected a WireGuard key).`);
  }
  const key = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const raw = Buffer.from(key, 'base64');
  if (raw.length !== 32) {
    throw new AccountError(`${what} is not a valid WireGuard key — expected 32 bytes, got ${raw.length}.`);
  }
  return key;
}

// ---- conf parser ----

/**
 * Parse a WireGuard `.conf` (official app / wgcf export). Returns the
 * account material; throws AccountError with a readable message on any
 * missing required part. Endpoint / MTU / PersistentKeepalive / comments /
 * junk lines are ignored (Endpoint deliberately — the panel's endpoint list
 * rules). The first [Peer] is the WARP peer; extra peers are ignored.
 */
export function parseWgConf(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new AccountError('Empty input — paste a WireGuard .conf or a registration JSON.');
  }
  let section = null;
  const iface = { privateKey: '', addressV4: '', addressV6: '', dns: null };
  let peer = null;
  let allowedIPs = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const head = line.match(/^\[([^\]]+)\]$/);
    if (head) {
      section = head[1].trim().toLowerCase();
      if (section === 'peer' && peer) section = '_peer-skipped'; // extra peers ignored
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue; // junk line — ignored
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (section === 'interface') {
      if (key === 'privatekey' && !iface.privateKey) iface.privateKey = value;
      else if (key === 'address' && !iface.addressV4 && !iface.addressV6) {
        const { v4, v6 } = parseConfAddresses(value);
        iface.addressV4 = v4; iface.addressV6 = v6;
      }
      else if (key === 'dns' && iface.dns === null) iface.dns = value;
    } else if (section === 'peer') {
      if (key === 'publickey') peer = value;
      else if (key === 'allowedips' && allowedIPs === null) allowedIPs = value;
      // Endpoint and everything else deliberately ignored.
    }
  }

  const privateKey = requireKey(iface.privateKey, 'The [Interface] PrivateKey',
    'Missing [Interface] PrivateKey — base64 key expected.');
  if (!iface.addressV4) {
    throw new AccountError('Missing [Interface] Address — expected an IPv4 address such as "Address = 172.16.0.2/32" (a v6 address may follow it).');
  }
  if (!peer || !peer.trim()) {
    throw new AccountError('Missing [Peer] PublicKey — the WARP server public key is required. Is this a WARP conf?');
  }
  const peerPublicKey = requireKey(peer, 'The [Peer] PublicKey');

  return {
    format: 'conf',
    clientId: null,
    token: null,
    privateKey,
    peerPublicKey,
    v4: iface.addressV4,
    v6: iface.addressV6,
    reserved: '',
    dns: iface.dns,
    allowedIPs,
  };
}

/** Split the Address value into the first v4 and first v6 address (CIDR masks dropped). */
function parseConfAddresses(value) {
  let v4 = '';
  let v6 = '';
  for (const token of value.split(/[\s,]+/)) {
    if (!token) continue;
    const addr = token.split('/')[0];
    if (addr.includes(':')) { if (!v6) v6 = addr; }
    else if (!v4) v4 = addr;
  }
  return { v4, v6 };
}

// ---- JSON parser ----

/**
 * Parse the registration JSON (warp-reg style): the registerClient `result`
 * object plus the enableWarp config, either as `{result:{id,token,config}}`
 * or unwrapped `{id,token,config}`. Accepts:
 *   - id / token            — optional (missing → null → unverified)
 *   - config.interface.addresses.v4 / v6 — v4 required
 *   - config.interface.private_key — required (the client's own key lives
 *                             with the operator — the real enableWarp
 *                             response never carries it; a top-level
 *                             `private_key` beside id/token is accepted
 *                             too, for tooling that exports it there)
 *   - config.peers[0].public_key — required (first peer, like
 *                             extractAccountRecord)
 *   - reserved               — config.client_id (base64, mirroring
 *                             extractAccountRecord), or a `reserved` field
 *                             (bytes array [a,b,c] or base64 string);
 *                             missing → '' (renderers derive [0,0,0])
 */
export function parseRegistrationJson(text) {
  let doc;
  try { doc = JSON.parse(text); }
  catch {
    throw new AccountError('Not valid JSON — expected the registration JSON from warp-reg ({"result":{id,token,config:{interface,peers}}}).');
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new AccountError('Not a registration JSON — expected an object with a "config" field (warp-reg style).');
  }
  const base = doc.result && typeof doc.result === 'object' && !Array.isArray(doc.result) && doc.result.config ? doc.result : doc;
  const config = base.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new AccountError('Missing the enableWarp config — expected JSON like {"result":{id,token,config:{interface:{addresses,private_key},peers:[{public_key}]}}}.');
  }
  const iface = config.interface;
  const addresses = iface && iface.addresses;
  const v4 = addresses && typeof addresses.v4 === 'string' ? addresses.v4.trim() : '';
  const v6 = addresses && typeof addresses.v6 === 'string' ? addresses.v6.trim() : '';
  if (!v4) {
    throw new AccountError('Missing interface.addresses.v4 — the WARP client address is required.');
  }
  const peers = Array.isArray(config.peers) && config.peers.length ? config.peers : [];
  const peer = peers.find((p) => p && typeof p.public_key === 'string' && p.public_key);
  if (!peer) {
    throw new AccountError('Missing peers[].public_key — the WARP server public key is required.');
  }
  const privateKey = requireKey(
    (iface && iface.private_key) || (typeof base.private_key === 'string' ? base.private_key.trim() : ''),
    'The interface.private_key',
    'Missing interface.private_key — the client\'s own key lives with the operator; paste it into the JSON (or import the .conf instead).');
  const clientId = typeof base.id === 'string' && base.id ? base.id : null;
  const token = typeof base.token === 'string' && base.token ? base.token : null;

  return {
    format: 'json',
    clientId,
    token,
    privateKey,
    peerPublicKey: peer.public_key,
    v4,
    v6,
    reserved: extractReserved(config),
  };
}

/**
 * Reserved material → the record's base64 string field (mirroring
 * extractAccountRecord's config.client_id choice). Missing → '' — the
 * renderers' reservedToBytes('') yields the [0,0,0] default.
 */
function extractReserved(config) {
  if (typeof config.client_id === 'string' && config.client_id) return config.client_id;
  const r = config.reserved;
  if (typeof r === 'string' && r) return r;
  if (Array.isArray(r)) {
    if (!r.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new AccountError('The "reserved" field must be 3 bytes (numbers 0–255) or a base64 string.');
    }
    return Buffer.from(r).toString('base64');
  }
  return '';
}

// ---- auto-detect ----

/**
 * Auto-detect the import format: JSON first (the warp-reg response begins
 * with `{`), then conf. A body that matches neither gets a readable error
 * listing both formats.
 */
export function parseImportText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new AccountError('Empty input — paste either a WireGuard .conf (official app / wgcf export) or the registration JSON from warp-reg.');
  }
  if (text.trim().startsWith('{')) return parseRegistrationJson(text);
  try {
    return parseWgConf(text);
  } catch (err) {
    if (err instanceof AccountError && !/^\[[^\]]+\]$/m.test(text)) {
      // No conf sections at all → the body matched neither format.
      throw new AccountError('Unrecognized input — expected a WireGuard .conf ([Interface] PrivateKey + Address, [Peer] PublicKey) or the registration JSON from warp-reg ({"result":{id,token,config:{interface,peers}}}).');
    }
    throw err;
  }
}

// ---- soft verification ----

/**
 * Soft-verify credentials against Cloudflare's `GET /reg/<id>` (same base
 * URL family, okhttp UA and 10 s timeout as registerClient). 2xx → verified;
 * HTTP rejection, network error or timeout → failed. NEVER throws — the
 * verdict is recorded and the store proceeds either way. Without BOTH id
 * and token (conf imports): unverified, no network call.
 */
export async function verifyAccountCredentials({ clientId, token, now = () => Date.now() } = {}) {
  if (!clientId || !token) return { verified: false, verifiedAt: null };
  const verifiedAt = new Date(now()).toISOString();
  let verified = false;
  try {
    const res = await fetch(`${CF_BASE}/reg/${clientId}`, {
      method: 'GET',
      headers: { ...CF_HEADERS, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CF_TIMEOUT_MS),
    });
    verified = res.ok; // 2xx only; 4xx/5xx → failed verdict
  } catch {
    verified = false; // network error / timeout → failed verdict, still stored
  }
  return { verified, verifiedAt };
}

// ---- record building + import flow ----

/**
 * The record for an import — same shape as Register/Rotate plus
 * source:'import', verified/verifiedAt. Missing fields default:
 * clientId/token → null, reserved → '' (renderers derive [0,0,0]),
 * registeredAt → the import time. Callers splice it into the snapshot.
 */
export function buildImportRecord(material, { now = () => Date.now() } = {}) {
  return {
    privateKey: material.privateKey,
    clientId: material.clientId ?? null,
    token: material.token ?? null,
    peerPublicKey: material.peerPublicKey,
    v4: material.v4,
    v6: material.v6 || '',
    reserved: material.reserved || '',
    source: 'import',
    verified: false,
    verifiedAt: null,
    registeredAt: new Date(now()).toISOString(),
  };
}

/**
 * The full Import flow, without the KV write: parse (auto-detect) → record →
 * soft verify (only when credentials exist; never throws). The CALLER splices
 * the returned record into the state snapshot (append for a new account,
 * replace for an existing slot — ticket 01). Returns { record, verdict }.
 * Parse errors throw and leave the caller's store untouched.
 */
export async function importAccountRecord(text, { now = () => Date.now() } = {}) {
  const material = parseImportText(text);
  const record = buildImportRecord(material, { now });
  const verdict = await verifyAccountCredentials({ clientId: record.clientId, token: record.token, now });
  record.verified = verdict.verified;
  record.verifiedAt = verdict.verifiedAt;
  return { record, verdict };
}