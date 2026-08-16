/**
 * Ticket 01 router-level smoke tests for the accounts API:
 *   GET  /api/accounts                    — the card payload (never keys)
 *   POST /api/accounts/register           — append, then throttled (429)
 *   POST /api/accounts/import             — append from pasted material
 *   POST /api/accounts/:id/rotate|rename|delete
 *
 * Runs through the REAL router (workerModule.fetch) with a session cookie,
 * a Map-backed fake KV binding and a stubbed global fetch answering the
 * Cloudflare /reg + enableWarp calls (tweetnacl itself is stubbed via
 * module.register() — see test-support/). No real network traffic.
 */

import { register } from 'node:module';
register(new URL('./test-support/tweetnacl-loader.mjs', import.meta.url), { parentURL: import.meta.url });

import test from 'node:test';
import assert from 'node:assert/strict';

import { issueSession } from './auth.js';
import workerModule, { __resetRegistrationThrottle } from './index.js';

const CF_BASE = 'https://api.cloudflareclient.com/v0a1922';
const SECRET = 'accounts-smoke-test-secret';
const SESSION = (async () => `warp_session=${await issueSession(SECRET)}`)();

// ---- fixtures (throwaway, never real) ----

const CONF_TEXT = `[Interface]
PrivateKey = ${Buffer.alloc(32, 0x41).toString('base64')}
Address = 172.16.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${Buffer.alloc(32, 0x42).toString('base64')}
AllowedIPs = 0.0.0.0/0
`;

const WARP_CONFIG = {
  result: {
    id: 'x',
    token: 'y',
    config: {
      mtu: 1280,
      client_id: 'QGV1zKUsRS4=',
      peers: [{ public_key: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=' }],
      interface: { addresses: { v4: '172.16.0.2', v6: 'fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789' } },
    },
  },
};

function fakeKv() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
  };
}

function makeEnv() {
  return {
    PASSWORD: SECRET,
    STATE: fakeKv(), // the state snapshot binding (accounts + subs + revision)
    ENDPOINTS: fakeKv(),
    AWG: fakeKv(),
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  };
}

let regSeq = 0;

