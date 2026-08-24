import { test } from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import {
  dispatchRequest,
  testHooks,
  subscriptionHeaders,
  expandGroupConfigs
} from '../_worker.js';
const { ROUTE_TABLE, FORMATS, VERSION } = testHooks();
import { FIXTURE_PRESET, fixtureAccount } from './helpers.mjs';

// --- shared mocks ---

function kvMock({
  sessions = {},
  accounts = [],
  presets = [FIXTURE_PRESET],
  settingsGlobal = null,
  aggs = [],
  failPutKeys = null,
  onGet = null
} = {}) {
  const store = new Map();
  for (const [key, value] of Object.entries(sessions)) store.set(key, structuredClone(value));
  for (const a of accounts) {
    store.set(`account:${a.id}`, structuredClone(a));
    store.set(`token:${a.token}`, a.id);
  }
  if (presets !== null) store.set('presets', structuredClone(presets));
  if (settingsGlobal) store.set('settings:global', structuredClone(settingsGlobal));
  for (const r of aggs) store.set(`agg:${r.token}`, structuredClone(r));
  const puts = [];
  const deletes = [];
  return {
    puts,
    deletes,
    store,
    WARP_KV: {
      get: async (key, opts) => {
        if (onGet) await onGet(key, store);
        if (key === 'settings:password') return 'pbkdf2$fakehash';
        if (!store.has(key)) return null;
        const v = store.get(key);
        if (opts?.type === 'json') return typeof v === 'string' ? JSON.parse(v) : structuredClone(v);
        return typeof v === 'string' ? v : JSON.stringify(v);
      },
      put: async (key, value) => {
        if (failPutKeys && failPutKeys.test(key)) throw new Error('kv down');
        store.set(key, value);
        puts.push([key, value]);
      },
      delete: async (key) => {
        store.delete(key);
        deletes.push(key);
      },
      list: async ({ prefix } = {}) => ({
        keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({ name: k })),
        cursor: undefined
      })
    }
  };
}

const SESSION = { expires_at: Date.now() + 60_000 };
const AUTH = { headers: { Cookie: 'session=good', 'Content-Type': 'application/json' } };

async function dispatch(url, init, env) {
  return await dispatchRequest(new Request(url, init), env, undefined, ROUTE_TABLE);
}

function installCaches(recorder) {
  const original = globalThis.caches;
  globalThis.caches = {
    default: {
      match: async () => undefined,
      put: async () => {},
      delete: async (req) => { recorder.push(req.url); return true; }
    }
  };
  return () => { globalThis.caches = original; };
}

function aggRecord(token, groups) {
  return { token, groups, created_at: '2026-01-01T00:00:00.000Z' };
}

// route params are UUID-shaped — hand-built tokens must match
const AGG_TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function readRaw(env, key) {
  return env.store.get(key);
}

function readJson(env, key) {
  const raw = env.store.get(key);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// --- parseCookie boundary (auth must key off the exact cookie name) ---

test('parseCookie: similarly-named cookies no longer hijack or shadow the session', async () => {
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [fixtureAccount()] });
  // decoy BEFORE the real cookie — old regex matched the first "…session=" anywhere
  const res = await dispatch('https://w.example/api/account', {
    headers: { Cookie: 'admin_session=decoy; session=good' }
  }, env);
  assert.equal(res.status, 200);

  // cookie whose name merely ENDS with "session" must not authenticate
  const imposter = await dispatch('https://w.example/api/account', {
    headers: { Cookie: 'xsession=decoy' }
  }, env);
  assert.equal(imposter.status, 302);
});

// --- aggregate cache purge fan-out ---

