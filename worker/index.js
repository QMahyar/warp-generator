/**
 * Cloudflare Worker entry point.
 * Route map (ticket 01 + ticket 02 + ticket 09):
 *   - /api/generator (POST) — the session-gated single-config generator
 *                               (ticket 09): renders from the STORED account
 *                               (the state snapshot — never /reg), answers
 *                               in the legacy /api/generate response shape;
 *                               missing account → 503, unknown format → 400.
 *                               The legacy PUBLIC /api/generate GET/POST/
 *                               OPTIONS routes are REMOVED (they registered a
 *                               fresh WARP account per request — ADR 0002);
 *                               they fall through to the gate (anon → 401)
 *                               or ASSETS 404. The Next.js app still points
 *                               at /api/generate — its own route handler
 *                               (actively maintained), not this worker.
 *   - POST /api/auth/login    — password check (constant-time) → HMAC-signed
 *                               session cookie, 303 → /
 *   - POST /api/auth/logout   — clears the session cookie, 303 → /
 *   - GET  /api/accounts      — account card state ([] when none stored)
 *   - POST /api/accounts/register — register a WARP account, APPEND to the
 *                               state snapshot (label optional; registrations
 *                               spaced ~8 s — /reg rate-limits per IP)
 *   - POST /api/accounts/import — append a NEW account from pasted material
 *                               (conf or registration JSON, ticket 10
 *                               parsers): auto-detected, parsed, soft-
 *                               verified against Cloudflare when it carries
 *                               id+token (verdict stored, failure never
 *                               blocks), then snapshot-appended. Response:
 *                               { success, action, account, verdict }.
 *   - POST /api/accounts/:id/rotate — fresh registration replacing that
 *                               account only (keeps id + label)
 *   - POST /api/accounts/:id/import — replace that account only
 *                               ({ success, action, replaces: true, account,
 *                               verdict }; parse failure leaves it untouched)
 *   - POST /api/accounts/:id/rename — editable label ({ label })
 *   - POST /api/accounts/:id/delete — remove the account; subscriptions
 *                               pinned to it keep their URLs and return 503
 *                               until re-pinned
 *   - GET  /api/subs          — subscriptions card state (ticket 02): the
 *                               operator-facing rows (id, name,
 *                               tokenHashPrefix fingerprint, pinned account,
 *                               createdAt) — never the token or its hash
 *   - POST /api/subs          — create a subscription ({ name }): 32 random
 *                               bytes → 43-char base64url token, stored
 *                               ONLY as its SHA-256 hash; the raw token +
 *                               the full six-format link list are returned
 *                               in THIS response exactly once (the operator
 *                               copies them now; the card later shows only
 *                               the tokenHashPrefix fingerprint)
 *   - POST /api/subs/:id/rename — editable name ({ name }, trimmed, 1–60)
 *   - POST /api/subs/:id/pin — pin to an account ({ accountId }; null or
 *                               empty unpins; unknown account → 400).
 *                               Re-pin moves the sub without changing its URL
 *   - POST /api/subs/:id/reset-token — retire the old token (its links 404
 *                               after the cache window) and return the new
 *                               token + link list exactly once
 *   - POST /api/subs/:id/delete — remove the subscription
 *   - GET  /api/settings      — endpoints + AWG card state feed (ticket 03)
 *   - POST /api/settings/endpoints — save the endpoint list to ENDPOINTS KV
 *   - POST /api/settings/awg — toggle + params to AWG KV (off = absent)
 *  The six /api/<token>/sub* routes (ticket 03) resolve the submitted path
 *  token against the STATE snapshot (the KV binding renamed from ACCOUNT):
 *  sha256(submitted) constant-time compared with subs[].tokenHash — no
 *  match → 404 (never 401, so probing cannot distinguish real from fake
 *  paths). Sub found but its pinned account is missing (never pinned,
 *  unpinned, or deleted) → 503 missingAccount(). The SUB_PATH secret no
 *  longer exists: every subscription carries its own unguessable token,
 *  minted by the subs API and hashed at rest. Responses are cached 5 min
 *  at the edge (public, max-age=300, s-maxage=300); every non-200 sub
 *  response (404/503/405) carries an explicit Cache-Control: no-store.
 *  Registered before the auth gate — the token IS the credential.
 *   - GET  /api/<token>/sub — the subscription payload (ticket 04): base64
 *                               list of wireguard:// links (?scheme=wg for
 *                               Throne links). NO session — the path token
 *                               IS the credential (ADR 0006): the worker
 *                               SHA-256-hashes the submitted token and
 *                               constant-time compares it against the
 *                               snapshot's subs[].tokenHash; no match → 404
 *                               (never 401, so probing cannot distinguish
 *                               real from fake paths). Sub found but its
 *                               pinned account is missing (deleted or
 *                               unpinned) → 503 missingAccount(). Reads the
 *                               STATE snapshot + ENDPOINTS in parallel.
 *                               Cached 5 min at the edge (public,
 *                               max-age=300, s-maxage=300); every non-200
 *                               sub response (404/503/405) carries an
 *                               explicit Cache-Control: no-store.
 *                               Registered before the auth gate.
 *   - GET  /api/<token>/sub/clash — raw Clash YAML (ticket 05): one
 *                               wireguard proxy per valid endpoint, minimal
 *                               proxy-groups/rules, amnezia-wg-option per
 *                               proxy when the stored AWG record is enabled.
 *                               Same no-session/token/404/5-min contract as
 *                               /sub; missing pinned account → 503.
 *   - GET  /api/<token>/sub/singbox — sing-box config.json (ticket 06):
 *                               the 1.13+ WireGuard endpoint shape by
 *                               default, the pre-1.13 outbound shape under
 *                               ?legacy=1 (NekoBox Android / Husi). Same
 *                               no-session/token/404/5-min contract;
 *                               missing pinned account → 503; AWG ignored
 *                               (not expressible).
 *   - GET  /api/<token>/sub/neko — NekoBox desktop links (ticket 07):
 *                               base64 of one `nekoray://custom#` link per
 *                               valid endpoint, each wrapping the NekoBox
 *                               CustomBean JSON with the sing-box
 *                               wireguard outbound (the legacy ticket-06
 *                               shape + §2.2 fields) as `cs`. Same
 *                               no-session/token/404/5-min contract;
 *                               missing pinned account → 503; AWG ignored
 *                               (not expressible).
 *   - GET  /api/<token>/sub/wg — ZIP of one .conf per valid endpoint
 *                               (ticket 08): storeless archive for the
 *                               official WireGuard app (imports a .zip of
 *                               confs, §2.6). Plain WG confs by default;
 *                               AmneziaWG confs (Jc/Jmin/Jmax/S1–S4/H1–H4/
 *                               I1–I5 lines) when the stored AWG record is
 *                               enabled. Same no-session/token/404/5-min
 *                               contract; missing pinned account → 503;
 *                               Content-Type application/zip.
 *   - GET  /api/<token>/sub/awg — awg:// links (ticket 08): base64 of
 *                               one `awg://<base64url conf>#name` link per
 *                               valid endpoint (community scheme §2.5) for
 *                               LxBox/INCY-style clients. The conf always
 *                               carries AWG params (stored record, or the
 *                               legacy defaults when off/absent). Same
 *                               no-session/token/404/5-min contract;
 *                               missing pinned account → 503.
 *   - everything else         — password-gated: unauthenticated requests get
 *                               the login page (HTML) or 401 (any /api/*);
 *                               authenticated requests get the panel shell at
 *                               "/" and gated static assets (ASSETS binding)
 *                               elsewhere.
 * The account routes are the ONLY writers of the state snapshot (ticket 01:
 * accounts + subs in one KV key); register/rotate/import writes happen
 * strictly after the Cloudflare calls (or import parse+verify) succeed.
 * The settings routes are the ONLY writers of ENDPOINTS and AWG (see
 * settings.js).
 * PASSWORD comes from the environment (env.PASSWORD). Set it with
 * `wrangler secret put PASSWORD` (see wrangler.jsonc for the local-dev
 * placeholder).
 */

