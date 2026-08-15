/**
 * Cloudflare Worker entry point.
 * Route map (ticket 01 + ticket 02):
 *   - /api/generate (+ OPTIONS, GET, 405) — legacy public generator API, unchanged.
 *   - POST /api/auth/login    — password check (constant-time) → HMAC-signed
 *                               session cookie, 303 → /
 *   - POST /api/auth/logout   — clears the session cookie, 303 → /
 *   - GET  /api/account       — account card state (null when none stored)
 *   - POST /api/account/register — register a WARP account, store in ACCOUNT KV
 *   - POST /api/account/rotate   — fresh registration replacing the stored one
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
 *   - everything else         — password-gated: unauthenticated requests get
 *                               the login page (HTML) or 401 (any /api/*);
 *                               authenticated requests get the panel shell at
 *                               "/" and gated static assets (ASSETS binding)
 *                               elsewhere.
 * Register and Rotate are the ONLY writers of the ACCOUNT binding; the KV
 * write happens strictly after the Cloudflare calls succeed (see account.js).
 * The settings routes are the ONLY writers of ENDPOINTS and AWG (see
 * settings.js).
 * PASSWORD comes from the environment (env.PASSWORD). Set it with
 * `wrangler secret put PASSWORD` (see wrangler.jsonc for the local-dev
 * placeholder).
 */

import { onRequestPost, onRequestOptions, onRequestGet } from './api-handler.js';
import {
  assertAccountBinding,
  describeAccountError,
  publicAccount,
  readAccount,
  registerAccount,
  writeAccount,
} from './account.js';
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

const METHOD_NOT_ALLOWED = new Response(JSON.stringify({ error: 'Method not allowed' }), {
  status: 405,
  headers: { 'Content-Type': 'application/json' },
});

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
  if (request.method !== 'GET') return METHOD_NOT_ALLOWED;
  const record = await readAccount(env.ACCOUNT);
  return json({ success: true, account: record ? publicAccount(record) : null });
}

/** POST /api/account/register|rotate — network first, KV write last. */
async function handleAccountAction(request, env, action) {
  if (request.method !== 'POST') return METHOD_NOT_ALLOWED;
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

/** Login form posts urlencoded by default; JSON is accepted for API callers. */
async function readLoginBody(request) {
  const text = await request.text();
  if (!text) return {};
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { return JSON.parse(text); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') return METHOD_NOT_ALLOWED;
  if (!env.PASSWORD) {
    return new Response(null, { status: 303, headers: { Location: '/?error=config' } });
  }
  const body = await readLoginBody(request);
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
  if (request.method !== 'POST') return METHOD_NOT_ALLOWED;
  const secure = request.url.startsWith('https:');
  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Set-Cookie': clearSessionCookie({ secure }) },
  });
}

// ---- Settings API (ticket 03) ----