test('account update with dns change purges group-subscription caches', async () => {
  const acct = fixtureAccount({ group: 'g1' });
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct], aggs: [aggRecord('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ['g1'])] });
  const purged = [];
  const restore = installCaches(purged);
  try {
    const res = await dispatch(`https://w.example/api/account/${acct.id}`, {
      method: 'PUT', ...AUTH, body: JSON.stringify({ dns: '1.1.1.1' })
    }, env);
    assert.equal(res.status, 200);
    assert.ok(purged.some(u => u.includes('/sub/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/singbox')), `agg URLs purged, got: ${purged.join(',')}`);
    assert.ok(purged.some(u => u.includes(`/sub/${acct.token}/singbox`)), 'own token also purged');
  } finally {
    restore();
  }
});

test('account delete purges group-subscription caches of its group', async () => {
  const acct = fixtureAccount({ group: 'g1' });
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct], aggs: [aggRecord('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ['other', 'g1'])] });
  const purged = [];
  const restore = installCaches(purged);
  try {
    const res = await dispatch(`https://w.example/api/account/${acct.id}`, {
      method: 'DELETE', headers: AUTH.headers
    }, env);
    assert.equal(res.status, 200);
    assert.ok(purged.some(u => u.includes('/sub/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/clash')), `agg URLs purged, got: ${purged.join(',')}`);
  } finally {
    restore();
  }
});

test('no-op account update writes nothing and purges nothing', async () => {
  const acct = fixtureAccount({ group: 'g1', dns: '1.1.1.1' });
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct], aggs: [aggRecord('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ['g1'])] });
  const purged = [];
  const restore = installCaches(purged);
  try {
    const res = await dispatch(`https://w.example/api/account/${acct.id}`, {
      method: 'PUT', ...AUTH, body: JSON.stringify({ name: acct.name, dns: '1.1.1.1', group: 'g1' })
    }, env);
    assert.equal(res.status, 200);
    assert.equal(env.puts.filter(([k]) => k === `account:${acct.id}`).length, 0, 'no KV write');
    assert.equal(purged.length, 0, 'no cache purge');
  } finally {
    restore();
  }
});

test('tokenMeta-only update skips the aggregate purge but still purges own token', async () => {
  const acct = fixtureAccount({ group: 'g1' });
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct], aggs: [aggRecord('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ['g1'])] });
  const purged = [];
  const restore = installCaches(purged);
  try {
    const res = await dispatch(`https://w.example/api/account/${acct.id}`, {
      method: 'PUT', ...AUTH, body: JSON.stringify({ tokenMeta: { label: 'Phone' } })
    }, env);
    assert.equal(res.status, 200);
    assert.ok(!purged.some(u => u.includes('/sub/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/')), 'no agg purge');
    assert.ok(purged.some(u => u.includes(`/sub/${acct.token}/`)), 'own token purge remains');
  } finally {
    restore();
  }
});

// --- unknown preset rejected at save time (was a serve-time 500) ---

test('account update rejects unknown preset_id with 400', async () => {
  const acct = fixtureAccount();
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct] });
  const res = await dispatch(`https://w.example/api/account/${acct.id}`, {
    method: 'PUT', ...AUTH, body: JSON.stringify({ endpoint_list: { type: 'preset', preset_id: 'nope' } })
  }, env);
  assert.equal(res.status, 400);

  const ok = await dispatch(`https://w.example/api/account/${acct.id}`, {
    method: 'PUT', ...AUTH, body: JSON.stringify({ endpoint_list: { type: 'preset', preset_id: 'fixture' } })
  }, env);
  assert.equal(ok.status, 200);
});

// --- token regeneration ordering ---

test('regenerate-token: success retires the old mapping and serves the new one', async () => {
  const acct = fixtureAccount();
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct] });
  const res = await dispatch(`https://w.example/api/account/${acct.id}/regenerate-token`, {
    method: 'POST', headers: AUTH.headers
  }, env);
  assert.equal(res.status, 200);
  const { token: newToken } = await res.json();
  assert.notEqual(newToken, acct.token);
  assert.equal(readRaw(env, `token:${newToken}`), acct.id, 'new mapping present');
  assert.equal(env.store.has(`token:${acct.token}`), false, 'old mapping gone');

  const oldSub = await dispatch(`https://w.example/sub/${acct.token}/singbox`, {}, env);
  assert.equal(oldSub.status, 404);
  const newSub = await dispatch(`https://w.example/sub/${newToken}/singbox`, {}, env);
  assert.equal(newSub.status, 200);
});

