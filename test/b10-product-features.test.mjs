import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchRequest,
  testHooks,
  encryptBackupJson,
  decryptBackupBytes,
  buildBackupPayload,
  validateBackupPayloadStructure,
  validateBackupPassword,
  mergeAccounts,
  applyPreferredOrder,
  expandGroupConfigs,
  sanitizeGroupName,
  validateGroupTag,
  validateAggRecord,
  validatePreferredOrder,
  sanitizePreferredOrder,
  expandEndpoints,
  registerWarpAccount
} from '../_worker.js';
const { ROUTE_TABLE } = testHooks();
import { FIXTURE_PRESET, FIXTURE_ENDPOINTS, fixtureAccount } from './helpers.mjs';

// --- shared mocks ---

function kvMock({
  passwordSet = true,
  sessions = {},
  accounts = [],
  presets = [FIXTURE_PRESET],
  settingsGlobal = null,
  aggs = [],
  warpstatus = null,
  failPuts = false
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
  if (warpstatus) store.set('settings:warpstatus', structuredClone(warpstatus));
  const puts = [];
  const deletes = [];
  return {
    puts,
    deletes,
    store,
    WARP_KV: {
      get: async (key, opts) => {
        if (key === 'settings:password') return passwordSet ? 'pbkdf2$fakehash' : null;
        if (!store.has(key)) return null;
        const v = store.get(key);
        if (opts?.type === 'json') return typeof v === 'string' ? JSON.parse(v) : structuredClone(v);
        return typeof v === 'string' ? v : JSON.stringify(v);
      },
      put: async (key, value) => {
        if (failPuts) throw new Error('kv down');
        store.set(key, value);
        puts.push([key, value]);
      },
      delete: async (key) => {
        if (failPuts) throw new Error('kv down');
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
const AUTH_GET = { headers: { Cookie: 'session=good' } };

async function dispatch(url, init, env) {
  return await dispatchRequest(new Request(url, init), env, undefined, ROUTE_TABLE);
}

function readJson(env, key) {
  const raw = env.store.get(key);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// --- pure: buildBackupPayload / structure / password ---

test('buildBackupPayload: builds versioned payload with defaults', () => {
  const built = buildBackupPayload([fixtureAccount()], [FIXTURE_PRESET], { amnezia: {} });
  assert.equal(built.error, undefined);
  assert.equal(built.payload.version, 1);
  assert.equal(built.payload.accounts.length, 1);
  assert.equal(built.payload.presets.length, 1);
  assert.ok(!Number.isNaN(Date.parse(built.payload.exportedAt)));
});

test('buildBackupPayload: honors explicit exportedAt and rejects bad inputs', () => {
  const built = buildBackupPayload([], [], null, '2026-08-23T00:00:00.000Z');
  assert.equal(built.payload.exportedAt, '2026-08-23T00:00:00.000Z');
  assert.match(buildBackupPayload('x', []).error, /accounts must be an array/);
  assert.match(buildBackupPayload([], 'x').error, /presets must be an array/);
});

test('validateBackupPayloadStructure: accepts v1, rejects everything else', () => {
  assert.equal(validateBackupPayloadStructure({ version: 1, accounts: [], presets: [] }), null);
  assert.equal(validateBackupPayloadStructure({ version: 1, accounts: [], presets: [], settings: null }), null);
  assert.match(validateBackupPayloadStructure(null), /must be an object/);
  assert.match(validateBackupPayloadStructure([]), /must be an object/);
  assert.match(validateBackupPayloadStructure({ version: 2 }), /Unsupported backup version/);
  assert.match(validateBackupPayloadStructure({ version: 1 }), /accounts section/);
  assert.match(validateBackupPayloadStructure({ version: 1, accounts: [] }), /presets section/);
  assert.match(
    validateBackupPayloadStructure({ version: 1, accounts: [], presets: [], settings: 42 }),
    /settings section/
  );
});

test('validateBackupPassword: bounds enforced', () => {
  assert.equal(validateBackupPassword('longenough'), null);
  assert.match(validateBackupPassword('short1'), /at least 8/);
  assert.match(validateBackupPassword(12345678), /at least 8/);
  assert.match(validateBackupPassword('x'.repeat(129)), /max 128/);
  assert.equal(validateBackupPassword('y'.repeat(128)), null);
});

// --- pure: mergeAccounts ---

test('mergeAccounts: skip mode keeps existing ids and skips incoming dupes', () => {
  const existing = [fixtureAccount()];
  const incoming = [
    fixtureAccount({ name: 'Renamed' }),
    fixtureAccount({
      id: '00000000-0000-4000-8000-000000000002',
      token: '99999999-2222-4333-8444-555555555555',
      name: 'New Guy'
    })
  ];
  const r = mergeAccounts(existing, incoming, 'skip');
  assert.equal(r.error, undefined);
  assert.equal(r.imported, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.errors.length, 0);
  assert.equal(r.result[0].name, 'New Guy');
});

test('mergeAccounts: overwrite replaces by id and reports replaced tokens', () => {
  const existing = [fixtureAccount()];
  const replacement = fixtureAccount({ name: 'Replaced', token: '99999999-2222-4333-8444-555555555555' });
  const r = mergeAccounts(existing, [replacement], 'overwrite');
  assert.equal(r.imported, 1);
  assert.equal(r.skipped, 0);
  assert.deepEqual(r.replacedOldTokens, ['11111111-2222-4333-8444-555555555555']);
  assert.equal(r.result[0].name, 'Replaced');
});

test('mergeAccounts: invalid entries land in errors, never stored', () => {
  const bad = fixtureAccount({ config: { private_key: '', addresses: {}, peer_public_key: '' } });
  const junk = 'not-an-object';
  const r = mergeAccounts([], [bad, junk], 'skip');
  assert.equal(r.imported, 0);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0].error, /private/i);
  assert.match(r.errors[1].error, /not an object/);
});

test('mergeAccounts: token collision with different existing id is an error entry', () => {
  const existing = [fixtureAccount()];
  const collision = fixtureAccount({
    id: '00000000-0000-4000-8000-00000000000aa',
    token: '11111111-2222-4333-8444-555555555555'
  });
  const r = mergeAccounts(existing, [collision], 'overwrite');
  assert.equal(r.imported, 0);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].error, /token already used/);
});

test('mergeAccounts: duplicate token inside incoming batch is rejected once claimed', () => {
  const a = fixtureAccount({ id: '00000000-0000-4000-8000-000000000001' });
  const b = fixtureAccount({ id: '00000000-0000-4000-8000-000000000002' });
  const r = mergeAccounts([], [a, b], 'skip');
  assert.equal(r.imported, 1);
  assert.match(r.errors[0].error, /token already used/);
});

test('mergeAccounts: mode and input types validated', () => {
  assert.match(mergeAccounts([], [], 'upsert').error, /mode must be/);
  assert.match(mergeAccounts(null, [], 'skip').error, /must be arrays/);
});

// --- pure: ordering + group merge ---

test('applyPreferredOrder: stable sort, known-good first, rest keep original order', () => {
  const rows = [{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3 }];
  assert.deepEqual(applyPreferredOrder(rows, [2, 0]).map(r => r.i), [2, 0, 1, 3]);
});

test('applyPreferredOrder: ignores out-of-range, duplicates and non-integers', () => {
  const rows = [{ i: 0 }, { i: 1 }, { i: 2 }];
  assert.deepEqual(applyPreferredOrder(rows, [2, 2, 9, -1, 1.5, 'x']).map(r => r.i), [2, 0, 1]);
});

test('applyPreferredOrder: passthrough for absent/empty order', () => {
  const rows = [{ i: 0 }];
  assert.equal(applyPreferredOrder(rows, null), rows);
  assert.equal(applyPreferredOrder(rows, []), rows);
  const pair = [{ i: 0 }, { i: 1 }];
  assert.deepEqual(applyPreferredOrder(pair, [0]), pair);
});

test('expandEndpoints: preset.preferredOrder reorders generated configs', async () => {
  const orderedPreset = { ...FIXTURE_PRESET, preferredOrder: [2, 0] };
  const expanded = await expandEndpoints(fixtureAccount(), {
    WARP_KV: { get: async key => (key === 'presets' ? [orderedPreset] : null) }
  });
  assert.equal(expanded.configs[0].endpoint, '[2606:4700:d0::a29f:c001]:2408');
  assert.equal(expanded.configs[1].endpoint, 'engage.cloudflareclient.com:2408');
});

test('expandGroupConfigs: concatenates and dedupes identical ip:port across accounts', () => {
  const mk = (ip, port, who) => ({ ip, port, name: who });
  const listA = [mk('1.1.1.1', 2408, 'A'), mk('2.2.2.2', 500, 'A')];
  const listB = [mk('1.1.1.1', 2408, 'B'), mk('3.3.3.3', 1701, 'B')];
  const merged = expandGroupConfigs([listA, listB]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].name, 'A');
  assert.equal(merged.find(c => c.ip === '3.3.3.3').name, 'B');
});

// --- pure: group tags + agg records ---

test('group tag sanitize + validate rules', () => {
  assert.equal(sanitizeGroupName('  home\x01<tag> '), 'hometag');
  assert.equal(validateGroupTag(undefined), null);
  assert.equal(validateGroupTag(null), null);
  assert.match(validateGroupTag(42), /must be a string/);
  assert.match(validateGroupTag('   '), /1-50 characters/);
  assert.match(validateGroupTag('g'.repeat(51)), /1-50 characters/);
  assert.equal(validateGroupTag('g'.repeat(50)), null);
});

test('validateAggRecord: lifecycle-bearing record accepted/rejected', () => {
  const now = new Date('2026-08-23T12:00:00Z');
  const valid = {
    token: 'abcdefgh-1234',
    groups: ['home'],
    created_at: now.toISOString(),
    tokenMeta: { expiresAt: '2027-01-01T00:00:00.000Z' }
  };
  assert.equal(validateAggRecord(valid, now), null);
  assert.match(validateAggRecord(null, now), /must be an object/);
  assert.match(validateAggRecord({ groups: ['x'] }, now), /invalid agg token/);
  assert.match(validateAggRecord({ token: 'abcdefgh-1234' }, now), /at least one group/);
  assert.match(
    validateAggRecord({ token: 'abcdefgh-1234', groups: Array.from({ length: 51 }, (_, i) => `g${i}`) }, now),
    /too many groups/
  );
  assert.match(validateAggRecord({ token: 'abcdefgh-1234', groups: [42] }, now), /invalid group name/);
  assert.match(validateAggRecord({ token: 'abcdefgh-1234', groups: ['ok'], label: 9 }, now), /label/);
  assert.match(
    validateAggRecord({ token: 'abcdefgh-1234', groups: ['ok'], tokenMeta: { expiresAt: '2020-01-01T00:00:00Z' } }, now),
    /future/
  );
});

test('preferredOrder validators', () => {
  assert.equal(validatePreferredOrder([0, 2, 5]), null);
  assert.match(validatePreferredOrder('x'), /array/);
  assert.match(validatePreferredOrder([1, 1]), /unique/);
  assert.match(validatePreferredOrder([-1]), /integers 0-199/);
  assert.match(validatePreferredOrder(Array.from({ length: 201 }, (_, i) => i)), /too long/);
  assert.deepEqual(sanitizePreferredOrder([4, 0, 0, 99, 2], 3), [0, 2]);
});

// --- crypto round-trip (Node 22 globalThis.crypto) ---

test('backup crypto: encrypt→decrypt round-trips payload exactly', async () => {
  const payload = JSON.stringify({ version: 1, hello: 'warp', n: [1, 2, 3] });
  const blob = await encryptBackupJson(payload, 'correct horse battery');
  assert.ok(blob instanceof Uint8Array);
  const dec = await decryptBackupBytes(blob, 'correct horse battery');
  assert.equal(dec.error, undefined);
  assert.equal(dec.json, payload);
});

test('backup crypto: wrong password and corrupted/truncated blobs fail cleanly', async () => {
  const blob = await encryptBackupJson('{"version":1}', 'right-password');
  const wrong = await decryptBackupBytes(blob, 'wrong-password');
  assert.match(wrong.error, /Decryption failed/);
  assert.match((await decryptBackupBytes(blob.slice(4), 'right-password')).error, /Not a valid backup/);
  assert.match((await decryptBackupBytes(new Uint8Array(10), 'right-password')).error, /Not a valid backup/);
  assert.match((await decryptBackupBytes('junk', 'pw')).error, /Not a valid backup/);
});

// --- integration: routes ---

test('backup routes require auth', async () => {
  const env = kvMock();
  const res = await dispatch('https://w.example/api/backup/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'password123' })
  }, env);
  assert.equal(res.status, 302);
});

