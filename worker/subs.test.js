/**
 * Ticket 02 router-level smoke tests for the subscriptions API:
 *   GET  /api/subs              — the card payload (fingerprints, never the token)
 *   POST /api/subs              — create; raw token + link list returned once
 *   POST /api/subs/:id/rename   — trimmed label (400 on blank)
 *   POST /api/subs/:id/pin      — re-pin to an account (400 on unknown)
 *   POST /api/subs/:id/reset-token — new token returned once, old one retired
 *   POST /api/subs/:id/delete   — remove; repeat → 404
 *
 * Ticket 03 public sub-route smoke tests (no session — the token IS the
 * credential): the six /api/<token>/sub* routes resolve against the STATE
 * snapshot — 200 + 5-min cache with a pinned account, 404 no-store on a
 * wrong/deleted token, 503 no-store on a deleted pinned account, 405
 * no-store on non-GET.
 *
 * Runs through the REAL router (workerModule.fetch) with a session cookie and
 * a Map-backed fake KV binding. Accounts are seeded via conf import
 * (POST /api/accounts/import with a .conf), which makes ZERO network calls
 * (no id/token → no soft verification) — so no Cloudflare fetch stub and no
 * tweetnacl loader registration are needed. No real network traffic.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { issueSession } from './auth.js';
import workerModule from './index.js';

const SECRET = 'subs-smoke-test-secret';
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

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** The ids subLinks() emits — the "six formats" plus the awg:// row. */
const LINK_IDS = ['wg', 'throne', 'clash', 'singbox', 'neko', 'wg-zip', 'awg'];

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

async function api(env, path, { method = 'GET', body } = {}) {
  const init = { method, headers: { Cookie: await SESSION } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return workerModule.fetch(new Request('http://panel.local' + path, init), env, {});
}

function snapshot(env) {
  const raw = env.STATE.map.get('state');
  assert.ok(raw, 'state snapshot exists');
  return JSON.parse(raw);
}

// ---- auth gate ----

test('subs API: session-gated — anon requests hit the 401 gate', async () => {
  const env = makeEnv();
  const anon = async (path, method) =>
    workerModule.fetch(new Request('http://panel.local' + path, { method }), env, {});
  assert.equal((await anon('/api/subs', 'GET')).status, 401);
  assert.equal((await anon('/api/subs', 'POST')).status, 401);
  for (const action of ['rename', 'pin', 'reset-token', 'delete']) {
    assert.equal((await anon(`/api/subs/x/${action}`, 'POST')).status, 401, action);
  }
});

// ---- reads ----

test('subs API: GET /api/subs starts empty, never exposes tokens', async () => {
  const env = makeEnv();
  const res = await api(env, '/api/subs');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.deepEqual(data.subs, []);
});

// ---- create ----

test('subs API: create returns the raw token + full link list once; storage keeps only the hash', async () => {
  const env = makeEnv();
  const res = await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.sub.name, 'Home');
  assert.ok(data.sub.id);
  assert.match(data.sub.token, TOKEN_RE, '43-char base64url token');
  assert.ok(Array.isArray(data.sub.links), 'full link list returned');
  assert.deepEqual(data.sub.links.map((l) => l.id), LINK_IDS, 'six formats + awg row');
  for (const link of data.sub.links) {
    assert.ok(link.href.includes('/api/' + data.sub.token + '/sub'), `${link.id} href carries the token`);
    assert.ok(link.name && link.description, `${link.id} has display text`);
  }
  assert.ok(!('tokenHashPrefix' in data.sub), 'create response carries no fingerprint');
  assert.ok(!('tokenHash' in data.sub), 'create response carries no hash');

  const state = snapshot(env);
  assert.equal(state.subs.length, 1);
  assert.ok(state.subs[0].tokenHash, 'token hash stored');
  assert.notEqual(state.subs[0].tokenHash, data.sub.token, 'raw token never stored verbatim');
  assert.ok(!JSON.stringify(state).includes(data.sub.token), 'raw token absent from the snapshot');

  const list = await (await api(env, '/api/subs')).json();
  assert.equal(list.subs.length, 1);
  const row = list.subs[0];
  assert.equal(row.id, data.sub.id);
  assert.equal(row.tokenHashPrefix, state.subs[0].tokenHash.slice(0, 8), 'fingerprint = stored hash prefix');
  assert.ok(!('token' in row) && !('tokenHash' in row), 'card payload is fingerprint-only');
});