import { handleGeneratePost } from './generate.js';
import {
  AccountError,
  describeAccountError,
  publicAccount,
  registerAccount,
  registrationWaitMs,
} from './account.js';
import { importAccountRecord } from './import.js';
import {
  accountById,
  appendAccount,
  appendSub,
  hashToken,
  lookupSubByToken,
  makeSubToken,
  mutateState,
  pinSub,
  publicAccounts,
  publicSubs,
  readState,
  removeAccount,
  removeSub,
  renameAccount,
  renameSub,
  replaceAccount,
  resetSubToken,
  StateError,
  subById,
  validateLabel,
} from './state.js';
import {
  clearSessionCookie,
  issueSession,
  parseCookies,
  sessionCookieHeader,
  verifyPassword,
  verifySession,
  SESSION_COOKIE,
} from './auth.js';
import {
  parseAwgParams,
  parseEndpointList,
  readAwg,
  readEndpoints,
  SettingsError,
  writeAwg,
  writeEndpoints,
} from './settings.js';
import { renderSubscription } from './sub.js';
import { loginPage, panelShell } from './panel.js';

// NOTE: no Response/async/crypto work at module scope — the Workers
// runtime rejects those outside a handler (error 10021).
function methodNotAllowed() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ---- Subs API (ticket 02) — all behind the auth gate ----