test('regenerate-token: token-map write failure leaves the old token fully working', async () => {
  const acct = fixtureAccount();
  const env = kvMock({
    sessions: { 'session:good': SESSION },
    accounts: [acct],
    failPutKeys: /^token:/
  });
  const res = await dispatch(`https://w.example/api/account/${acct.id}/regenerate-token`, {
    method: 'POST', headers: AUTH.headers
  }, env);
  assert.equal(res.status, 500);
  assert.equal(readRaw(env, `token:${acct.token}`), acct.id, 'old mapping intact');
  assert.equal(readJson(env, `account:${acct.id}`).token, acct.token, 'account record untouched');
});

test('regenerate-token: account-write failure compensates away the new mapping', async () => {
  const acct = fixtureAccount();
  const newToken = '99999999-2222-4333-8444-555555555555';
  const env = kvMock({
    sessions: { 'session:good': SESSION },
    accounts: [acct],
    failPutKeys: /^account:/,
    onGet: async (key, store) => {
      // pin the generated uuid so we can assert compensation deterministically
      if (store.has('__pin__')) return;
      store.set('__pin__', true);
      const orig = globalThis.crypto.randomUUID;
      globalThis.crypto.randomUUID = () => newToken;
      setTimeout(() => { globalThis.crypto.randomUUID = orig; }, 0);
    }
  });
  const res = await dispatch(`https://w.example/api/account/${acct.id}/regenerate-token`, {
    method: 'POST', headers: AUTH.headers
  }, env);
  assert.equal(res.status, 500);
  assert.equal(env.store.has(`token:${newToken}`), false, 'compensating delete ran');
  assert.equal(readRaw(env, `token:${acct.token}`), acct.id, 'old mapping intact');
});

// --- fetchCount merge-on-fresh (lost-update race) ---

test('fetch counter merges into the fresh record instead of the stale snapshot', async () => {
  const acct = fixtureAccount();
  let accountReads = 0;
  const env = kvMock({
    sessions: { 'session:good': SESSION },
    accounts: [acct],
    onGet: async (key, store) => {
      // second read of account:{id} inside incrementFetchCount sees an admin
      // edit that landed after resolveToken's snapshot was taken
      if (key === `account:${acct.id}` && ++accountReads === 2) {
        const raw = store.get(key);
        const fresh = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
        fresh.tokenMeta = { disabled: true };
        store.set(key, JSON.stringify(fresh));
      }
    }
  });
  const res = await dispatch(`https://w.example/sub/${acct.token}/clash`, {}, env);
  assert.equal(res.status, 200);
  const written = JSON.parse(env.puts.find(([k]) => k === `account:${acct.id}`)[1]);
  assert.equal(written.fetchCount, 1);
  assert.equal(written.tokenMeta.disabled, true, 'concurrent admin edit not resurrected');
});

// --- duplicate proxy names in aggregate output ---

test('group subs qualify duplicate member names so clients never see dup tags', () => {
  const row = (ip, tag) => ({ ip, port: 2408, tag });
  const merged = expandGroupConfigs([[row('1.1.1.1', 'Phone')], [row('2.2.2.2', 'Phone')]]);
  const tags = merged.map(c => c.tag);
  assert.equal(new Set(tags).size, tags.length, `tags unique, got: ${tags.join(' | ')}`);
  assert.deepEqual(tags, ['Phone', 'Phone 2']);
});

test('group clash output has unique proxy names end-to-end', async () => {
  // two same-named accounts with DIFFERENT single endpoints — forces a tag collision
  const mk = (n, id, ip) => {
    const a = fixtureAccount({ id, name: n, group: 'g1' });
    a.endpoint_list = { type: 'custom', custom_endpoints: [{ ip, port: 2408 }] };
    return a;
  };
  const a = mk('Phone', '00000000-0000-4000-8000-000000000001', '1.1.1.1');
  const b = mk('Phone', '00000000-0000-4000-8000-000000000002', '2.2.2.2');
  const env = kvMock({
    sessions: { 'session:good': SESSION },
    accounts: [a, b],
    aggs: [aggRecord(AGG_TOKEN, ['g1'])]
  });
  const res = await dispatch(`https://w.example/sub/${AGG_TOKEN}/clash`, {}, env);
  assert.equal(res.status, 200);
  const doc = yaml.load(await res.text());
  const names = doc.proxies.map(p => p.name);
  assert.equal(names.length, 2);
  assert.equal(new Set(names).size, 2, `names unique, got: ${names.join(', ')}`);
});

