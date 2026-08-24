import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchRequest, tokenStatus, validateTokenMeta, testHooks } from '../_worker.js';
const { ROUTE_TABLE, FORMATS } = testHooks();
import { FIXTURE_PRESET, fixtureAccount } from './helpers.mjs';

// --- tokenStatus (pure) ---

const NOW = new Date('2026-08-23T12:00:00.000Z');
const FUTURE = '2026-09-23T12:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';

test('tokenStatus: absent tokenMeta → active, no msRemaining', () => {
  const r = tokenStatus(fixtureAccount(), NOW);
  assert.deepEqual(r, { state: 'active' });
});

test('tokenStatus: empty meta and null expiry → active', () => {
  assert.deepEqual(tokenStatus(fixtureAccount({ tokenMeta: {} }), NOW), { state: 'active' });
  assert.deepEqual(tokenStatus(fixtureAccount({ tokenMeta: { label: 'x', expiresAt: null } }), NOW), { state: 'active' });
});

test('tokenStatus: future expiry → active with msRemaining', () => {
  const r = tokenStatus(fixtureAccount({ tokenMeta: { expiresAt: FUTURE } }), NOW);
  assert.equal(r.state, 'active');
  assert.equal(r.msRemaining, Date.parse(FUTURE) - NOW.getTime());
});

test('tokenStatus: past expiry → expired with msRemaining 0', () => {
  const r = tokenStatus(fixtureAccount({ tokenMeta: { expiresAt: PAST } }), NOW);
  assert.equal(r.state, 'expired');
  assert.equal(r.msRemaining, 0);
});

test('tokenStatus: expiry exactly now → expired', () => {
  const r = tokenStatus(fixtureAccount({ tokenMeta: { expiresAt: NOW.toISOString() } }), NOW);
  assert.equal(r.state, 'expired');
});

test('tokenStatus: disabled wins over expiry (even future)', () => {
  const r = tokenStatus(fixtureAccount({ tokenMeta: { expiresAt: FUTURE, disabled: true } }), NOW);
  assert.deepEqual(r, { state: 'revoked' });
});

test('tokenStatus: invalid ISO fails open to active', () => {
  assert.deepEqual(tokenStatus(fixtureAccount({ tokenMeta: { expiresAt: 'not-a-date' } }), NOW), { state: 'active' });
  assert.deepEqual(tokenStatus(fixtureAccount({ tokenMeta: { expiresAt: 12345 } }), NOW), { state: 'active' });
});

test('tokenStatus: accepts Date or ISO string or absent now', () => {
  const acct = fixtureAccount({ tokenMeta: { expiresAt: FUTURE } });
  assert.ok(tokenStatus(acct).msRemaining > 0);
  assert.equal(tokenStatus(acct, new Date('2027-01-01T00:00:00Z')).state, 'expired');
  assert.equal(tokenStatus(acct, '2027-01-01T00:00:00Z').state, 'expired');
  assert.equal(tokenStatus(null, NOW).state, 'active');
});

// --- validateTokenMeta (pure) ---

test('validateTokenMeta: undefined/null meta is valid', () => {
  assert.equal(validateTokenMeta(undefined, NOW), null);
  assert.equal(validateTokenMeta(null, NOW), null);
});

test('validateTokenMeta: non-object meta rejected', () => {
  assert.match(validateTokenMeta('x', NOW), /must be an object/);
  assert.match(validateTokenMeta([], NOW), /must be an object/);
  assert.match(validateTokenMeta(42, NOW), /must be an object/);
});

test('validateTokenMeta: label bounds and sanitization', () => {
  assert.equal(validateTokenMeta({ label: 'Phone' }, NOW), null);
  assert.equal(validateTokenMeta({ label: '  spaced  ' }, NOW), null);
  assert.match(validateTokenMeta({ label: '' }, NOW), /1-100/);
  assert.match(validateTokenMeta({ label: '   ' }, NOW), /1-100/);
  assert.match(validateTokenMeta({ label: 'a'.repeat(101) }, NOW), /1-100/);
  assert.equal(validateTokenMeta({ label: 'a'.repeat(100) }, NOW), null);
  assert.match(validateTokenMeta({ label: 42 }, NOW), /must be a string/);
  assert.equal(validateTokenMeta({ label: '\x01\x02ctrl\x7f<>' }, NOW), null);
  assert.match(validateTokenMeta({ label: '\x00\x01\x02\x03' }, NOW), /1-100/);
});

test('validateTokenMeta: expiry rules', () => {
  assert.equal(validateTokenMeta({}, NOW), null);
  assert.equal(validateTokenMeta({ expiresAt: null }, NOW), null);
  assert.equal(validateTokenMeta({ expiresAt: FUTURE }, NOW), null);
  assert.match(validateTokenMeta({ expiresAt: PAST }, NOW), /future/);
  assert.match(validateTokenMeta({ expiresAt: NOW.toISOString() }, NOW), /future/);
  assert.match(validateTokenMeta({ expiresAt: 'not-a-date' }, NOW), /valid ISO date/);
  assert.match(validateTokenMeta({ expiresAt: 42 }, NOW), /ISO date string or null/);
});