/** The six subscription URLs for a token (ADR 0006: the path IS the
 * credential — returned to the operator only, exactly once, at create/
 * reset time; the card otherwise shows only the fingerprint). */
function subLinks(origin, token) {
  const base = `${origin}/api/${token}/sub`;
  return [
    { id: 'wg', name: 'v2rayN family', description: 'wireguard:// links', href: base },
    { id: 'throne', name: 'Throne', description: 'wg:// links', href: `${base}?scheme=wg` },
    { id: 'clash', name: 'Clash', description: 'YAML proxy list', href: `${base}/clash` },
    { id: 'singbox', name: 'sing-box', description: 'JSON profile', href: `${base}/singbox` },
    { id: 'neko', name: 'NekoBox desktop', description: 'nekoray:// links', href: `${base}/neko` },
    { id: 'wg-zip', name: 'WireGuard app', description: 'zip of .conf files', href: `${base}/wg` },
    { id: 'awg', name: 'awg:// clients (LxBox, INCY)', description: 'awg:// links', href: `${base}/awg` },
  ];
}

function requestOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

/** GET /api/subs — the subs card payload (fingerprint, never the token). */
async function handleGetSubs(request, env) {
  if (request.method !== 'GET') return methodNotAllowed();
  const state = await readState(env.STATE);
  return json({ success: true, subs: state ? publicSubs(state) : [] });
}

/**
 * POST /api/subs — create a subscription: 32 random bytes → 43-char
 * base64url token, stored ONLY as its SHA-256 hash. The raw token leaves
 * this handler in the response exactly once, with the full six-format link
 * list, so the operator can copy the links now.
 */
async function handleCreateSub(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  let body = {};
  try { body = await readJsonOrFormBody(request); } catch { /* body optional */ }
  try {
    const token = makeSubToken();
    const tokenHash = await hashToken(token);
    const state = await mutateState(env.STATE, (s) => { appendSub(s, { name: body.name, tokenHash }); });
    const sub = state.subs[state.subs.length - 1];
    return json({ success: true, sub: { id: sub.id, name: sub.name, token, links: subLinks(requestOrigin(request), token) } });
  } catch (err) {
    return accountErrorResponse(err);
  }
}

/** POST /api/subs/:id/rename|pin|reset-token|delete — per-sub actions. */
async function handleSubAction(request, env, subId, action) {
  if (request.method !== 'POST') return methodNotAllowed();
  const state0 = await readState(env.STATE);
  if (!state0 || !subById(state0, subId)) {
    return json({ success: false, message: 'Subscription not found.' }, 404);
  }
  let body = {};
  try { body = await readJsonOrFormBody(request); } catch { /* body optional */ }
  try {
    if (action === 'rename') {
      const state = await mutateState(env.STATE, (s) => { renameSub(s, subId, body.name); });
      return json({ success: true, sub: publicSubs(state).find((x) => x.id === subId) });
    }
    if (action === 'pin') {
      const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : null;
      const state = await mutateState(env.STATE, (s) => { pinSub(s, subId, accountId); });
      return json({ success: true, sub: publicSubs(state).find((x) => x.id === subId) });
    }
    if (action === 'reset-token') {
      const token = makeSubToken();
      const tokenHash = await hashToken(token);
      const state = await mutateState(env.STATE, (s) => { resetSubToken(s, subId, tokenHash); });
      const sub = subById(state, subId);
      return json({ success: true, sub: { id: sub.id, name: sub.name, token, links: subLinks(requestOrigin(request), token) } });
    }
    if (action === 'delete') {
      await mutateState(env.STATE, (s) => { removeSub(s, subId); });
      return json({ success: true });
    }
    return methodNotAllowed();
  } catch (err) {
    return accountErrorResponse(err);
  }
}