test('backup export validates password and emits .wgenc attachment', async () => {
  const acct = fixtureAccount();
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct], settingsGlobal: { amnezia: { Jc: 5 } } });

  const bad = await dispatch('https://w.example/api/backup/export', {
    method: 'POST', ...AUTH, body: JSON.stringify({ password: 'short' })
  }, env);
  assert.equal(bad.status, 400);

  const res = await dispatch('https://w.example/api/backup/export', {
    method: 'POST', ...AUTH, body: JSON.stringify({ password: 'password123' })
  }, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
  assert.match(res.headers.get('content-disposition'), /backup\.wgenc/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const textMagic = new TextDecoder().decode(bytes.slice(0, 6));
  assert.equal(textMagic, 'WGENC1');
});

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

test('backup import: full round-trip restores working subscription into fresh KV', async () => {
  const acct = fixtureAccount();
  const srcEnv = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct], settingsGlobal: { amnezia: { Jc: 5 } } });
  const blob = await exportToBase64(srcEnv);

  const dstEnv = kvMock({ sessions: { 'session:good': SESSION }, accounts: [], presets: null });

  const wrongPw = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH,
    body: JSON.stringify({ blob, password: 'wrong-password-1', mode: 'skip' })
  }, dstEnv);
  assert.equal(wrongPw.status, 400);

  const res = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH,
    body: JSON.stringify({ blob, password: 'password123', mode: 'skip' })
  }, dstEnv);
  assert.equal(res.status, 200);
  const report = await res.json();
  assert.equal(report.imported, 1);
  assert.equal(report.skipped, 0);
  assert.equal(report.errors.length, 0);
  assert.equal(report.presetsImported, 1);
  assert.equal(report.settingsApplied, true);

  const sub = await dispatch(`https://w.example/sub/${acct.token}/singbox`, {}, dstEnv);
  assert.equal(sub.status, 200);
  const doc = await sub.json();
  assert.equal(doc.endpoints.length, FIXTURE_ENDPOINTS.length);
});