/** Answers the Cloudflare calls the registration flow makes. */
function installCfStub(t) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    calls.push(method + ' ' + u);
    if (method === 'POST' && u === CF_BASE + '/reg') {
      regSeq += 1;
      return new Response(JSON.stringify({ result: { id: 'smoke-id-' + regSeq, token: 'smoke-token-' + regSeq } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'PATCH' && u.startsWith(CF_BASE + '/reg/')) {
      return new Response(JSON.stringify(WARP_CONFIG), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'GET' && u.startsWith(CF_BASE + '/reg/')) {
      return new Response('{}', { status: 200 }); // import soft-verification
    }
    return new Response('unexpected call: ' + method + ' ' + u, { status: 500 });
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

async function api(env, path, { method = 'GET', body } = {}) {
  const init = { method, headers: { Cookie: await SESSION } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return workerModule.fetch(new Request('http://panel.local' + path, init), env, {});
}

test('accounts API: session-gated — anon requests hit the 401 gate', async () => {
  const env = makeEnv();
  for (const path of ['/api/accounts', '/api/accounts/register', '/api/accounts/import', '/api/accounts/x/delete']) {
    const res = await workerModule.fetch(new Request('http://panel.local' + path, { method: 'POST' }), env, {});
    assert.equal(res.status, 401, path);
  }
});

test('accounts API: GET /api/accounts starts empty, never exposes keys', async () => {
  const env = makeEnv();
  const res = await api(env, '/api/accounts');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.deepEqual(data.accounts, []);
});

test('accounts API: import appends a new account (no network beyond soft verify)', async (t) => {
  const env = makeEnv();
  const calls = installCfStub(t);
  const res = await api(env, '/api/accounts/import', { method: 'POST', body: { text: CONF_TEXT } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.action, 'import');
  assert.equal(data.account.source, 'import');
  assert.equal(data.account.clientId, undefined);
  assert.equal(data.account.privateKey, undefined);
  assert.equal(data.account.token, undefined);
  assert.equal(data.verdict.verified, false);
  assert.ok(calls.every((c) => !c.includes('PATCH')), 'conf import never calls enableWarp');
  assert.ok(env.STATE.map.has('state'), 'state snapshot was written');

  const list = await (await api(env, '/api/accounts')).json();
  assert.equal(list.accounts.length, 1);
  assert.equal(list.accounts[0].id, data.account.id);
});

test('accounts API: import with empty or oversized text → 400', async () => {
  const env = makeEnv();
  for (const text of ['', '   ']) {
    const res = await api(env, '/api/accounts/import', { method: 'POST', body: { text } });
    assert.equal(res.status, 400);
  }
  const huge = await api(env, '/api/accounts/import', { method: 'POST', body: { text: 'x'.repeat(65537) } });
  assert.equal(huge.status, 400);
});

test('accounts API: rename trims and persists the label; unknown id → 404', async (t) => {
  const env = makeEnv();
  installCfStub(t);
  const seeded = await api(env, '/api/accounts/import', { method: 'POST', body: { text: CONF_TEXT } });
  const id = (await seeded.json()).account.id;

  const res = await api(env, `/api/accounts/${id}/rename`, { method: 'POST', body: { label: '  Home  ' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).account.label, 'Home');

  const renamed = await (await api(env, '/api/accounts')).json();
  assert.equal(renamed.accounts[0].label, 'Home');

  const missing = await api(env, '/api/accounts/nope/rename', { method: 'POST', body: { label: 'X' } });
  assert.equal(missing.status, 404);

  const blank = await api(env, `/api/accounts/${id}/rename`, { method: 'POST', body: { label: '   ' } });
  assert.equal(blank.status, 400);
});

test('accounts API: rotate replaces the record body, keeps id + label', async (t) => {
  __resetRegistrationThrottle();
  const env = makeEnv();
  const calls = installCfStub(t);
  const seeded = await api(env, '/api/accounts/import', { method: 'POST', body: { text: CONF_TEXT } });
  const seededData = await seeded.json();
  const id = seededData.account.id;

  const res = await api(env, `/api/accounts/${id}/rotate`, { method: 'POST' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.account.id, id, 'id survives rotation');
  assert.equal(data.account.label, seededData.account.label, 'label survives rotation');
  assert.equal(data.account.source, 'register');
  assert.ok(calls.some((c) => c.startsWith('POST ' + CF_BASE + '/reg')), 'fresh registration happened');
  assert.ok(calls.some((c) => c.startsWith('PATCH ' + CF_BASE + '/reg/')), 'enableWarp happened');
});

test('accounts API: delete removes the account; repeated delete → 404', async (t) => {
  const env = makeEnv();
  installCfStub(t);
  const seeded = await api(env, '/api/accounts/import', { method: 'POST', body: { text: CONF_TEXT } });
  const id = (await seeded.json()).account.id;

  const res = await api(env, `/api/accounts/${id}/delete`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).success, true);

  const after = await (await api(env, '/api/accounts')).json();
  assert.deepEqual(after.accounts, []);

  const again = await api(env, `/api/accounts/${id}/delete`, { method: 'POST' });
  assert.equal(again.status, 404);
});

test('accounts API: register appends a fresh registration and marks source register', async (t) => {
  __resetRegistrationThrottle();
  const env = makeEnv();
  installCfStub(t);
  const res = await api(env, '/api/accounts/register', { method: 'POST' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.action, 'register');
  assert.equal(data.account.source, 'register');
  assert.equal(data.account.clientId, undefined); // public view only
  assert.ok(data.account.id);

  const list = await (await api(env, '/api/accounts')).json();
  assert.equal(list.accounts.length, 1);
  assert.equal(list.accounts[0].label, 'Account 1');
});

test('accounts API: back-to-back register → 429 with a readable message (throttle)', async () => {
  const env = makeEnv();
  const res = await api(env, '/api/accounts/register', { method: 'POST' });
  assert.equal(res.status, 429);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.message, /rate-limits|try again in/i);
  assert.match(data.message, /[0-9]+ s/);
});