// ---- Accounts API (ticket 01) — all behind the auth gate ----

// /reg rate-limits per IP: never two registrations back-to-back (ticket 05
// keeps the network side current; this guard spaces panel actions).
let lastRegistrationAt = 0;

function registrationThrottled() {
  const wait = registrationWaitMs(lastRegistrationAt);
  if (wait <= 0) return null;
  return `Cloudflare rate-limits back-to-back registrations — try again in ${Math.ceil(wait / 1000)} s.`;
}

/** Test hook (same convention as generate.js `__setQrCodeImpl`): clears the
 * module-level throttle so tests can exercise register/rotate repeatedly. */
export function __resetRegistrationThrottle() {
  lastRegistrationAt = 0;
}

function accountErrorResponse(err) {
  if (err instanceof AccountError) return json({ success: false, message: describeAccountError(err) }, err.status || 500);
  if (err instanceof StateError) return json({ success: false, message: err.message }, 400);
  return json({ success: false, message: err && err.message ? err.message : 'Request failed.' }, 500);
}

/** GET /api/accounts — the accounts card payload (never the keys). */
async function handleGetAccounts(request, env) {
  if (request.method !== 'GET') return methodNotAllowed();
  const state = await readState(env.STATE);
  return json({ success: true, accounts: state ? publicAccounts(state) : [] });
}

/**
 * POST /api/accounts/register — register a new WARP account and APPEND it
 * to the snapshot. Network first, KV write last (mutateState); a failed
 * registration leaves the store untouched. Spaced by the throttle guard.
 */
async function handleAccountRegister(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  const throttled = registrationThrottled();
  if (throttled) return json({ success: false, message: throttled }, 429);
  let body = {};
  try { body = await readJsonOrFormBody(request); } catch { /* body optional */ }
  try {
    const record = await registerAccount();
    lastRegistrationAt = Date.now();
    const state = await mutateState(env.STATE, (s) => { appendAccount(s, record, { label: body.label }); });
    const entry = state.accounts[state.accounts.length - 1];
    return json({ success: true, action: 'register', account: publicEntry(entry) });
  } catch (err) {
    return accountErrorResponse(err);
  }
}

/** The panel-safe view of one snapshot entry (id/label + safe fields). */
function publicEntry(entry) {
  return { id: entry.id, label: entry.label, ...publicAccount(entry) };
}

/**
 * POST /api/accounts/import — append a NEW account from pasted material
 * (conf or registration JSON). KV write strictly after parse (+ soft
 * verify) succeeds; parse errors leave the store untouched.
 */