test('backup import: skip vs overwrite policies behave', async () => {
  const acct = fixtureAccount({ name: 'Original' });
  const srcEnv = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct] });
  const blob = await exportToBase64(srcEnv);

  const existingSameId = fixtureAccount({ name: 'Kept' });
  const skipEnv = kvMock({ sessions: { 'session:good': SESSION }, accounts: [existingSameId], presets: null });
  const skipRes = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH,
    body: JSON.stringify({ blob, password: 'password123', mode: 'skip' })
  }, skipEnv);
  const skipReport = await skipRes.json();
  assert.equal(skipReport.imported, 0);
  assert.equal(skipReport.skipped, 1);
  assert.equal(readJson(skipEnv, `account:${existingSameId.id}`).name, 'Kept');

  const overEnv = kvMock({ sessions: { 'session:good': SESSION }, accounts: [existingSameId], presets: null });
  const overRes = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH,
    body: JSON.stringify({ blob, password: 'password123', mode: 'overwrite' })
  }, overEnv);
  const overReport = await overRes.json();
  assert.equal(overReport.imported, 1);
  assert.equal(readJson(overEnv, `account:${existingSameId.id}`).name, 'Original');
});

test('backup import: structurally broken payloads are rejected with 400', async () => {
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [], presets: null });
  const garbage = Buffer.from(await encryptBackupJson('not-json-at-all{{{', 'password123')).toString('base64');
  const badJson = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH, body: JSON.stringify({ blob: garbage, password: 'password123' })
  }, env);
  assert.equal(badJson.status, 400);

  const notJsonPayload = Buffer.from(
    await encryptBackupJson(JSON.stringify({ version: 3 }), 'password123')
  ).toString('base64');
  const badVersion = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH, body: JSON.stringify({ blob: notJsonPayload, password: 'password123' })
  }, env);
  assert.equal(badVersion.status, 400);
  assert.match((await badVersion.json()).error, /version|payload/i);

  const plainGarbage = Buffer.from('this is not a backup').toString('base64');
  const noMagic = await dispatch('https://w.example/api/backup/import', {
    method: 'POST', ...AUTH, body: JSON.stringify({ blob: plainGarbage, password: 'password123' })
  }, env);
  assert.equal(noMagic.status, 400);
});

