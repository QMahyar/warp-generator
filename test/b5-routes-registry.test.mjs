import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchRequest,
  fetchAccountsBatched,
  expandEndpoints,
  validateDns,
  testHooks
} from '../_worker.js';
const { FORMATS, ROUTES, ROUTE_TABLE, DEFAULT_DNS } = testHooks();
import {
  ACCOUNT_FIXTURE,
  FIXTURE_ADDRESSES,
  FIXTURE_PRESET,
  fixtureAccount,
  fixtureEnv
} from './helpers.mjs';

// --- Route table integrity ---

function routeKey(route) {
  return `${route.methods.slice().sort().join('|')} ${route.segments.map(s =>
    s.type === 'literal' ? s.value : s.type === 'param' ? `{${s.name}}` : `*${s.name}`
  ).join('/')}`;
}

test('route table: every row has function handler, non-empty methods, compiled segments', () => {
  assert.ok(ROUTE_TABLE.length === ROUTES.length);
  for (const route of ROUTE_TABLE) {
    assert.ok(Array.isArray(route.methods) && route.methods.length > 0, 'methods array required');
    for (const m of route.methods) assert.match(m, /^[A-Z*]+$/, `bad method ${m}`);
    assert.equal(typeof route.handler, 'function', 'handler must be a function');
    assert.equal(typeof route.auth, 'boolean', 'auth must be normalized to boolean');
    assert.ok(route.segments.length > 0 || route.methods.includes('*'), 'root row must be method-*');
  }
});

test('route table: no duplicate method+path-pattern pairs', () => {
  const seen = new Set();
  for (const route of ROUTE_TABLE) {
    const key = routeKey(route);
    assert.ok(!seen.has(key), `duplicate route row: ${key}`);
    seen.add(key);
  }
});

test('route table: every /api/* route requires auth', () => {
  const apiRows = ROUTE_TABLE.filter(r => r.segments[0]?.type === 'literal' && r.segments[0].value === 'api');
  assert.ok(apiRows.length >= 12, 'expected full api surface in table');
  for (const route of apiRows) {
    assert.equal(route.auth, true, `/api route not auth-gated: ${routeKey(route)}`);
  }
});

test('route table: setup/login/healthz/root/sub are public', () => {
  const publicKeys = ROUTE_TABLE.filter(r => !r.auth).map(routeKey).join('\n');
  for (const frag of ['healthz', 'admin/setup', 'admin/login', 'sub']) {
    assert.ok(publicKeys.includes(frag), `missing public route for ${frag}`);
  }
});

test('route table: sub catch-all sits after the token/format row', () => {
  const keys = ROUTE_TABLE.map(routeKey);
  const specific = keys.findIndex(k => k.includes('{token}'));
  const catchAll = keys.findIndex(k => k.includes('*rest'));
  assert.ok(specific !== -1 && catchAll !== -1 && specific < catchAll, 'sub rows out of order');
});

// --- Format registry ---