async function handleAccountImport(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  let body;
  try {
    body = await readJsonOrFormBody(request);
  } catch {
    return json({ success: false, message: 'Could not read the request body.' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return json({ success: false, message: 'Empty input — paste a WireGuard .conf or the registration JSON from warp-reg.' }, 400);
  }
  if (text.length > 65536) {
    return json({ success: false, message: 'Input too large — a .conf or registration JSON is a few kilobytes.' }, 400);
  }
  try {
    const { record, verdict } = await importAccountRecord(text);
    const state = await mutateState(env.STATE, (s) => { appendAccount(s, record, { label: body.label }); });
    const entry = state.accounts[state.accounts.length - 1];
    return json({ success: true, action: 'import', account: publicEntry(entry), verdict });
  } catch (err) {
    if (err instanceof AccountError) return json({ success: false, message: err.message }, 400);
    return json({ success: false, message: err instanceof StateError ? err.message : 'Failed to import the account.' }, 500);
  }
}

/**
 * POST /api/accounts/:id/rotate|import|rename|delete — the per-account
 * actions. Rotate replaces that record (keeps id + label); import replaces
 * that slot only; rename edits the label; delete removes the entry (subs
 * pinned to it keep their URLs and return 503 until re-pinned).
 */
async function handleAccountById(request, env, accountId, action) {
  if (request.method !== 'POST') return methodNotAllowed();
  const state0 = await readState(env.STATE);
  if (!state0 || !accountById(state0, accountId)) {
    return json({ success: false, message: 'Account not found.' }, 404);
  }
  if (action === 'rotate') {
    const throttled = registrationThrottled();
    if (throttled) return json({ success: false, message: throttled }, 429);
  }
  let body = {};
  try { body = await readJsonOrFormBody(request); } catch { /* body optional */ }
  try {
    if (action === 'rotate') {
      const record = await registerAccount();
      lastRegistrationAt = Date.now();
      const state = await mutateState(env.STATE, (s) => { replaceAccount(s, accountId, record); });
      return json({ success: true, action: 'rotate', account: publicEntry(accountById(state, accountId)) });
    }
    if (action === 'import') {
      const text = typeof body.text === 'string' ? body.text : '';
      if (!text.trim()) return json({ success: false, message: 'Empty input — paste a WireGuard .conf or the registration JSON from warp-reg.' }, 400);
      if (text.length > 65536) return json({ success: false, message: 'Input too large — a .conf or registration JSON is a few kilobytes.' }, 400);
      const { record, verdict } = await importAccountRecord(text);
      const state = await mutateState(env.STATE, (s) => { replaceAccount(s, accountId, record); });
      return json({ success: true, action: 'import', replaces: true, account: publicEntry(accountById(state, accountId)), verdict });
    }
    if (action === 'rename') {
      const label = validateLabel(body.label);
      const state = await mutateState(env.STATE, (s) => { renameAccount(s, accountId, label); });
      return json({ success: true, account: publicEntry(accountById(state, accountId)) });
    }
    if (action === 'delete') {
      await mutateState(env.STATE, (s) => { removeAccount(s, accountId); });
      return json({ success: true });
    }
    return methodNotAllowed();
  } catch (err) {
    return accountErrorResponse(err);
  }
}

/** Login form posts urlencoded by default; JSON is accepted for API callers. */
async function readJsonOrFormBody(request) {
  const text = await request.text();
  if (!text) return {};
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { return JSON.parse(text); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!env.PASSWORD) {
    return new Response(null, { status: 303, headers: { Location: '/?error=config' } });
  }
  const body = await readJsonOrFormBody(request);
  const ok = await verifyPassword(String(body.password ?? ''), env.PASSWORD);
  if (!ok) {
    return new Response(null, { status: 303, headers: { Location: '/?error=invalid' } });
  }
  const token = await issueSession(env.PASSWORD);
  const secure = request.url.startsWith('https:');
  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Set-Cookie': sessionCookieHeader(token, { secure }) },
  });
}

async function handleLogout(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  const secure = request.url.startsWith('https:');
  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Set-Cookie': clearSessionCookie({ secure }) },
  });
}

// ---- Settings API (ticket 03) ----

/** GET /api/settings — state feed for the endpoints + AWG cards. */
async function handleGetSettings(request, env) {
  if (request.method !== 'GET') return methodNotAllowed();
  const endpoints = await readEndpoints(env.ENDPOINTS);
  const awg = await readAwg(env.AWG);
  return json({ success: true, settings: { endpoints, awg } });
}

/**
 * POST /api/settings/endpoints — save the endpoint list verbatim (canonical
 * form; see settings.js). Malformed lines are flagged, never blocking the
 * valid ones.
 */
async function handleSaveEndpoints(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  try {
    const body = await readJsonOrFormBody(request);
    if (typeof body.text !== 'string') {
      return json({ success: false, message: 'Expected a JSON body with a "text" field.' }, 400);
    }
    const endpoints = await writeEndpoints(env.ENDPOINTS, body.text);
    return json({ success: true, endpoints });
  } catch (err) {
    return json({ success: false, message: err instanceof SettingsError ? err.message : 'Failed to save endpoints.' }, 500);
  }
}

/**
 * POST /api/settings/awg — toggle + params. Body: `{ enabled: true, Jc, …, I5 }`
 * (flat, conf-named fields). Off → the AWG key is deleted (absent from KV).
 */