test('subs API: create trims a name; absent name gets a default', async () => {
  const env = makeEnv();
  const named = await api(env, '/api/subs', { method: 'POST', body: { name: '  Phone  ' } });
  assert.equal((await named.json()).sub.name, 'Phone');

  const unnamed = await api(env, '/api/subs', { method: 'POST', body: {} });
  assert.equal(unnamed.status, 200);
  assert.equal((await unnamed.json()).sub.name, 'Subscription 2');
});

// ---- rename ----

test('subs API: rename trims and persists; blank → 400; unknown id → 404', async () => {
  const env = makeEnv();
  const created = await (await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } })).json();
  const id = created.sub.id;

  const res = await api(env, `/api/subs/${id}/rename`, { method: 'POST', body: { name: '  Office  ' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).sub.name, 'Office');

  const list = await (await api(env, '/api/subs')).json();
  assert.equal(list.subs[0].name, 'Office');

  const blank = await api(env, `/api/subs/${id}/rename`, { method: 'POST', body: { name: '   ' } });
  assert.equal(blank.status, 400);

  const missing = await api(env, '/api/subs/nope/rename', { method: 'POST', body: { name: 'X' } });
  assert.equal(missing.status, 404);
});

// ---- pin ----

test('subs API: pin to a stored account (seeded via conf import, no network)', async () => {
  const env = makeEnv();
  const seeded = await api(env, '/api/accounts/import', { method: 'POST', body: { text: CONF_TEXT } });
  assert.equal(seeded.status, 200);
  const accountId = (await seeded.json()).account.id;

  const created = await (await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } })).json();
  const subId = created.sub.id;

  const res = await api(env, `/api/subs/${subId}/pin`, { method: 'POST', body: { accountId } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).sub.accountId, accountId);

  const list = await (await api(env, '/api/subs')).json();
  assert.equal(list.subs[0].accountId, accountId);
  assert.equal(list.subs[0].accountLabel, 'Account 1', 'card shows the pinned account label');
});

test('subs API: pin to an unknown account → 400', async () => {
  const env = makeEnv();
  const created = await (await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } })).json();
  const res = await api(env, `/api/subs/${created.sub.id}/pin`, { method: 'POST', body: { accountId: 'nope' } });
  assert.equal(res.status, 400);
});

test('subs API: unpin with null or empty accountId resets to null', async () => {
  const env = makeEnv();
  const seeded = await (await api(env, '/api/accounts/import', { method: 'POST', body: { text: CONF_TEXT } })).json();
  const accountId = seeded.account.id;
  const created = await (await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } })).json();
  const subId = created.sub.id;

  await api(env, `/api/subs/${subId}/pin`, { method: 'POST', body: { accountId } });

  for (const accountIdValue of [null, '']) {
    const res = await api(env, `/api/subs/${subId}/pin`, { method: 'POST', body: { accountId: accountIdValue } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).sub.accountId, null);
  }

  const list = await (await api(env, '/api/subs')).json();
  assert.equal(list.subs[0].accountId, null);
  assert.equal(list.subs[0].accountLabel, null);
});

// ---- reset-token ----

test('subs API: reset-token returns a new token once and retires the old hash', async () => {
  const env = makeEnv();
  const created = await (await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } })).json();
  const subId = created.sub.id;
  const oldToken = created.sub.token;
  const oldHash = snapshot(env).subs[0].tokenHash;

  const res = await api(env, `/api/subs/${subId}/reset-token`, { method: 'POST' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.match(data.sub.token, TOKEN_RE);
  assert.notEqual(data.sub.token, oldToken, 'new token differs from the old one');
  assert.deepEqual(data.sub.links.map((l) => l.id), LINK_IDS);
  assert.ok(!('tokenHashPrefix' in data.sub), 'reset response carries no fingerprint');

  const state = snapshot(env);
  assert.notEqual(state.subs[0].tokenHash, oldHash, 'stored hash was replaced');
  assert.equal(state.subs[0].tokenHash, (await hashTokenFor(data.sub.token)), 'stored hash matches the new token');
  assert.ok(!JSON.stringify(state).includes(data.sub.token), 'raw new token absent from the snapshot');

  const list = await (await api(env, '/api/subs')).json();
  assert.equal(list.subs[0].tokenHashPrefix, state.subs[0].tokenHash.slice(0, 8));
});