test('validateTokenMeta: unchanged current expiry bypasses future check but not ISO check', () => {
  assert.equal(
    validateTokenMeta({ expiresAt: PAST }, NOW, { expiresAt: PAST }),
    null
  );
  assert.match(
    validateTokenMeta({ expiresAt: PAST }, NOW, { expiresAt: PAST + 'x' }),
    /future/
  );
  assert.match(
    validateTokenMeta({ expiresAt: 'garbage' }, NOW, { expiresAt: 'garbage' }),
    /valid ISO date/
  );
});

test('validateTokenMeta: disabled flag types', () => {
  assert.equal(validateTokenMeta({ disabled: true }, NOW), null);
  assert.equal(validateTokenMeta({ disabled: false }, NOW), null);
  assert.match(validateTokenMeta({ disabled: 'yes' }, NOW), /true or false/);
  assert.match(validateTokenMeta({ disabled: 1 }, NOW), /true or false/);
  assert.equal(validateTokenMeta({ disabled: null }, NOW), null);
  assert.equal(validateTokenMeta({ whatever: 'ignored' }, NOW), null);
});

// --- Integration via dispatchRequest ---

function kvMock({ passwordSet = true, sessions = {}, accounts = [], failPuts = false } = {}) {
  const accountByKey = new Map(accounts.map(a => [`account:${a.id}`, a]));
  const tokenByKey = new Map(accounts.map(a => [`token:${a.token}`, a.id]));
  const puts = [];
  return {
    puts,
    WARP_KV: {
      get: async (key, opts) => {
        if (key === 'settings:password') return passwordSet ? 'pbkdf2$fakehash' : null;
        if (key.startsWith('session:')) {
          const raw = sessions[key];
          return raw ? (opts?.type === 'json' ? raw : JSON.stringify(raw)) : null;
        }
        if (accountByKey.has(key)) {
          return opts?.type === 'json' ? accountByKey.get(key) : JSON.stringify(accountByKey.get(key));
        }
        if (tokenByKey.has(key)) return tokenByKey.get(key);
        if (key === 'presets') return [FIXTURE_PRESET];
        return null;
      },
      put: async (key, value) => {
        if (failPuts) throw new Error('kv down');
        puts.push([key, value]);
      },
      delete: async () => {},
      list: async () => ({ keys: accounts.map(a => ({ name: `account:${a.id}` })) })
    }
  };
}

const SESSION = { expires_at: Date.now() + 60_000 };
const TOKEN = '11111111-2222-4333-8444-555555555555';
const SUB_URL = `https://w.example/sub/${TOKEN}/singbox`;

async function dispatch(url, init, env) {
  return await dispatchRequest(new Request(url, init), env, undefined, ROUTE_TABLE);
}

test('sub: legacy account without tokenMeta behaves exactly as before', async () => {
  const res = await dispatch(SUB_URL, {}, kvMock({ accounts: [fixtureAccount()] }));
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.endpoints.length, FIXTURE_PRESET.endpoints.length);
});

