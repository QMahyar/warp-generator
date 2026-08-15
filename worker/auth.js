/**
 * Panel authentication — HMAC-signed session cookies (Web Crypto only).
 *
 * The `PASSWORD` secret (env.PASSWORD) does two jobs:
 *
 *  1. Login: the submitted password is compared against the secret via
 *     double-HMAC digests (constant-time, fixed 32-byte compare, no length
 *     signal).
 *  2. Sessions: the cookie value is
 *        warp_session = v1.<expirySeconds>.<base64url(HMAC-SHA256(PASSWORD, "v1.<expirySeconds>"))>
 *     A cookie verifies iff the signature matches (constant-time byte
 *     compare) and the expiry is still in the future.
 *
 * Rotating PASSWORD invalidates every live session — acceptable for a
 * single-operator panel. Use a strong PASSWORD: it is the sole secret
 * protecting both login and session forging.
 *
 * All exports are pure (crypto + time only): no imports, no env, no globals
 * beyond Web Crypto / TextEncoder / atob / btoa, so they run identically in
 * the Worker and under `node --test`.
 */

export const SESSION_COOKIE = 'warp_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // ~7 days

const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();

// ---- encoding helpers ----

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  if (typeof s !== 'string' || !B64URL_RE.test(s)) return null;
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  let bin;
  try { bin = atob(b64); } catch { return null; }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---- constant-time compare ----

/**
 * Byte-wise constant-time equality. Length mismatch returns false immediately
 * (lengths are public here: HMAC digests are always 32 bytes).
 */
export function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---- signing ----

async function signBytes(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

// ---- password check ----

/**
 * Constant-time password comparison: both sides are HMAC-digested with the
 * secret as key, then the fixed-length digests are compared. The digest
 * comparison never leaks length or byte position of the inputs.
 */
export async function verifyPassword(submitted, expected) {
  if (typeof submitted !== 'string' || typeof expected !== 'string' || expected === '') return false;
  const a = await signBytes(expected, `pw:${submitted}`);
  const b = await signBytes(expected, `pw:${expected}`);
  return timingSafeEqualBytes(a, b);
}

// ---- session cookie ----

/**
 * Issue a signed session token valid for `maxAge` seconds from `now`.
 * Returns the cookie *value* (`v1.<exp>.<sig>`) — set it with
 * `sessionCookieHeader`.
 */
export async function issueSession(secret, { now = Date.now(), maxAge = SESSION_MAX_AGE_SECONDS } = {}) {
  const exp = Math.floor(now / 1000) + maxAge;
  const payload = `v1.${exp}`;
  const sig = toBase64Url(await signBytes(secret, payload));
  return `${payload}.${sig}`;
}

/**
 * Verify a session token. Returns true iff the format is `v1.<integer
 * expiry>.<valid signature>` and the expiry is strictly in the future.
 */
export async function verifySession(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== 'string') return false;
  const dot1 = token.indexOf('.');
  if (dot1 === -1) return false;
  const dot2 = token.indexOf('.', dot1 + 1);
  if (dot2 === -1 || dot2 === token.length - 1) return false;

  const version = token.slice(0, dot1);
  const expPart = token.slice(dot1 + 1, dot2);
  const sigPart = token.slice(dot2 + 1);
  if (version !== 'v1') return false;

  const exp = Number(expPart);
  if (!Number.isInteger(exp)) return false;

  const sig = fromBase64Url(sigPart);
  if (!sig) return false;

  const expected = await signBytes(secret, `${version}.${expPart}`);
  if (!timingSafeEqualBytes(sig, expected)) return false;

  return Math.floor(now / 1000) < exp;
}

// ---- cookie HTTP helpers ----

/** Parse a Cookie request header into { name: value }. */
export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (name) cookies[name] = value;
  }
  return cookies;
}

/** Set-Cookie header for a session token. `Secure` is added only over https. */
export function sessionCookieHeader(token, { maxAge = SESSION_MAX_AGE_SECONDS, secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAge)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Set-Cookie header that deletes the session cookie. */
export function clearSessionCookie({ secure = false } = {}) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}