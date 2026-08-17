/**
 * Brute-force guard tests (security hardening): /api/auth/login must lock an
 * IP out after repeated failures and stay locked for the window; a successful
 * login resets the counter. Driven through the real worker fetch handler so
 * the redirect + throttle wiring is exercised end-to-end.
 *
 * Runs under `node --test` with zero npm dependencies (same convention as the
 * other worker tests).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { __resetLoginThrottle, LOGIN_MAX_ATTEMPTS } from './index.js';

const PASSWORD = 's3cr3t-panel-password';

/** A POST to /api/auth/login carrying `password` as form data. */
function loginRequest({ password, ip = '203.0.113.7' } = {}) {
  const body = new URLSearchParams({ password }).toString();
  return new Request('https://panel.example.workers.dev/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'CF-Connecting-IP': ip,
    },
    body,
  });
}

function env() {
  return { PASSWORD };
}

test('login with the correct password → 303 to / (session cookie set)', async () => {
  __resetLoginThrottle();
  const res = await worker.fetch(loginRequest({ password: PASSWORD }), env(), {});
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/');
  const setCookie = res.headers.get('Set-Cookie') || '';
  assert.ok(setCookie.includes('warp_session='), 'session cookie set on success');
});

test('wrong password → 303 to /?error=invalid (no session cookie)', async () => {
  __resetLoginThrottle();
  const res = await worker.fetch(loginRequest({ password: 'wrong' }), env(), {});
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/?error=invalid');
  assert.equal(res.headers.get('Set-Cookie'), null);
});

test('5 consecutive failures lock the IP; the 6th is rejected even with the right password', async () => {
  __resetLoginThrottle();
  for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
    const res = await worker.fetch(loginRequest({ password: 'wrong' }), env(), {});
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('Location'), '/?error=invalid', `attempt ${i + 1} still counted`);
  }
  // The correct password is now also locked out — the redirect carries the
  // lockout error, not a session.
  const locked = await worker.fetch(loginRequest({ password: PASSWORD }), env(), {});
  assert.equal(locked.status, 303);
  assert.ok(locked.headers.get('Location').startsWith('/?error=locked'), 'lockout error surfaced');
  assert.equal(locked.headers.get('Set-Cookie'), null, 'no session while locked');
});

test('a different client IP is not affected by another IPs failures', async () => {
  __resetLoginThrottle();
  for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
    await worker.fetch(loginRequest({ password: 'wrong', ip: '198.51.100.9' }), env(), {});
  }
  // A fresh IP can still sign in.
  const res = await worker.fetch(loginRequest({ password: PASSWORD, ip: '198.51.100.10' }), env(), {});
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/');
});

test('a successful login before the threshold clears the failure counter', async () => {
  __resetLoginThrottle();
  for (let i = 0; i < 3; i++) {
    await worker.fetch(loginRequest({ password: 'wrong' }), env(), {});
  }
  const ok = await worker.fetch(loginRequest({ password: PASSWORD }), env(), {});
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('Location'), '/');
  // The counter is cleared — the same IP can fail again without being locked.
  for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
    const res = await worker.fetch(loginRequest({ password: 'wrong' }), env(), {});
    assert.equal(res.headers.get('Location'), '/?error=invalid', `attempt ${i + 1} after reset still counted`);
  }
  const locked = await worker.fetch(loginRequest({ password: PASSWORD }), env(), {});
  assert.ok(locked.headers.get('Location').startsWith('/?error=locked'), 'relock after fresh counter');
});

test('unconfigured panel (no PASSWORD) → 303 to /?error=config, no lockout applied', async () => {
  __resetLoginThrottle();
  const res = await worker.fetch(loginRequest({ password: 'x' }), { PASSWORD: null }, {});
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/?error=config');
});