// --- integration: warp status ---

test('warp status: dedicated GET returns stored state or ok:null', async () => {
  const emptyEnv = kvMock({ sessions: { 'session:good': SESSION } });
  const empty = await dispatch('https://w.example/api/settings/warpstatus', AUTH_GET, emptyEnv);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { ok: null, checkedAt: null, lastError: null });

  const env = kvMock({
    sessions: { 'session:good': SESSION },
    warpstatus: { ok: false, checkedAt: '2026-08-23T10:00:00.000Z', lastError: 'Warp API timeout' }
  });
  const res = await dispatch('https://w.example/api/settings/warpstatus', AUTH_GET, env);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.lastError, 'Warp API timeout');
});

test('warp status: registerWarpAccount records success/failure into settings:warpstatus', async () => {
  const origFetch = globalThis.fetch;
  try {
    const env = kvMock({});
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'wid',
        token: 'wtok',
        client_id: 'AAAA',
        config: {
          interface: { addresses: { v4: '172.16.0.2/32', v6: 'fd01::1/128' } },
          peers: [{ public_key: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=' }]
        }
      }),
      headers: new Headers()
    });
    const reg = await registerWarpAccount(env);
    assert.equal(reg.ok, true);
    const written = JSON.parse(env.store.get('settings:warpstatus'));
    assert.equal(written.ok, true);

    globalThis.fetch = async () => { throw new TypeError('boom'); };
    const failing = await registerWarpAccount(env);
    assert.equal(failing.ok, false);
    const failure = JSON.parse(env.store.get('settings:warpstatus'));
    assert.equal(failure.ok, false);
    assert.ok(typeof failure.lastError === 'string' && failure.lastError.length > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// --- integration: aggregate subscriptions ---

async function setupGroupEnv() {
  const acct1 = fixtureAccount({ group: 'home' });
  const acct2 = fixtureAccount({
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Second',
    token: '22222222-3333-4444-8555-666666666666',
    group: 'home',
    endpoint_list: {
      type: 'custom',
      custom_endpoints: [
        { ip: FIXTURE_ENDPOINTS[0].ip, port: FIXTURE_ENDPOINTS[0].port },
        { ip: '198.51.100.77', port: 4500 }
      ]
    }
  });
  const env = kvMock({
    sessions: { 'session:good': SESSION },
    accounts: [acct1, acct2]
  });
  return { env, acct1, acct2 };
}

test('agg subscriptions: create → list → revoke lifecycle', async () => {
  const { env } = await setupGroupEnv();

  const noGroups = await dispatch('https://w.example/api/agg', {
    method: 'POST', ...AUTH, body: JSON.stringify({ groups: [] })
  }, env);
  assert.equal(noGroups.status, 400);

  const badExpiry = await dispatch('https://w.example/api/agg', {
    method: 'POST', ...AUTH, body: JSON.stringify({ groups: ['home'], expiresAt: '2020-01-01T00:00:00Z' })
  }, env);
  assert.equal(badExpiry.status, 400);

  const create = await dispatch('https://w.example/api/agg', {
    method: 'POST', ...AUTH,
    body: JSON.stringify({ groups: [' home '], label: 'Phones', expiresAt: '2027-01-01T00:00:00.000Z' })
  }, env);
  assert.equal(create.status, 201);
  const record = await create.json();
  assert.deepEqual(record.groups, ['home']);
  assert.equal(record.label, 'Phones');

  const listed = await dispatch('https://w.example/api/agg', AUTH_GET, env);
  const list = await listed.json();
  assert.equal(list.length, 1);
  assert.equal(env.store.has(`agg:${record.token}`), true);

  const del = await dispatch(`https://w.example/api/agg/${record.token}`, { method: 'DELETE', ...AUTH }, env);
  assert.equal(del.status, 200);
  assert.equal(env.store.has(`agg:${record.token}`), false);
  const gone = await dispatch(`https://w.example/api/agg/${record.token}`, { method: 'DELETE', ...AUTH }, env);
  assert.equal(gone.status, 404);
});

test('agg subscriptions: /sub/{aggToken}/{format} merges and dedupes member configs', async () => {
  const { env } = await setupGroupEnv();
  const create = await dispatch('https://w.example/api/agg', {
    method: 'POST', ...AUTH, body: JSON.stringify({ groups: ['home'] })
  }, env);
  const record = await create.json();

  const sub = await dispatch(`https://w.example/sub/${record.token}/singbox`, {}, env);
  assert.equal(sub.status, 200);
  const doc = await sub.json();
  const seen = new Set();
  for (const ep of doc.endpoints) {
    const peer = ep.peers[0];
    const key = `${peer.address}:${peer.port}`;
    assert.ok(!seen.has(key), 'duplicate endpoint served');
    seen.add(key);
  }

  assert.equal(seen.has('engage.cloudflareclient.com:2408'), true);
  assert.equal(seen.has('198.51.100.77:4500'), true);

  const fetchCountRaw = env.store.get(`agg:${record.token}`);
  assert.equal(JSON.parse(fetchCountRaw).fetchCount, 1);
});

test('agg subscriptions: unknown group serves 404, expired agg serves 410, revoked 410', async () => {
  const { env } = await setupGroupEnv();
  const empty = await dispatch('https://w.example/api/agg', {
    method: 'POST', ...AUTH, body: JSON.stringify({ groups: ['ghost-group'] })
  }, env);
  const ghost = await empty.json();
  const miss = await dispatch(`https://w.example/sub/${ghost.token}/singbox`, {}, env);
  assert.equal(miss.status, 404);

  const expired = {
    token: 'abcdefab-1234-4567-89ab-cdef12345678',
    groups: ['home'],
    tokenMeta: { expiresAt: '2020-01-01T00:00:00.000Z' }
  };
  env.store.set(`agg:${expired.token}`, JSON.stringify(expired));
  const gone = await dispatch(`https://w.example/sub/${expired.token}/singbox`, {}, env);
  assert.equal(gone.status, 410);
  assert.equal(await gone.text(), 'Subscription expired');

  const revoked = {
    token: 'bcdefabc-1234-4567-89ab-cdef12345678',
    groups: ['home'],
    tokenMeta: { disabled: true }
  };
  env.store.set(`agg:${revoked.token}`, JSON.stringify(revoked));
  const dead = await dispatch(`https://w.example/sub/${revoked.token}/clash`, {}, env);
  assert.equal(dead.status, 410);
  assert.equal(await dead.text(), 'Subscription revoked');
});

test('agg subscriptions: expired/disabled member accounts are excluded from merge', async () => {
  const { env, acct2 } = await setupGroupEnv();
  const disabledMember = fixtureAccount({
    id: '00000000-0000-4000-8000-0000000000099',
    token: '88888888-3333-4444-8555-666666666666',
    group: 'home',
    endpoint_list: {
      type: 'custom',
      custom_endpoints: [{ ip: '203.0.113.99', port: 9999 }]
    },
    tokenMeta: { disabled: true }
  });
  env.store.set(`account:${disabledMember.id}`, JSON.stringify(disabledMember));
  env.store.set(`token:${disabledMember.token}`, disabledMember.id);
  void acct2;

  const create = await dispatch('https://w.example/api/agg', {
    method: 'POST', ...AUTH, body: JSON.stringify({ groups: ['home'] })
  }, env);
  const record = await create.json();
  const sub = await dispatch(`https://w.example/sub/${record.token}/throne`, {}, env);
  const text = await sub.text();
  assert.ok(!text.includes('203.0.113.99'), 'disabled member leaked into aggregate');
});

// --- integration: account group tag ---

test('account update: group tag set/clear/validate round-trips through API', async () => {
  const acct = fixtureAccount();
  const env = kvMock({ sessions: { 'session:good': SESSION }, accounts: [acct] });
  const url = `https://w.example/api/account/${acct.id}`;

  const set = await dispatch(url, { method: 'PUT', ...AUTH, body: JSON.stringify({ group: '  Home\x02 <lab> ' }) }, env);
  assert.equal(set.status, 200);
  assert.equal((await set.json()).group, 'Home lab');

  const tooLong = await dispatch(url, { method: 'PUT', ...AUTH, body: JSON.stringify({ group: 'g'.repeat(51) }) }, env);
  assert.equal(tooLong.status, 400);

  const clear = await dispatch(url, { method: 'PUT', ...AUTH, body: JSON.stringify({ group: null }) }, env);
  assert.equal(clear.status, 200);
  assert.equal((await clear.json()).group, null);
});