test('sub: expired token → 410 plain-text "Subscription expired", no-store', async () => {
  const acct = fixtureAccount({ tokenMeta: { expiresAt: PAST } });
  const res = await dispatch(SUB_URL, {}, kvMock({ accounts: [acct] }));
  assert.equal(res.status, 410);
  assert.equal(await res.text(), 'Subscription expired');
  assert.match(res.headers.get('content-type'), /^text\/plain/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('sub: disabled token → 410 "Subscription revoked"', async () => {
  const acct = fixtureAccount({ tokenMeta: { label: 'old', disabled: true } });
  const res = await dispatch(SUB_URL, {}, kvMock({ accounts: [acct] }));
  assert.equal(res.status, 410);
  assert.equal(await res.text(), 'Subscription revoked');
});

test('sub: active token with future expiry serves normally', async () => {
  const acct = fixtureAccount({ tokenMeta: { expiresAt: FUTURE } });
  const res = await dispatch(SUB_URL, {}, kvMock({ accounts: [acct] }));
  assert.equal(res.status, 200);
});

test('sub: origin GET increments fetchCount on account KV object', async () => {
  const env = kvMock({ accounts: [fixtureAccount()] });
  await dispatch(SUB_URL, {}, env);
  const write = env.puts.find(([k]) => k === `account:${fixtureAccount().id}`);
  assert.ok(write, 'account key must be rewritten');
  assert.equal(JSON.parse(write[1]).fetchCount, 1);
});

test('sub: fetchCount increments across sequential origin serves', async () => {
  const env = kvMock({ accounts: [fixtureAccount()] });
  await dispatch(SUB_URL, {}, env);
  await dispatch(SUB_URL, {}, env);
  const countWrites = env.puts.filter(([k]) => k === `account:${fixtureAccount().id}`).length;
  assert.equal(countWrites, 2);
});

test('sub: counter KV failure does not break serving', async () => {
  const env = kvMock({ accounts: [fixtureAccount()], failPuts: true });
  const res = await dispatch(SUB_URL, {}, env);
  assert.equal(res.status, 200);
});

test('api: PUT tokenMeta stores sanitized values and detail exposes them', async () => {
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [fixtureAccount()] });
  const auth = { headers: { Cookie: 'session=good', 'Content-Type': 'application/json' } };
  const putRes = await dispatch(`https://w.example/api/account/${fixtureAccount().id}`, {
    method: 'PUT',
    ...auth,
    body: JSON.stringify({ tokenMeta: { label: '  Phone \x01<x> ', expiresAt: FUTURE, disabled: false } })
  }, env);
  assert.equal(putRes.status, 200);
  const updated = await putRes.json();
  assert.equal(updated.tokenMeta.label, 'Phone x');
  assert.equal(updated.tokenMeta.expiresAt, new Date(FUTURE).toISOString());
  assert.equal(updated.tokenMeta.disabled, false);

  const getRes = await dispatch(`https://w.example/api/account/${fixtureAccount().id}`, { headers: { Cookie: 'session=good' } }, env);
  const detail = await getRes.json();
  assert.equal(detail.tokenMeta.label, 'Phone x');
  assert.equal(detail.fetchCount, 0);
});

test('api: PUT tokenMeta merges partially and clears on null', async () => {
  const env = kvMock({
    sessions: { 'session:good': SESSION },
    accounts: [fixtureAccount({ tokenMeta: { label: 'Keep', expiresAt: FUTURE } })]
  });
  const url = `https://w.example/api/account/${fixtureAccount().id}`;
  const auth = { headers: { Cookie: 'session=good', 'Content-Type': 'application/json' } };

  await dispatch(url, { method: 'PUT', ...auth, body: JSON.stringify({ tokenMeta: { disabled: true } }) }, env);
  let detail = await (await dispatch(url, { headers: { Cookie: 'session=good' } }, env)).json();
  assert.equal(detail.tokenMeta.label, 'Keep');
  assert.ok(detail.tokenMeta.expiresAt);
  assert.equal(detail.tokenMeta.disabled, true);

  await dispatch(url, { method: 'PUT', ...auth, body: JSON.stringify({ tokenMeta: { expiresAt: null } }) }, env);
  detail = await (await dispatch(url, { headers: { Cookie: 'session=good' } }, env)).json();
  assert.equal(detail.tokenMeta.label, 'Keep');
  assert.equal(detail.tokenMeta.expiresAt, undefined);
  assert.equal(detail.tokenMeta.disabled, true);

  await dispatch(url, { method: 'PUT', ...auth, body: JSON.stringify({ tokenMeta: { label: null } }) }, env);
  detail = await (await dispatch(url, { headers: { Cookie: 'session=good' } }, env)).json();
  assert.equal(detail.tokenMeta.label, undefined);
});

test('api: PUT rejects bad tokenMeta with 400', async () => {
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [fixtureAccount()] });
  const url = `https://w.example/api/account/${fixtureAccount().id}`;
  const auth = { headers: { Cookie: 'session=good', 'Content-Type': 'application/json' } };

  for (const tm of [
    { label: '' },
    { label: 'a'.repeat(101) },
    { label: 5 },
    { expiresAt: 'not-a-date' },
    { expiresAt: '2020-01-01T00:00:00Z' },
    { expiresAt: 42 },
    { disabled: 'nope' },
    'junk'
  ]) {
    const res = await dispatch(url, { method: 'PUT', ...auth, body: JSON.stringify({ tokenMeta: tm }) }, env);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(tm)}`);
    const body = await res.json();
    assert.ok(body.error && body.error.length > 0);
  }

  const listRes = await dispatch('https://w.example/api/account', { headers: { Cookie: 'session=good' } }, env);
  const list = await listRes.json();
  assert.equal(list[0].tokenMeta, null);
  assert.equal(list[0].fetchCount, 0);
});

test('sub: revoked/expired gate runs after token resolution, before generation', async () => {
  const acct = fixtureAccount({ tokenMeta: { disabled: true } });
  const env = kvMock({ accounts: [acct] });
  for (const format of Object.keys(FORMATS)) {
    const res = await dispatch(`https://w.example/sub/${TOKEN}/${format}`, {}, env);
    assert.equal(res.status, 410, format);
    assert.equal(res.headers.get('cache-control'), 'no-store', format);
  }
});
