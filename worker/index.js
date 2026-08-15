/**
 * Cloudflare Worker entry point.
 * Route map (ticket 01 + ticket 02 + ticket 09):
 *   - /api/generator (POST) — the session-gated single-config generator
 *                               (ticket 09): renders from the STORED ACCOUNT
 *                               KV record (readAccount — never /reg), answers
 *                               in the legacy /api/generate response shape;
 *                               missing account → 503, unknown format → 400.
 *                               The legacy PUBLIC /api/generate GET/POST/
 *                               OPTIONS routes are REMOVED (they registered a
 *                               fresh WARP account per request — ADR 0002);
 *                               they fall through to the gate (anon → 401)
 *                               or ASSETS 404. The Next.js app still points
 *                               at /api/generate — it is unmaintained
 *                               (ADR 0004) and its generator page is dead.
 *   - POST /api/auth/login    — password check (constant-time) → HMAC-signed
 *                               session cookie, 303 → /
 *   - POST /api/auth/logout   — clears the session cookie, 303 → /
 *   - GET  /api/account       — account card state (null when none stored)
 *   - POST /api/account/register — register a WARP account, store in ACCOUNT KV
 *   - POST /api/account/rotate   — fresh registration replacing the stored one
 *   - POST /api/account/import   — store an existing WARP account pasted as a
 *                               WireGuard .conf or registration JSON (ticket
 *                               10): auto-detected, parsed, soft-verified
 *                               against Cloudflare when it carries id+token
 *                               (verdict stored, failure never blocks), then
 *                               KV-written. Replaces the stored account on
 *                               receipt (the panel confirms first); a failed
 *                               parse leaves the existing account untouched.
 *                               Response: { success, action, replaces: true,
 *                               account, verdict }. Body: { text }.
 *   - GET  /api/settings      — endpoints + AWG card state feed (ticket 03)
 *   - POST /api/settings/endpoints — save the endpoint list to ENDPOINTS KV
 *   - POST /api/settings/awg — toggle + params to AWG KV (off = absent)
 *   - GET  /api/<SUB_PATH>/sub — the subscription payload (ticket 04): base64
 *                               list of wireguard:// links (?scheme=wg for
 *                               Throne links). NO session — the path token IS
 *                               the credential (ADR 0006); wrong/missing
 *                               token → 404 (never 401). Cached 6 h at the
 *                               edge. Registered before the auth gate.
 *   - GET  /api/<SUB_PATH>/sub/clash — raw Clash YAML (ticket 05): one
 *                               wireguard proxy per valid endpoint, minimal
 *                               proxy-groups/rules, amnezia-wg-option per
 *                               proxy when the stored AWG record is enabled.
 *                               Same no-session/token/404/6 h contract as
 *                               /sub; missing account → 503.
 *   - GET  /api/<SUB_PATH>/sub/singbox — sing-box config.json (ticket 06):
 *                               the 1.13+ WireGuard endpoint shape by
 *                               default, the pre-1.13 outbound shape under
 *                               ?legacy=1 (NekoBox Android / Husi). Same
 *                               no-session/token/404/6 h contract; missing
 *                               account → 503; AWG ignored (not
 *                               expressible).
 *   - GET  /api/<SUB_PATH>/sub/neko — NekoBox desktop links (ticket 07):
 *                               base64 of one `nekoray://custom#` link per
 *                               valid endpoint, each wrapping the NekoBox
 *                               CustomBean JSON with the sing-box
 *                               wireguard outbound (the legacy ticket-06
 *                               shape + §2.2 fields) as `cs`. Same
 *                               no-session/token/404/6 h contract; missing
 *                               account → 503; AWG ignored (not
 *                               expressible).
 *   - GET  /api/<SUB_PATH>/sub/wg — ZIP of one .conf per valid endpoint
 *                               (ticket 08): storeless archive for the
 *                               official WireGuard app (imports a .zip of
 *                               confs, §2.6). Plain WG confs by default;
 *                               AmneziaWG confs (Jc/Jmin/Jmax/S1–S4/H1–H4/
 *                               I1–I5 lines) when the stored AWG record is
 *                               enabled. Same no-session/token/404/6 h
 *                               contract; missing account → 503;
 *                               Content-Type application/zip.
 *   - GET  /api/<SUB_PATH>/sub/awg — awg:// links (ticket 08): base64 of
 *                               one `awg://<base64url conf>#name` link per
 *                               valid endpoint (community scheme §2.5) for
 *                               LxBox/INCY-style clients. The conf always
 *                               carries AWG params (stored record, or the
 *                               legacy defaults when off/absent). Same
 *                               no-session/token/404/6 h contract; missing
 *                               account → 503.
 *   - everything else         — password-gated: unauthenticated requests get
 *                               the login page (HTML) or 401 (any /api/*);
 *                               authenticated requests get the panel shell at
 *                               "/" and gated static assets (ASSETS binding)
 *                               elsewhere.
 * Register, Rotate and Import are the ONLY writers of the ACCOUNT binding;
 * the KV write happens strictly after the Cloudflare calls (or import
 * parse+verify) succeed (see account.js / import.js).
 * The settings routes are the ONLY writers of ENDPOINTS and AWG (see
 * settings.js).
 * PASSWORD comes from the environment (env.PASSWORD). Set it with
 * `wrangler secret put PASSWORD` (see wrangler.jsonc for the local-dev
 * placeholder).
 */

