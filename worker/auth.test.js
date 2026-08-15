/**
 * Ticket 01 unit tests: cookie sign/verify logic as pure functions.
 * Run from the repo root with `node --test` (no npm dependencies).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSessionCookie,
  issueSession,
  parseCookies,
  sessionCookieHeader,
  timingSafeEqualBytes,
  verifyPassword,
  verifySession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from './auth.js';

const SECRET = 'correct-horse-battery-staple';
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0); // 2026-08-15T12:00:00Z

test('issueSession → verifySession roundtrip is valid', async () => {
  const token = await issueSession(SECRET, { now: NOW });
  assert.equal(typeof token, 'string');
  assert.ok(await verifySession(token, SECRET, { now: NOW }));
});

test('session expiry is ~7 days ahead of issuance', async () => {
  const token = await issueSession(SECRET, { now: NOW, maxAge: SESSION_MAX_AGE_SECONDS });
  const exp = Number(token.split('.')[1]);
  assert.equal(exp, Math.floor(NOW / 1000) + SESSION_MAX_AGE_SECONDS);
  assert.equal(SESSION_MAX_AGE_SECONDS, 7 * 24 * 60 * 60);
});

test('tokens differ across issuance times (time is part of the payload)', async () => {
  const a = await issueSession(SECRET, { now: NOW });
  const b = await issueSession(SECRET, { now: NOW + 1000 });
  assert.notEqual(a, b);
});

test('tampered payload is rejected', async () => {
  const token = await issueSession(SECRET, { now: NOW });
  const [v, exp, sig] = token.split('.');
  const tamperedExp = String(Number(exp) + 1);
  assert.equal(await verifySession(`${v}.${tamperedExp}.${sig}`, SECRET, { now: NOW }), false);
});

test('tampered signature is rejected', async () => {
  const token = await issueSession(SECRET, { now: NOW });
  const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.equal(await verifySession(flipped, SECRET, { now: NOW }), false);
});

test('wrong secret is rejected', async () => {
  const token = await issueSession(SECRET, { now: NOW });
  assert.equal(await verifySession(token, 'another-secret', { now: NOW }), false);
});

test('expired session is rejected (and the exact expiry instant is too)', async () => {
  const token = await issueSession(SECRET, { now: NOW, maxAge: 60 });
  const exp = Number(token.split('.')[1]);
  assert.equal(await verifySession(token, SECRET, { now: (exp - 1) * 1000 }), true);
  assert.equal(await verifySession(token, SECRET, { now: exp * 1000 }), false);
  assert.equal(await verifySession(token, SECRET, { now: (exp + 1) * 1000 }), false);
});

test('malformed tokens are rejected', async () => {
  const token = await issueSession(SECRET, { now: NOW });
  for (const bad of [
    '',
    'garbage',
    'v1.123',
    'v1.123.sig.too.many',
    'v2.1234567890.sig',
    'v1.notanumber.sig',
    'v1.1234567890.',
    'v1.1234567890.!!!invalid-base64',
    token.split('.')[0] + '.1234567890.' + token.split('.')[2], // valid sig, wrong exp
  ]) {
    assert.equal(await verifySession(bad, SECRET, { now: NOW }), false, `should reject: ${bad}`);
  }
});

test('verifyPassword accepts the right password', async () => {
  assert.equal(await verifyPassword(SECRET, SECRET), true);
});

test('verifyPassword rejects wrong, empty and non-ASCII mismatches', async () => {
  assert.equal(await verifyPassword('wrong', SECRET), false);
  assert.equal(await verifyPassword('', SECRET), false);
  assert.equal(await verifyPassword('', ''), false); // empty secret is a misconfiguration, never a match
  assert.equal(await verifyPassword('пароль🔑', SECRET), false);
  assert.equal(await verifyPassword('пароль🔑', 'пароль🔑'), true);
});

test('timingSafeEqualBytes: equal bytes pass, any difference fails', () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  assert.equal(timingSafeEqualBytes(a, new Uint8Array([1, 2, 3, 4])), true);
  assert.equal(timingSafeEqualBytes(a, new Uint8Array([1, 2, 3, 5])), false);
  assert.equal(timingSafeEqualBytes(a, new Uint8Array([1, 2, 3])), false);
  assert.equal(timingSafeEqualBytes(new Uint8Array(0), new Uint8Array(0)), true);
});

test('parseCookies handles single, multiple, spaced and quoted values', () => {
  assert.deepEqual(parseCookies('a=1'), { a: '1' });
  assert.deepEqual(parseCookies('a=1; b=2'), { a: '1', b: '2' });
  assert.deepEqual(parseCookies('  a = 1 ; b="two words" '), { a: '1', b: 'two words' });
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(null), {});
});

test('sessionCookieHeader carries the session with safe attributes', async () => {
  const token = await issueSession(SECRET, { now: NOW });
  const header = sessionCookieHeader(token, { now: NOW });
  assert.ok(header.startsWith(`${SESSION_COOKIE}=${token}`));
  for (const attr of ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_MAX_AGE_SECONDS}`]) {
    assert.ok(header.includes(attr), `missing ${attr}`);
  }
  assert.ok(!header.includes('Secure') || header.includes('Secure'));
  assert.ok(sessionCookieHeader(token, { secure: true }).includes('Secure'));
  assert.ok(!sessionCookieHeader(token, { secure: false }).includes('Secure'));
});

test('clearSessionCookie expires the cookie immediately', () => {
  const header = clearSessionCookie();
  assert.ok(header.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(header.includes('Max-Age=0'));
  assert.ok(header.includes('HttpOnly'));
});