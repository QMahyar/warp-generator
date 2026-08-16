/**
 * Ticket 10 tests — the import module's pure parts: conf/JSON parsers,
 * auto-detection, record building + validation with the new fields, and the
 * soft verification flow (stubbed global fetch — per ticket 02's pattern).
 * Since ticket 01, importAccountRecord() does NOT write KV — the caller
 * splices the returned record into the state snapshot; these tests assert
 * that no store interaction exists at all.
 * Runs under `node --test` with zero npm dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import {
  AccountError,
  isValidAccountRecord,
  publicAccount,
} from './account.js';
import {
  buildImportRecord,
  importAccountRecord,
  parseImportText,
  parseRegistrationJson,
  parseWgConf,
  verifyAccountCredentials,
} from './import.js';

// ---- fixtures (throwaway keys, never real) ----

const KEY_A = Buffer.alloc(32, 0x41).toString('base64'); // 'A' × 32
const KEY_B = Buffer.alloc(32, 0x42).toString('base64'); // 'B' × 32
const KEY_C = Buffer.alloc(32, 0x43).toString('base64'); // 'C' × 32
const FIXED_NOW = Date.UTC(2026, 7, 15, 12, 0, 0); // 2026-08-15T12:00:00Z

const CONF_V4 = `[Interface]
PrivateKey = ${KEY_A}
Address = 172.16.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${KEY_B}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
`;

const CONF_V4_V6 = `[Interface]
PrivateKey = ${KEY_A}
Address = 172.16.0.2/32, fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789/128
DNS = 1.1.1.1, 2606:4700:4700::1111
MTU = 1280

[Peer]
PublicKey = ${KEY_B}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;

const WARP_JSON = {
  result: {
    id: 'client-id-123',
    token: 'token-abc',
    config: {
      client_id: 'QGV1zKUsRS4=',
      mtu: 1280,
      peers: [
        { public_key: KEY_B },
        { public_key: KEY_C }, // first peer wins, like extractAccountRecord
      ],
      interface: {
        addresses: {
          v4: '172.16.0.2',
          v6: 'fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789',
        },
        private_key: KEY_A,
      },
    },
  },
};

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

// ---- conf parser ----

test('conf parse: v4-only conf maps every field (DNS/AllowedIPs carried, Endpoint ignored)', () => {
  const m = parseWgConf(CONF_V4);
  assert.equal(m.format, 'conf');
  assert.equal(m.privateKey, KEY_A);
  assert.equal(m.peerPublicKey, KEY_B);
  assert.equal(m.v4, '172.16.0.2');
  assert.equal(m.v6, '');
  assert.equal(m.clientId, null);
  assert.equal(m.token, null);
  assert.equal(m.reserved, '');
  assert.equal(m.dns, '1.1.1.1');
  assert.equal(m.allowedIPs, '0.0.0.0/0, ::/0');
  assert.ok(!JSON.stringify(m).includes('engage.cloudflareclient.com'), 'Endpoint deliberately ignored');
});

test('conf parse: v4+v6 Address, junk lines and comments tolerated', () => {
  const m = parseWgConf(CONF_V4_V6);
  assert.equal(m.v4, '172.16.0.2');
  assert.equal(m.v6, 'fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789');
});

test('conf parse: space-separated Address list works', () => {
  const m = parseWgConf(`[Interface]\nPrivateKey = ${KEY_A}\nAddress = 172.16.0.2/32 fd01::1/128\n[Peer]\nPublicKey = ${KEY_B}`);
  assert.equal(m.v4, '172.16.0.2');
  assert.equal(m.v6, 'fd01::1');
});

test('conf parse: missing PrivateKey → readable error', () => {
  assert.throws(() => parseWgConf('[Interface]\nAddress = 172.16.0.2/32\n[Peer]\nPublicKey = ' + KEY_B),
    (err) => err instanceof AccountError && /\[Interface\] PrivateKey/.test(err.message));
});

test('conf parse: non-base64 PrivateKey → readable error', () => {
  assert.throws(() => parseWgConf('[Interface]\nPrivateKey = not-a-key!\nAddress = 172.16.0.2/32\n[Peer]\nPublicKey = ' + KEY_B),
    (err) => err instanceof AccountError && /base64/.test(err.message));
});

test('conf parse: wrong-length PrivateKey → readable error', () => {
  assert.throws(() => parseWgConf('[Interface]\nPrivateKey = aGVsbG8=\nAddress = 172.16.0.2/32\n[Peer]\nPublicKey = ' + KEY_B),
    (err) => err instanceof AccountError && /32 bytes/.test(err.message));
});

test('conf parse: missing Address → readable error', () => {
  assert.throws(() => parseWgConf(`[Interface]\nPrivateKey = ${KEY_A}\n[Peer]\nPublicKey = ${KEY_B}`),
    (err) => err instanceof AccountError && /Address/.test(err.message));
});

test('conf parse: v6-only Address → readable error (the record needs the v4 address)', () => {
  assert.throws(() => parseWgConf(`[Interface]\nPrivateKey = ${KEY_A}\nAddress = fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789/128\n[Peer]\nPublicKey = ${KEY_B}`),
    (err) => err instanceof AccountError && /IPv4/.test(err.message));
});

test('conf parse: missing [Peer] PublicKey → readable error', () => {
  assert.throws(() => parseWgConf(`[Interface]\nPrivateKey = ${KEY_A}\nAddress = 172.16.0.2/32`),
    (err) => err instanceof AccountError && /\[Peer\] PublicKey/.test(err.message));
});

// ---- JSON parser ----

test('json parse: full result-shaped record maps every field (first peer, client_id reserved)', () => {
  const m = parseRegistrationJson(JSON.stringify(WARP_JSON));
  assert.equal(m.format, 'json');
  assert.equal(m.clientId, 'client-id-123');
  assert.equal(m.token, 'token-abc');
  assert.equal(m.privateKey, KEY_A);
  assert.equal(m.peerPublicKey, KEY_B); // first peer only
  assert.equal(m.v4, '172.16.0.2');
  assert.equal(m.v6, 'fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789');
  assert.equal(m.reserved, 'QGV1zKUsRS4='); // config.client_id passthrough (extractAccountRecord mirror)
});

test('json parse: unwrapped result object accepted', () => {
  const unwrapped = { ...WARP_JSON.result };
  const m = parseRegistrationJson(JSON.stringify(unwrapped));
  assert.equal(m.clientId, 'client-id-123');
  assert.equal(m.token, 'token-abc');
  assert.equal(m.v4, '172.16.0.2');
});

test('json parse: reserved comes from the reserved bytes array / base64 field as fallback', () => {
  const doc = { result: { config: { interface: { addresses: { v4: '172.16.0.2' }, private_key: KEY_A }, peers: [{ public_key: KEY_B }] } } };
  const bytes = [109, 213, 199];
  const withBytes = { result: { ...doc.result, config: { ...doc.result.config, reserved: bytes } } };
  const withStr = { result: { ...doc.result, config: { ...doc.result.config, reserved: 'bdXD' } } };
  assert.equal(parseRegistrationJson(JSON.stringify(withBytes)).reserved,
    Buffer.from(bytes).toString('base64'));
  assert.equal(parseRegistrationJson(JSON.stringify(withStr)).reserved, 'bdXD');
});

test('json parse: missing reserved → empty string (renderers derive [0,0,0])', () => {
  const doc = { result: { id: 'c', token: 't', config: { interface: { addresses: { v4: '172.16.0.2', v6: 'fd01::1' }, private_key: KEY_A }, peers: [{ public_key: KEY_B }] } } };
  assert.equal(parseRegistrationJson(JSON.stringify(doc)).reserved, '');
});

test('json parse: reserved bytes out of range → readable error', () => {
  const doc = { result: { config: { reserved: [1, 2, 999], interface: { addresses: { v4: '172.16.0.2' }, private_key: KEY_A }, peers: [{ public_key: KEY_B }] } } };
  assert.throws(() => parseRegistrationJson(JSON.stringify(doc)), (err) => err instanceof AccountError && /reserved/.test(err.message));
});

test('json parse: missing interface.private_key → readable error pointing at the operator-held key', () => {
  const doc = JSON.parse(JSON.stringify(WARP_JSON));
  delete doc.result.config.interface.private_key;
  assert.throws(() => parseRegistrationJson(JSON.stringify(doc)),
    (err) => err instanceof AccountError && /interface.private_key/.test(err.message) && /operator/.test(err.message));
});

test('json parse: missing v4 address → readable error', () => {
  const doc = JSON.parse(JSON.stringify(WARP_JSON));
  delete doc.result.config.interface.addresses.v4;
  assert.throws(() => parseRegistrationJson(JSON.stringify(doc)),
    (err) => err instanceof AccountError && /addresses\.v4/.test(err.message));
});

test('json parse: missing peer public key → readable error', () => {
  const doc = JSON.parse(JSON.stringify(WARP_JSON));
  doc.result.config.peers = [];
  assert.throws(() => parseRegistrationJson(JSON.stringify(doc)),
    (err) => err instanceof AccountError && /public_key/.test(err.message));
});

test('json parse: id/token missing → null (conf-like unverified import)', () => {
  const doc = { result: { config: { interface: { addresses: { v4: '172.16.0.2' }, private_key: KEY_A }, peers: [{ public_key: KEY_B }] } } };
  const m = parseRegistrationJson(JSON.stringify(doc));
  assert.equal(m.clientId, null);
  assert.equal(m.token, null);
});

test('json parse: foreign shape → readable error', () => {
  assert.throws(() => parseRegistrationJson(JSON.stringify({ hello: 'world' })),
    (err) => err instanceof AccountError && /config/.test(err.message));
  assert.throws(() => parseRegistrationJson(JSON.stringify([1, 2, 3])), AccountError);
});

test('json parse: invalid JSON → readable error', () => {
  assert.throws(() => parseRegistrationJson('{not json'), (err) => err instanceof AccountError && /Not valid JSON/.test(err.message));
});

// ---- auto-detect ----

test('auto-detect: JSON first, conf fallback', () => {
  assert.equal(parseImportText(JSON.stringify(WARP_JSON)).format, 'json');
  assert.equal(parseImportText(CONF_V4).format, 'conf');
});

test('auto-detect: garbage that matches neither format → error listing both', () => {
  assert.throws(() => parseImportText('hello world, this is my warp stuff'),
    (err) => err instanceof AccountError && /WireGuard \.conf/.test(err.message) && /warp-reg/.test(err.message));
  assert.throws(() => parseImportText('   '), (err) => err instanceof AccountError && /Empty input/.test(err.message));
});

// ---- record building + validation with the new fields ----

test('buildImportRecord: conf material → import record with defaults (null creds, no verdict)', () => {
  const rec = buildImportRecord(parseWgConf(CONF_V4), { now: () => FIXED_NOW });
  assert.deepEqual(rec, {
    privateKey: KEY_A,
    clientId: null,
    token: null,
    peerPublicKey: KEY_B,
    v4: '172.16.0.2',
    v6: '',
    reserved: '',
    source: 'import',
    verified: false,
    verifiedAt: null,
    registeredAt: '2026-08-15T12:00:00.000Z',
  });
  assert.equal(isValidAccountRecord(rec), true);
});

test('buildImportRecord: json material keeps credentials and reserved', () => {
  const rec = buildImportRecord(parseRegistrationJson(JSON.stringify(WARP_JSON)), { now: () => FIXED_NOW });
  assert.equal(rec.clientId, 'client-id-123');
  assert.equal(rec.token, 'token-abc');
  assert.equal(rec.reserved, 'QGV1zKUsRS4=');
  assert.equal(rec.source, 'import');
  assert.equal(rec.registeredAt, '2026-08-15T12:00:00.000Z'); // import time
  assert.equal(isValidAccountRecord(rec), true);
});

test('isValidAccountRecord: ticket-10 field rules (nullable creds, source/verified/verifiedAt)', () => {
  const base = buildImportRecord(parseWgConf(CONF_V4), { now: () => FIXED_NOW });
  // null credentials are legal (conf import); empty strings are not.
  assert.equal(isValidAccountRecord({ ...base, clientId: 'c', token: 't' }), true);
  assert.equal(isValidAccountRecord({ ...base, clientId: '' }), false);
  assert.equal(isValidAccountRecord({ ...base, token: '' }), false);
  assert.equal(isValidAccountRecord({ ...base, token: 42 }), false);
  // source/verified/verifiedAt rules.
  assert.equal(isValidAccountRecord({ ...base, source: 'register' }), true);
  assert.equal(isValidAccountRecord({ ...base, source: 'banana' }), false);
  assert.equal(isValidAccountRecord({ ...base, verified: true, verifiedAt: '2026-08-15T12:00:00.000Z' }), true);
  assert.equal(isValidAccountRecord({ ...base, verified: 'yes' }), false);
  assert.equal(isValidAccountRecord({ ...base, verifiedAt: 'not-a-date' }), false);
  assert.equal(isValidAccountRecord({ ...base, verifiedAt: null }), true);
  // legacy pre-import records (no ticket-10 fields) still read as valid.
  const legacy = { ...base };
  delete legacy.source; delete legacy.verified; delete legacy.verifiedAt;
  assert.equal(isValidAccountRecord(legacy), true);
});

test('publicAccount: import records expose the verdict, never the credentials', () => {
  const rec = buildImportRecord(parseRegistrationJson(JSON.stringify(WARP_JSON)), { now: () => FIXED_NOW });
  rec.verified = true;
  rec.verifiedAt = '2026-08-15T12:05:00.000Z';
  assert.deepEqual(publicAccount(rec), {
    registeredAt: '2026-08-15T12:00:00.000Z',
    v4: '172.16.0.2',
    source: 'import',
    verified: true,
    verifiedAt: '2026-08-15T12:05:00.000Z',
  });
  const json = JSON.stringify(publicAccount(rec));
  assert.ok(!json.includes('privateKey'));
  assert.ok(!json.includes('clientId'));
  assert.ok(!json.includes('token'));
  // Legacy records default to register/unverified.
  assert.equal(publicAccount({ ...rec, source: undefined, verified: undefined, verifiedAt: undefined }).source, 'register');
});

// ---- verification (stubbed fetch) ----

test('verifyAccountCredentials: 2xx → verified verdict with checked time', async (t) => {
  let captured;
  const restore = stubFetch(async (url, init) => {
    captured = { url: String(url), init };
    return new Response('{}', { status: 200 });
  });
  t.after(restore);
  const v = await verifyAccountCredentials({ clientId: 'c1', token: 't1', now: () => FIXED_NOW });
  assert.deepEqual(v, { verified: true, verifiedAt: '2026-08-15T12:00:00.000Z' });
  assert.ok(captured.url.endsWith('/v0i1909051800/reg/c1'));
  assert.equal(captured.init.method, 'GET');
  assert.equal(captured.init.headers.Authorization, 'Bearer t1');
  assert.equal(captured.init.headers['User-Agent'], 'okhttp/3.12.1');
  assert.ok(captured.init.signal instanceof AbortSignal);
  assert.equal(captured.init.signal.aborted, false);
});

test('verifyAccountCredentials: non-2xx (403) → failed verdict, never throws', async (t) => {
  const restore = stubFetch(async () => new Response('forbidden', { status: 403 }));
  t.after(restore);
  const v = await verifyAccountCredentials({ clientId: 'c1', token: 't1', now: () => FIXED_NOW });
  assert.deepEqual(v, { verified: false, verifiedAt: '2026-08-15T12:00:00.000Z' });
});

test('verifyAccountCredentials: network error → failed verdict, never throws', async (t) => {
  const restore = stubFetch(async () => { throw new TypeError('fetch failed'); });
  t.after(restore);
  const v = await verifyAccountCredentials({ clientId: 'c1', token: 't1', now: () => FIXED_NOW });
  assert.equal(v.verified, false);
  assert.equal(v.verifiedAt, '2026-08-15T12:00:00.000Z');
});

test('verifyAccountCredentials: no credentials → unverified, NO network call', async (t) => {
  let called = false;
  const restore = stubFetch(async () => { called = true; return new Response('{}'); });
  t.after(restore);
  assert.deepEqual(await verifyAccountCredentials({ clientId: null, token: null }), { verified: false, verifiedAt: null });
  assert.deepEqual(await verifyAccountCredentials({ clientId: 'c', token: null }), { verified: false, verifiedAt: null });
  assert.deepEqual(await verifyAccountCredentials({ clientId: null, token: 't' }), { verified: false, verifiedAt: null });
  assert.equal(called, false);
});

// ---- importAccountRecord flow (parse → verify; NO store — ticket 01) ----

test('importAccountRecord: conf import yields an unverified record, no network call', async (t) => {
  let cfCalls = 0;
  const restore = stubFetch(async () => { cfCalls++; return new Response('{}'); });
  t.after(restore);
  const { record, verdict } = await importAccountRecord(CONF_V4, { now: () => FIXED_NOW });
  assert.equal(cfCalls, 0);
  assert.deepEqual(verdict, { verified: false, verifiedAt: null });
  assert.equal(record.source, 'import');
  assert.equal(record.clientId, null);
  assert.equal(record.reserved, '');
});

test('importAccountRecord: json import verifies against CF', async (t) => {
  let captured;
  const restore = stubFetch(async (url, init) => { captured = { url: String(url), init }; return new Response('{}', { status: 200 }); });
  t.after(restore);
  const { record, verdict } = await importAccountRecord(JSON.stringify(WARP_JSON), { now: () => FIXED_NOW });
  assert.deepEqual(verdict, { verified: true, verifiedAt: '2026-08-15T12:00:00.000Z' });
  assert.equal(record.verified, true);
  assert.equal(record.verifiedAt, '2026-08-15T12:00:00.000Z');
  assert.ok(captured.url.endsWith('/reg/client-id-123'));
  assert.equal(record.clientId, 'client-id-123');
  assert.equal(record.token, 'token-abc');
  assert.equal(record.reserved, 'QGV1zKUsRS4=');
});

test('importAccountRecord: 403 verification still yields a record (failed verdict)', async (t) => {
  const restore = stubFetch(async () => new Response('nope', { status: 403 }));
  t.after(restore);
  const { record } = await importAccountRecord(JSON.stringify(WARP_JSON), { now: () => FIXED_NOW });
  assert.equal(record.verified, false);
  assert.equal(record.verifiedAt, '2026-08-15T12:00:00.000Z');
  assert.equal(record.clientId, 'client-id-123'); // record persists despite the verdict
});

test('importAccountRecord: verification network error still yields a record (never blocks)', async (t) => {
  const restore = stubFetch(async () => { throw new TypeError('fetch failed'); });
  t.after(restore);
  const { record } = await importAccountRecord(JSON.stringify(WARP_JSON), { now: () => FIXED_NOW });
  assert.equal(record.verified, false);
});

test('importAccountRecord: parse failure throws and never touches any store', async (t) => {
  const restore = stubFetch(async () => new Response('{}'));
  t.after(restore);
  await assert.rejects(() => importAccountRecord('hello world'), (err) => err instanceof AccountError);
  await assert.rejects(() => importAccountRecord('   '), AccountError);
  await assert.rejects(() => importAccountRecord('{not json'), AccountError);
});