// ---- delete ----

test('subs API: delete removes the sub; repeated delete → 404', async () => {
  const env = makeEnv();
  const created = await (await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } })).json();
  const subId = created.sub.id;

  const res = await api(env, `/api/subs/${subId}/delete`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).success, true);

  const list = await (await api(env, '/api/subs')).json();
  assert.deepEqual(list.subs, []);

  const again = await api(env, `/api/subs/${subId}/delete`, { method: 'POST' });
  assert.equal(again.status, 404);
});

// ---- unknown ids ----

test('subs API: unknown sub id → 404 for every action', async () => {
  const env = makeEnv();
  for (const action of ['rename', 'pin', 'reset-token', 'delete']) {
    const res = await api(env, `/api/subs/nope/${action}`, {
      method: 'POST',
      body: action === 'rename' ? { name: 'X' } : action === 'pin' ? { accountId: 'a1' } : undefined,
    });
    assert.equal(res.status, 404, action);
  }
});

// ---- public sub routes (ticket 03: snapshot-backed tokens, no session) ----

/** Seed one account (conf import — zero network) + one sub pinned to it. */
async function seedAccountAndSub(env) {
  const seeded = await api(env, '/api/accounts/import', { method: 'POST', body: { text: CONF_TEXT } });
  assert.equal(seeded.status, 200);
  const accountId = (await seeded.json()).account.id;
  const created = await (await api(env, '/api/subs', { method: 'POST', body: { name: 'Home' } })).json();
  const pinned = await api(env, `/api/subs/${created.sub.id}/pin`, { method: 'POST', body: { accountId } });
  assert.equal(pinned.status, 200);
  return { accountId, subId: created.sub.id, token: created.sub.token };
}

/** The raw sub GET without any session cookie (token IS the credential). */
function publicSubGet(env, token) {
  return workerModule.fetch(new Request(`http://panel.local/api/${token}/sub`), env, {});
}

test('public sub routes: valid token renders 200 with the 5-min cache (no session)', async () => {
  const env = makeEnv();
  const { token } = await seedAccountAndSub(env);

  const res = await publicSubGet(env, token);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /max-age=300/, '5-min cache header');
  assert.match(res.headers.get('Cache-Control'), /s-maxage=300/, 'edge cache header');
  assert.ok((await res.text()).length > 0, 'rendered payload is non-empty');
});

test('public sub routes: wrong token → 404 with no-store (no session)', async () => {
  const env = makeEnv();
  await seedAccountAndSub(env);

  const res = await publicSubGet(env, 'wrong-token');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('public sub routes: non-GET on a valid token → 405 with no-store', async () => {
  const env = makeEnv();
  const { token } = await seedAccountAndSub(env);

  const res = await workerModule.fetch(new Request(`http://panel.local/api/${token}/sub`, { method: 'POST' }), env, {});
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('public sub routes: deleted pinned account → 503 with no-store; deleted sub → 404 no-store', async () => {
  const env = makeEnv();
  const { accountId, subId, token } = await seedAccountAndSub(env);

  const delAccount = await api(env, `/api/accounts/${accountId}/delete`, { method: 'POST' });
  assert.equal(delAccount.status, 200);
  const noAccount = await publicSubGet(env, token);
  assert.equal(noAccount.status, 503, 'dangling pin → 503, not 500');
  assert.equal(noAccount.headers.get('Cache-Control'), 'no-store');

  const delSub = await api(env, `/api/subs/${subId}/delete`, { method: 'POST' });
  assert.equal(delSub.status, 200);
  const gone = await publicSubGet(env, token);
  assert.equal(gone.status, 404, 'deleted sub → 404 after the cache window');
  assert.equal(gone.headers.get('Cache-Control'), 'no-store');
});

// ---- helper: recompute a token hash for snapshot comparison ----

async function hashTokenFor(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('base64url');
}