async function handleSaveAwg(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  try {
    const body = await readJsonOrFormBody(request);
    const { awg, invalid } = parseAwgParams(body);
    const saved = await writeAwg(env.AWG, awg);
    return json({ success: true, awg: saved, invalid });
  } catch (err) {
    return json({ success: false, message: err instanceof SettingsError ? err.message : 'Failed to save AmneziaWG settings.' }, 500);
  }
}

const SUB_CACHE_CONTROL = 'public, max-age=300, s-maxage=300'; // 5 min at the edge (re-pin lag bound)

function notFound() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function missingAccount() {
  return new Response(
    JSON.stringify({ error: 'No WARP account registered yet — open the panel and run Register first.' }),
    { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
}

/**
 * Shared core for the six subscription routes (tickets 04–08): method
 * gate, STATE + ENDPOINTS reads in parallel, token resolution against the
 * snapshot (lookupSubByToken → 404 on mismatch, missing pinned account →
 * 503), renderer dispatch and the 5 min cache envelope. `opts` are the
 * renderer options derived from URL query params (scheme/legacy);
 * `needsAwg` additionally reads the AWG record for the renderers that can
 * express it (clash, wg-zip, awg).
 */
async function handleSubFormat(request, env, url, format, token, { needsAwg = false, opts = {} } = {}) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const [state, stored, awg] = await Promise.all([
    readState(env.STATE),
    readEndpoints(env.ENDPOINTS),
    needsAwg ? readAwg(env.AWG) : null,
  ]);
  const sub = state ? await lookupSubByToken(state, token) : null;
  if (!sub) return notFound();
  const account = sub.accountId ? accountById(state, sub.accountId) : null;
  if (!account) return missingAccount();
  const endpoints = stored ? parseEndpointList(stored.text).endpoints : []; // null when absent/empty — fallback territory
  const { body, contentType } = renderSubscription(format, opts, { account, endpoints, awg });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': SUB_CACHE_CONTROL },
  });
}

/**
 * GET /api/<token>/sub — the subscription payload (ticket 04).
 * No session — the path token IS the credential (ADR 0006); the router
 * captures it and handleSubFormat resolves it against the snapshot (404
 * on mismatch). Reads STATE + ENDPOINTS from KV only (never the network):
 * account record in, links out. Missing pinned account → 503 with a
 * readable message. AWG is ignored by the link formats (the Throne junk
 * params are legacy parity, not settings).
 */
async function handleSub(request, env, url, token) {
  return handleSubFormat(request, env, url, 'sub', token, { opts: { scheme: url.searchParams.get('scheme') } });
}

/**
 * GET /api/<token>/sub/clash — the Clash YAML subscription (ticket 05).
 * Adds the AWG record read (per-proxy amnezia-wg-option when the stored
 * record is enabled and carries params; absent → no option).
 */
async function handleSubClash(request, env, token) {
  return handleSubFormat(request, env, null, 'clash', token, { needsAwg: true });
}

/**
 * GET /api/<token>/sub/singbox — the sing-box config.json subscription
 * (ticket 06). Same contract as handleSub/handleSubClash; `?legacy=1`
 * selects the pre-1.13 wireguard outbound shape (default: the 1.13+
 * endpoint shape). AWG is not expressible in sing-box — the KV read is
 * skipped entirely (same decision as handleSub).
 */
async function handleSubSingbox(request, env, url, token) {
  return handleSubFormat(request, env, url, 'singbox', token, { opts: { legacy: url.searchParams.get('legacy') } });
}

/**
 * GET /api/<token>/sub/neko — the NekoBox desktop subscription (ticket
 * 07): base64 of one `nekoray://custom#` link per valid endpoint, each
 * wrapping the NekoBox CustomBean JSON (cs = the sing-box wireguard
 * outbound — the legacy ticket-06 shape plus the §2.2 fields). Same
 * contract as handleSub/handleSubClash; AWG is not expressible in the
 * wrapped outbound — the KV read is skipped (same decision as handleSub).
 */
async function handleSubNeko(request, env, token) {
  return handleSubFormat(request, env, null, 'neko', token);
}