// --- amnezia settings whitelist ---

test('global amnezia update persists only known keys', async () => {
  const env = kvMock({
    sessions: { 'session:good': SESSION },
    settingsGlobal: { amnezia: { Jc: 3 } }
  });
  const res = await dispatch('https://w.example/api/settings/amnezia', {
    method: 'PUT', ...AUTH,
    body: JSON.stringify({ Jc: 7, evilKey: { deep: true }, Jmin: 40, Jmax: 900 })
  }, env);
  assert.equal(res.status, 200);
  const stored = readJson(env, 'settings:global');
  assert.equal(stored.amnezia.Jc, 7);
  assert.equal('evilKey' in stored.amnezia, false, 'unknown keys dropped');

  const getRes = await dispatch('https://w.example/api/settings/amnezia', { headers: AUTH.headers }, env);
  assert.equal('evilKey' in (await getRes.json()), false);
});

// --- backup import: skip mode keeps existing global amnezia ---

async function exportToBase64(env) {
  const res = await dispatch('https://w.example/api/backup/export', {
    method: 'POST', ...AUTH, body: JSON.stringify({ password: 'password123' })
  }, env);
  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

test('backup import in skip mode keeps existing global amnezia; overwrite replaces it', async () => {
  const srcEnv = kvMock({
    sessions: { 'session:good': SESSION },
    accounts: [fixtureAccount()],
    settingsGlobal: { amnezia: { Jc: 5 } }
  });
  const blob = await exportToBase64(srcEnv);

  const skipEnv = kvMock({
    sessions: { 'session:good': SESSION },
    settingsGlobal: { amnezia: { Jc: 9, S1: 4 } }
  });
  const skipRes = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH, body: JSON.stringify({ blob, password: 'password123', mode: 'skip' })
  }, skipEnv);
  assert.equal(skipRes.status, 200);
  assert.equal(readJson(skipEnv, 'settings:global').amnezia.Jc, 9, 'existing amnezia kept');
  assert.equal(readJson(skipEnv, 'settings:global').amnezia.S1, 4);

  const overEnv = kvMock({
    sessions: { 'session:good': SESSION },
    settingsGlobal: { amnezia: { Jc: 9 } }
  });
  const overRes = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH, body: JSON.stringify({ blob, password: 'password123', mode: 'overwrite' })
  }, overEnv);
  assert.equal(overRes.status, 200);
  assert.equal(readJson(overEnv, 'settings:global').amnezia.Jc, 5, 'overwrite applies backup amnezia');
});

// --- expiry-aware cache TTL ---

test('subscriptionHeaders caps max-age at token expiry', () => {
  const soon = subscriptionHeaders(FORMATS['clash'], 'clash', 'x', {
    expiresAt: new Date(Date.now() + 50_000).toISOString()
  });
  const age = parseInt(soon['Cache-Control'].split('=')[1], 10);
  assert.ok(age >= 0 && age <= 50, `max-age capped near expiry, got ${age}`);

  const far = subscriptionHeaders(FORMATS['clash'], 'clash', 'x', {
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  assert.equal(far['Cache-Control'], 'max-age=300');

  const none = subscriptionHeaders(FORMATS['clash'], 'clash', 'x', {});
  assert.equal(none['Cache-Control'], 'max-age=300');
});

// --- dashboard ETag ---

test('dashboard serves 304 on matching If-None-Match', async () => {
  const env = kvMock({ sessions: { 'session:good': SESSION } });
  const full = await dispatch('https://w.example/admin', { headers: { Cookie: 'session=good' } }, env);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('ETag'), `"${VERSION}"`);

  const cached = await dispatch('https://w.example/admin', {
    headers: { Cookie: 'session=good', 'If-None-Match': `"${VERSION}"` }
  }, env);
  assert.equal(cached.status, 304);
});