test('FORMATS registry: every entry has gen/contentType/ext/binary/needsAmnezia', () => {
  for (const [format, info] of Object.entries(FORMATS)) {
    assert.equal(typeof info.gen, 'function', `${format}: gen must be a function`);
    assert.match(info.contentType, /^(application|text)\//, `${format}: contentType`);
    assert.match(info.ext, /^[a-z0-9]{3,4}$/, `${format}: ext`);
    assert.equal(typeof info.binary, 'boolean', `${format}: binary`);
    assert.equal(typeof info.needsAmnezia, 'boolean', `${format}: needsAmnezia`);
  }
});

test('FORMATS registry: Amnezia formats need Amnezia resolution; zips stay binary', () => {
  const amz = Object.entries(FORMATS).filter(([, i]) => i.needsAmnezia).map(([k]) => k);
  assert.deepEqual(amz, ['wireguard-conf-amnezia', 'throne-amnezia', 'singbox-amnezia', 'singbox-legacy-amnezia', 'clash-amnezia']);
  const zips = Object.entries(FORMATS).filter(([, i]) => i.binary).map(([k]) => k);
  assert.deepEqual(zips, ['wireguard-conf', 'wireguard-conf-amnezia']);
});

test('FORMATS registry: each gen produces output for fixture configs (smoke)', async () => {
  const { fixtureConfigs } = await import('./helpers.mjs');
  const configs = await fixtureConfigs();
  for (const [format, info] of Object.entries(FORMATS)) {
    const body = info.gen(configs, null);
    assert.ok(body !== undefined && body !== null, `${format} produced nothing`);
    if (!info.binary) {
      assert.ok(String(body).length > 0, `${format} produced empty text`);
    } else {
      assert.ok(body.byteLength > 0, `${format} produced empty zip`);
    }
  }
});

// --- expandEndpoints normalization shape ---

test('expandEndpoints: normalized fields present on every config', async () => {
  const expanded = await expandEndpoints(ACCOUNT_FIXTURE, fixtureEnv([FIXTURE_PRESET]));
  assert.equal(expanded.error, undefined);
  assert.ok(expanded.configs.length > 1);
  for (const cfg of expanded.configs) {
    assert.deepEqual(cfg.addressList, [FIXTURE_ADDRESSES.ipv4, FIXTURE_ADDRESSES.ipv6]);
    assert.deepEqual(cfg.addressCidr, [FIXTURE_ADDRESSES.ipv4, FIXTURE_ADDRESSES.ipv6]);
    assert.equal(cfg.v4Host, '10.2.0.2');
    assert.equal(cfg.v6Host, 'fd00:60ca:98fa:c88b:1234:5678:90ab:cdef');
    assert.deepEqual(cfg.allowedIps, ['0.0.0.0/0', '::/0']);
    assert.equal(cfg.dns, DEFAULT_DNS);
    assert.equal(cfg.tag, `${cfg.name} ${cfg.ip}:${cfg.port}`);
  }
});

test('expandEndpoints: CIDR suffix added only where missing', async () => {
  const acct = fixtureAccount({
    config: { ...ACCOUNT_FIXTURE.config, addresses: { ipv4: '10.9.9.9', ipv6: 'fd00::7' } }
  });
  const [cfg] = (await expandEndpoints(acct, fixtureEnv([FIXTURE_PRESET]))).configs;
  assert.deepEqual(cfg.addressCidr, ['10.9.9.9/32', 'fd00::7/128']);
  assert.deepEqual(cfg.addressList, ['10.9.9.9', 'fd00::7']);
});

test('expandEndpoints: single-config tag carries no endpoint suffix', async () => {
  const single = [{ id: 'single', name: 'Single', endpoints: [{ ip: '162.159.192.1', port: 2408 }] }];
  const acct = fixtureAccount({ endpoint_list: { type: 'preset', preset_id: 'single' } });
  const [cfg] = (await expandEndpoints(acct, fixtureEnv(single))).configs;
  assert.equal(cfg.tag, ACCOUNT_FIXTURE.name);
});

// --- Per-account/preset DNS ---

test('validateDns: accepts IPs/hostnames/null, rejects junk', () => {
  assert.equal(validateDns('1.1.1.1'), null);
  assert.equal(validateDns('2606:4700:4700::1111'), null);
  assert.equal(validateDns('dns.quad9.net'), null);
  assert.equal(validateDns(null), null);
  assert.equal(validateDns(undefined), null);
  assert.equal(validateDns(''), null);
  assert.match(validateDns('not a dns!'), /Invalid DNS/);
  assert.match(validateDns(42), /must be a hostname or IP/);
  assert.match(validateDns('a'.repeat(254)), /too long/);
});

test('expandEndpoints: dns precedence account > preset > default', async () => {
  const preset = [{ ...FIXTURE_PRESET, dns: '9.9.9.9' }];
  const plain = fixtureAccount();
  assert.equal((await expandEndpoints(plain, fixtureEnv(preset))).configs[0].dns, '9.9.9.9');

  const withDns = fixtureAccount({ dns: '1.0.0.1' });
  assert.equal((await expandEndpoints(withDns, fixtureEnv(preset))).configs[0].dns, '1.0.0.1');

  const custom = fixtureAccount({
    dns: 'dns.quad9.net',
    endpoint_list: { type: 'custom', custom_endpoints: [{ ip: '9.9.9.9', port: 1 }] }
  });
  assert.equal((await expandEndpoints(custom, fixtureEnv())).configs[0].dns, 'dns.quad9.net');

  const absent = fixtureAccount({ dns: '' , endpoint_list: { type: 'custom', custom_endpoints: [{ ip: '9.9.9.9', port: 1 }] } });
  assert.equal((await expandEndpoints(absent, fixtureEnv())).configs[0].dns, DEFAULT_DNS);
});

// --- listAccounts batching primitive ---

async function countingGetter(ids, { dropKey = null, tick = 1 } = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const store = new Map(ids.map(id => [id, { id }]));
  const getter = async key => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(r => setTimeout(r, tick));
    inFlight--;
    return key === dropKey ? null : store.get(key);
  };
  return { getter, stats: () => ({ maxInFlight }) };
}