/**
 * GET /api/<token>/sub/wg — the WireGuard-app ZIP subscription (ticket
 * 08): one .conf per valid endpoint (plain WG, or AmneziaWG with J/S/H/I
 * lines when the stored AWG record is enabled). The renderer returns
 * binary (Uint8Array), which Response passes through as application/zip.
 */
async function handleSubWg(request, env, token) {
  return handleSubFormat(request, env, null, 'wg', token, { needsAwg: true });
}

/**
 * GET /api/<token>/sub/awg — the awg:// links subscription (ticket 08):
 * base64 of one `awg://<base64url conf>#name` link per valid endpoint.
 * The conf carries AWG params only when the stored record is enabled
 * (off → plain confs, like the wg-zip renderer) — see renderAwg.
 */
async function handleSubAwg(request, env, token) {
  return handleSubFormat(request, env, null, 'awg', token, { needsAwg: true });
}

async function isAuthorized(request, env) {
  if (!env.PASSWORD) return false; // unconfigured: everything stays gated
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  return verifySession(cookies[SESSION_COOKIE], env.PASSWORD);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Auth endpoints (reachable without a session).
    if (url.pathname === '/api/auth/login') return handleLogin(request, env);
    if (url.pathname === '/api/auth/logout') return handleLogout(request, env);

    // Subscription routes (tickets 04–08) — BEFORE the auth gate:
    // no session, the path token IS the credential. The token group is
    // captured and resolved against the STATE snapshot inside the handler
    // (wrong/missing token → 404, never 401 — the route's existence stays
    // indistinguishable). The sub-format routes are matched before the
    // generic `/sub` pattern (the regexes are disjoint anyway).
    const clashMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/clash\/?$/);
    if (clashMatch) return handleSubClash(request, env, clashMatch[1]);
    const singboxMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/singbox\/?$/);
    if (singboxMatch) return handleSubSingbox(request, env, url, singboxMatch[1]);
    const nekoMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/neko\/?$/);
    if (nekoMatch) return handleSubNeko(request, env, nekoMatch[1]);
    const wgZipMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/wg\/?$/);
    if (wgZipMatch) return handleSubWg(request, env, wgZipMatch[1]);
    const awgMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/awg\/?$/);
    if (awgMatch) return handleSubAwg(request, env, awgMatch[1]);
    const subMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/?$/);
    if (subMatch) return handleSub(request, env, url, subMatch[1]);

    // Everything else is password-gated (ticket 01).
    if (!(await isAuthorized(request, env))) {
      if (url.pathname.startsWith('/api/')) return unauthorized();
      return html(loginPage({ error: url.searchParams.get('error') }));
    }

    // Generator API (ticket 09) — session-gated like the account/settings
    // routes; renders from the STORED account (never registers per request).
    if (url.pathname === '/api/generator') return handleGeneratePost(request, env);

    // Accounts API (ticket 01) — only reachable with a valid session.
    if (url.pathname === '/api/accounts') return handleGetAccounts(request, env);
    if (url.pathname === '/api/accounts/register') return handleAccountRegister(request, env);
    if (url.pathname === '/api/accounts/import') return handleAccountImport(request, env);
    const accountIdMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/(rotate|import|rename|delete)$/);
    if (accountIdMatch) return handleAccountById(request, env, accountIdMatch[1], accountIdMatch[2]);

    // Subs API (ticket 02) — only reachable with a valid session.
    if (url.pathname === '/api/subs') {
      return request.method === 'GET' ? handleGetSubs(request, env) : handleCreateSub(request, env);
    }
    const subIdMatch = url.pathname.match(/^\/api\/subs\/([^/]+)\/(rename|pin|reset-token|delete)$/);
    if (subIdMatch) return handleSubAction(request, env, subIdMatch[1], subIdMatch[2]);

    // Settings API (ticket 03) — session-gated like the account routes.
    if (url.pathname === '/api/settings') return handleGetSettings(request, env);
    if (url.pathname === '/api/settings/endpoints') return handleSaveEndpoints(request, env);
    if (url.pathname === '/api/settings/awg') return handleSaveAwg(request, env);

    // Authenticated: panel shell at the root, gated static assets elsewhere.
    if (url.pathname === '/') return html(panelShell({ origin: url.origin }));
    return env.ASSETS.fetch(request);
  },
};