import { handleGeneratePost } from './generate.js';
import {
  AccountError,
  assertAccountBinding,
  describeAccountError,
  publicAccount,
  readAccount,
  registerAccount,
  writeAccount,
} from './account.js';
import { importAccount } from './import.js';
import {
  clearSessionCookie,
  issueSession,
  parseCookies,
  sessionCookieHeader,
  timingSafeEqualBytes,
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

/** GET /api/account — what the account card renders (never the keys). */
async function handleGetAccount(request, env) {
  if (request.method !== 'GET') return methodNotAllowed();
  const record = await readAccount(env.ACCOUNT);
  return json({ success: true, account: record ? publicAccount(record) : null });
}

/** POST /api/account/register|rotate — network first, KV write last. */
async function handleAccountAction(request, env, action) {
  if (request.method !== 'POST') return methodNotAllowed();
  try {
    assertAccountBinding(env.ACCOUNT); // fail fast — never burn a registration without a store
    const record = await registerAccount();
    await writeAccount(env.ACCOUNT, record); // only reached when CF calls succeeded
    return json({ success: true, action, account: publicAccount(record) });
  } catch (err) {
    const status = Number.isInteger(err && err.status) ? err.status : 500;
    return json({ success: false, message: describeAccountError(err) }, status);
  }
}

/**
 * POST /api/account/import — store an existing WARP account pasted as a
 * conf or registration JSON (ticket 10). Destructive-replace semantics: the
 * server replaces the stored account on receipt, like Rotate — the PANEL
 * confirms first (no separate parse endpoint; the client shows a confirm
 * dialog before POSTing and the response carries replaces: true). KV write
 * strictly after parse (+ optional soft verify) succeeds — a failed import
 * leaves the existing account untouched. Parse errors → 400 with the
 * parser's readable message.
 */
async function handleImportAccount(request, env) {
  if (request.method !== 'POST') return methodNotAllowed();
  let text;
  try {
    const body = await readJsonOrFormBody(request);
    if (typeof body.text !== 'string') {
      return json({ success: false, message: 'Expected a JSON body with a "text" field — paste a WireGuard .conf or registration JSON.' }, 400);
    }
    text = body.text;
    if (!text.trim()) {
      return json({ success: false, message: 'Empty input — paste a WireGuard .conf or the registration JSON from warp-reg.' }, 400);
    }
    if (text.length > 65536) {
      return json({ success: false, message: 'Input too large — a .conf or registration JSON is a few kilobytes.' }, 400);
    }
  } catch {
    return json({ success: false, message: 'Could not read the request body.' }, 400);
  }
  try {
    assertAccountBinding(env.ACCOUNT); // fail fast — never verify/parse into a void
    const { record, verdict } = await importAccount(env.ACCOUNT, text);
    return json({
      success: true,
      action: 'import',
      replaces: true, // reached only after parse succeeded → the store was replaced
      account: publicAccount(record),
      verdict,
    });
  } catch (err) {
    if (err instanceof AccountError) {
      return json({ success: false, message: err.message }, 400); // readable parse/input errors
    }
    return json({ success: false, message: 'Failed to import the account.' }, 500);
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

/** Constant-time compare for the SUB_PATH token (the path IS the credential). */
function subPathMatches(submitted, expected) {
  const a = new TextEncoder().encode(submitted);
  const b = new TextEncoder().encode(expected);
  return timingSafeEqualBytes(a, b);
}

const SUB_CACHE_CONTROL = 'public, max-age=21600, s-maxage=21600'; // 6 h at the edge (spec)

function notFound() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

function missingAccount() {
  return new Response(
    JSON.stringify({ error: 'No WARP account registered yet — open the panel and run Register first.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

/**
 * Shared core for the six subscription routes (tickets 04–08): method
 * gate, ACCOUNT + ENDPOINTS reads in parallel, missing-account 503,
 * renderer dispatch and the 6 h cache envelope. `opts` are the renderer
 * options derived from URL query params (scheme/legacy); `needsAwg`
 * additionally reads the AWG record for the renderers that can express it
 * (clash, wg-zip, awg).
 */
async function handleSubFormat(request, env, url, format, { needsAwg = false, opts = {} } = {}) {
  if (request.method !== 'GET') return methodNotAllowed();
  const [account, stored, awg] = await Promise.all([
    readAccount(env.ACCOUNT),
    readEndpoints(env.ENDPOINTS),
    needsAwg ? readAwg(env.AWG) : null,
  ]);
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
 * 404s wrong/missing tokens before this handler. Reads ACCOUNT + ENDPOINTS
 * from KV only (never the network): account record in, links out. Missing
 * account → 503 with a readable message. AWG is ignored by the link
 * formats (the Throne junk params are legacy parity, not settings).
 */
async function handleSub(request, env, url) {
  return handleSubFormat(request, env, url, 'sub', { opts: { scheme: url.searchParams.get('scheme') } });
}

/**
 * GET /api/<token>/sub/clash — the Clash YAML subscription (ticket 05).
 * Adds the AWG record read (per-proxy amnezia-wg-option when the stored
 * record is enabled and carries params; absent → no option).
 */
async function handleSubClash(request, env) {
  return handleSubFormat(request, env, null, 'clash', { needsAwg: true });
}

/**
 * GET /api/<token>/sub/singbox — the sing-box config.json subscription
 * (ticket 06). Same contract as handleSub/handleSubClash; `?legacy=1`
 * selects the pre-1.13 wireguard outbound shape (default: the 1.13+
 * endpoint shape). AWG is not expressible in sing-box — the KV read is
 * skipped entirely (same decision as handleSub).
 */
async function handleSubSingbox(request, env, url) {
  return handleSubFormat(request, env, url, 'singbox', { opts: { legacy: url.searchParams.get('legacy') } });
}

/**
 * GET /api/<token>/sub/neko — the NekoBox desktop subscription (ticket
 * 07): base64 of one `nekoray://custom#` link per valid endpoint, each
 * wrapping the NekoBox CustomBean JSON (cs = the sing-box wireguard
 * outbound — the legacy ticket-06 shape plus the §2.2 fields). Same
 * contract as handleSub/handleSubClash; AWG is not expressible in the
 * wrapped outbound — the KV read is skipped (same decision as handleSub).
 */
async function handleSubNeko(request, env) {
  return handleSubFormat(request, env, null, 'neko');
}

/**
 * GET /api/<token>/sub/wg — the WireGuard-app ZIP subscription (ticket
 * 08): one .conf per valid endpoint (plain WG, or AmneziaWG with J/S/H/I
 * lines when the stored AWG record is enabled). The renderer returns
 * binary (Uint8Array), which Response passes through as application/zip.
 */
async function handleSubWg(request, env) {
  return handleSubFormat(request, env, null, 'wg', { needsAwg: true });
}

/**
 * GET /api/<token>/sub/awg — the awg:// links subscription (ticket 08):
 * base64 of one `awg://<base64url conf>#name` link per valid endpoint.
 * The conf carries AWG params only when the stored record is enabled
 * (off → plain confs, like the wg-zip renderer) — see renderAwg.
 */
async function handleSubAwg(request, env) {
  return handleSubFormat(request, env, null, 'awg', { needsAwg: true });
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
    // no session, the path token IS the credential. Wrong/missing token →
    // 404 (never 401, which would reveal the route exists). The sub-format
    // routes are matched before the generic `/sub` pattern (the regexes
    // are disjoint anyway).
    const clashMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/clash\/?$/);
    if (clashMatch) {
      if (!env.SUB_PATH || !subPathMatches(clashMatch[1], env.SUB_PATH)) return notFound();
      return handleSubClash(request, env);
    }
    const singboxMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/singbox\/?$/);
    if (singboxMatch) {
      if (!env.SUB_PATH || !subPathMatches(singboxMatch[1], env.SUB_PATH)) return notFound();
      return handleSubSingbox(request, env, url);
    }
    const nekoMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/neko\/?$/);
    if (nekoMatch) {
      if (!env.SUB_PATH || !subPathMatches(nekoMatch[1], env.SUB_PATH)) return notFound();
      return handleSubNeko(request, env);
    }
    const wgZipMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/wg\/?$/);
    if (wgZipMatch) {
      if (!env.SUB_PATH || !subPathMatches(wgZipMatch[1], env.SUB_PATH)) return notFound();
      return handleSubWg(request, env);
    }
    const awgMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/awg\/?$/);
    if (awgMatch) {
      if (!env.SUB_PATH || !subPathMatches(awgMatch[1], env.SUB_PATH)) return notFound();
      return handleSubAwg(request, env);
    }
    const subMatch = url.pathname.match(/^\/api\/([^/]+)\/sub\/?$/);
    if (subMatch) {
      if (!env.SUB_PATH || !subPathMatches(subMatch[1], env.SUB_PATH)) return notFound();
      return handleSub(request, env, url);
    }

    // Everything else is password-gated (ticket 01).
    if (!(await isAuthorized(request, env))) {
      if (url.pathname.startsWith('/api/')) return unauthorized();
      return html(loginPage({ error: url.searchParams.get('error') }));
    }

    // Generator API (ticket 09) — session-gated like the account/settings
    // routes; renders from the STORED account (never registers per request).
    if (url.pathname === '/api/generator') return handleGeneratePost(request, env);

    // Account API (ticket 02) — only reachable with a valid session.
    if (url.pathname === '/api/account') return handleGetAccount(request, env);
    if (url.pathname === '/api/account/register') return handleAccountAction(request, env, 'register');
    if (url.pathname === '/api/account/rotate') return handleAccountAction(request, env, 'rotate');
    if (url.pathname === '/api/account/import') return handleImportAccount(request, env);

    // Settings API (ticket 03) — session-gated like the account routes.
    if (url.pathname === '/api/settings') return handleGetSettings(request, env);
    if (url.pathname === '/api/settings/endpoints') return handleSaveEndpoints(request, env);
    if (url.pathname === '/api/settings/awg') return handleSaveAwg(request, env);

    // Authenticated: panel shell at the root, gated static assets elsewhere.
    if (url.pathname === '/') return html(panelShell());
    return env.ASSETS.fetch(request);
  },
};