test('fetchAccountsBatched: batches of batchSize run concurrently, order preserved, nulls skipped', async () => {
  const ids = Array.from({ length: 45 }, (_, i) => `k${String(i).padStart(2, '0')}`);
  const { getter, stats } = await countingGetter(ids, { dropKey: 'k07' });

  const accounts = await fetchAccountsBatched(ids, getter, 20);
  assert.equal(accounts.length, 44);
  assert.deepEqual(accounts.map(a => a.id), ids.filter(id => id !== 'k07'));
  assert.equal(stats().maxInFlight, 20, 'batch wave must be fully concurrent');
});

test('fetchAccountsBatched: fewer than one batch still works, empty input yields []', async () => {
  const small = await countingGetter(['a', 'b'], {});
  assert.deepEqual(await fetchAccountsBatched(['a', 'b'], small.getter, 20), [{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(await fetchAccountsBatched([], async () => { throw new Error('never called'); }, 20), []);
});

test('fetchAccountsBatched: default batch size is 20 and respects it', async () => {
  const ids = Array.from({ length: 41 }, (_, i) => `id-${i}`);
  const { getter, stats } = await countingGetter(ids, {});
  const accounts = await fetchAccountsBatched(ids, getter);
  assert.equal(accounts.length, 41);
  assert.equal(stats().maxInFlight, 20);
});

// --- Dispatcher behavior (smoke) ---

function kvMock({ passwordSet = true, sessions = {}, accounts = [] } = {}) {
  const accountByKey = new Map(accounts.map(a => [`account:${a.id}`, a]));
  return {
    WARP_KV: {
      get: async (key, opts) => {
        if (key === 'settings:password') return passwordSet ? 'pbkdf2$fakehash' : null;
        if (key.startsWith('session:')) {
          const raw = sessions[key];
          return raw ? (opts?.type === 'json' ? raw : JSON.stringify(raw)) : null;
        }
        if (accountByKey.has(key)) return opts?.type === 'json' ? accountByKey.get(key) : JSON.stringify(accountByKey.get(key));
        if (key === 'presets') return null;
        return null;
      },
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: accounts.map(a => ({ name: `account:${a.id}` })) })
    }
  };
}

const SESSION = { expires_at: Date.now() + 60_000 };

async function dispatch(url, init, env) {
  return await dispatchRequest(new Request(url, init), env ?? kvMock(), undefined, ROUTE_TABLE);
}

test('dispatch: unknown path → 404', async () => {
  const res = await dispatch('https://w.example/nope');
  assert.equal(res.status, 404);
});

test('dispatch: root redirects to /admin regardless of method', async () => {
  for (const method of ['GET', 'POST']) {
    const res = await dispatch('https://w.example/', { method });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin');
  }
});

test('dispatch: method mismatch on known pattern → 405 with Allow header', async () => {
  const res = await dispatch('https://w.example/api/presets', { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, POST');

  const res2 = await dispatch('https://w.example/healthz', { method: 'POST' });
  assert.equal(res2.status, 405);
  assert.equal(res2.headers.get('allow'), 'GET');
});

test('dispatch: /api/accounting does NOT match the account API (no sloppy startsWith)', async () => {
  const res = await dispatch('https://w.example/api/accounting');
  assert.equal(res.status, 501);
});

test('dispatch: unauthenticated /api/* redirects to login when password exists', async () => {
  const res = await dispatch('https://w.example/api/account');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/admin/login');
});

test('dispatch: unauthenticated /admin redirects to setup on first run', async () => {
  const res = await dispatch('https://w.example/admin', {}, kvMock({ passwordSet: false }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/admin/setup');
});

test('dispatch: expired session counts as unauthenticated', async () => {
  const env = kvMock({ sessions: { 'session:expired': { expires_at: Date.now() - 1000 } } });
  const res = await dispatch('https://w.example/admin', { headers: { Cookie: 'session=expired' } }, env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/admin/login');
});

test('dispatch: valid session reaches protected handler', async () => {
  const env = kvMock({ sessions: { 'session:good': SESSION } });
  const res = await dispatch('https://w.example/api/account', { headers: { Cookie: 'session=good' } }, env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('dispatch: healthz is open without a session', async () => {
  const res = await dispatch('https://w.example/healthz');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('dispatch: malformed sub paths keep their legacy 400', async () => {
  for (const tail of ['/sub/tok', '/sub/tok/', '/sub/BAD-TOK!/singbox']) {
    const res = await dispatch(`https://w.example${tail}`);
    assert.equal(res.status, 400, tail);
  }
});

test('dispatch: unknown format on well-formed sub URL → 404 with validFormats', async () => {
  const res = await dispatch('https://w.example/sub/11111111-2222-4333-8444-555555555555/nope');
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.deepEqual(body.validFormats, Object.keys(FORMATS));
});