/** GET /api/settings — state feed for the endpoints + AWG cards. */
async function handleGetSettings(request, env) {
  if (request.method !== 'GET') return METHOD_NOT_ALLOWED;
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
  if (request.method !== 'POST') return METHOD_NOT_ALLOWED;
  try {
    const body = await readLoginBody(request);
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
  if (request.method !== 'POST') return METHOD_NOT_ALLOWED;
  try {
    const body = await readLoginBody(request);
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
 * GET /api/<token>/sub — the subscription payload (ticket 04).
 * No session — the path token IS the credential (ADR 0006); the router
 * 404s wrong/missing tokens before this handler. Reads ACCOUNT + ENDPOINTS
 * from KV only (never the network): account record in, links out. Missing
 * account → 503 with a readable message. AWG is ignored by the link
 * formats (the Throne junk params are legacy parity, not settings).
 */
async function handleSub(request, env, url) {
  if (request.method !== 'GET') return METHOD_NOT_ALLOWED;
  const account = await readAccount(env.ACCOUNT);
  if (!account) return missingAccount();
  const stored = await readEndpoints(env.ENDPOINTS); // null when absent/empty — fallback territory
  const endpoints = stored ? parseEndpointList(stored.text).endpoints : [];
  const { body, contentType } = renderSubscription('sub', { scheme: url.searchParams.get('scheme') }, { account, endpoints, awg: null });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': SUB_CACHE_CONTROL },
  });
}

/**
 * GET /api/<token>/sub/clash — the Clash YAML subscription (ticket 05).
 * Same contract as handleSub; additionally reads the AWG record from KV
 * and passes it to the renderer (per-proxy amnezia-wg-option when the
 * stored record is enabled and carries params; absent → no option).
 */
async function handleSubClash(request, env) {
  if (request.method !== 'GET') return METHOD_NOT_ALLOWED;
  const account = await readAccount(env.ACCOUNT);
  if (!account) return missingAccount();
  const stored = await readEndpoints(env.ENDPOINTS); // null when absent/empty — fallback territory
  const endpoints = stored ? parseEndpointList(stored.text).endpoints : [];
  const awg = await readAwg(env.AWG); // null when off/absent — no amnezia-wg-option
  const { body, contentType } = renderSubscription('clash', {}, { account, endpoints, awg });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': SUB_CACHE_CONTROL },
  });
}

/**
 * GET /api/<token>/sub/singbox — the sing-box config.json subscription
 * (ticket 06). Same contract as handleSub/handleSubClash; `?legacy=1`
 * selects the pre-1.13 wireguard outbound shape (default: the 1.13+
 * endpoint shape). AWG is not expressible in sing-box — the KV read is
 * skipped entirely (same decision as handleSub).
 */
async function handleSubSingbox(request, env, url) {
  if (request.method !== 'GET') return METHOD_NOT_ALLOWED;
  const account = await readAccount(env.ACCOUNT);
  if (!account) return missingAccount();
  const stored = await readEndpoints(env.ENDPOINTS); // null when absent/empty — fallback territory
  const endpoints = stored ? parseEndpointList(stored.text).endpoints : [];
  const { body, contentType } = renderSubscription('singbox', { legacy: url.searchParams.get('legacy') }, { account, endpoints, awg: null });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': SUB_CACHE_CONTROL },
  });
}

async function isAuthorized(request, env) {
  if (!env.PASSWORD) return false; // unconfigured: everything stays gated
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  return verifySession(cookies[SESSION_COOKIE], env.PASSWORD);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Legacy public generator API — unchanged behaviour, still public.
    if (url.pathname === '/api/generate' || url.pathname === '/api/generate/') {
      if (request.method === 'OPTIONS') return onRequestOptions();
      if (request.method === 'POST') return onRequestPost({ request, env, ctx });
      if (request.method === 'GET') return onRequestGet();

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Auth endpoints (reachable without a session).
    if (url.pathname === '/api/auth/login') return handleLogin(request, env);
    if (url.pathname === '/api/auth/logout') return handleLogout(request, env);

    // Subscription routes (tickets 04 + 05 + 06) — BEFORE the auth gate:
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

    // Account API (ticket 02) — only reachable with a valid session.
    if (url.pathname === '/api/account') return handleGetAccount(request, env);
    if (url.pathname === '/api/account/register') return handleAccountAction(request, env, 'register');
    if (url.pathname === '/api/account/rotate') return handleAccountAction(request, env, 'rotate');

    // Settings API (ticket 03) — session-gated like the account routes.
    if (url.pathname === '/api/settings') return handleGetSettings(request, env);
    if (url.pathname === '/api/settings/endpoints') return handleSaveEndpoints(request, env);
    if (url.pathname === '/api/settings/awg') return handleSaveAwg(request, env);

    // Authenticated: panel shell at the root, gated static assets elsewhere.
    if (url.pathname === '/') return html(panelShell());
    return env.ASSETS.fetch(request);
  },
};
