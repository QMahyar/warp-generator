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
 *   - everything else         — password-gated: unauthenticated requests get
 *                               the login page (HTML) or 401 (any /api/*);
 *                               authenticated requests get the panel shell at
 *                               "/" and gated static assets (ASSETS binding)
 *                               elsewhere.
 * Register and Rotate are the ONLY writers of the ACCOUNT binding; the KV
 * write happens strictly after the Cloudflare calls succeed (see account.js).
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
  verifyPassword,
  verifySession,
  SESSION_COOKIE,
} from './auth.js';
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

    // Everything else is password-gated (ticket 01).
    if (!(await isAuthorized(request, env))) {
      if (url.pathname.startsWith('/api/')) return unauthorized();
      return html(loginPage({ error: url.searchParams.get('error') }));
    }

    // Account API (ticket 02) — only reachable with a valid session.
    if (url.pathname === '/api/account') return handleGetAccount(request, env);
    if (url.pathname === '/api/account/register') return handleAccountAction(request, env, 'register');
    if (url.pathname === '/api/account/rotate') return handleAccountAction(request, env, 'rotate');

    // Authenticated: panel shell at the root, gated static assets elsewhere.
    if (url.pathname === '/') return html(panelShell());
    return env.ASSETS.fetch(request);
  },
};
