/**
 * Ticket 02 tests — the pure parts of the account module: record extraction
 * from a canned WARP response, error mapping, KV helpers, and the network
 * call shapes (stubbed global fetch — no real Cloudflare traffic).
 * Runs under `node --test` with zero npm dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountError,
  describeAccountError,
  enableWarp,
  extractAccountRecord,
  isValidAccountRecord,
  publicAccount,
  registerClient,
  registrationWaitMs,
} from './account.js';

// ---- canned fixtures (throwaway, never real keys) ----

const FAKE_KEYPAIR = { privateKey: 'aGVsbG8=', publicKey: 'd29ybGQ=' };

const WARP_RESPONSE = {
  result: {
    id: 'client-id-123',
    token: 'token-abc',
    config: {
      client_id: 'QGV1zKUsRS4=',
      mtu: 1280,
      peers: [
        { public_key: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=' },
        { public_key: 'second-peer-should-not-be-used' },
      ],
      interface: {
        addresses: {
          v4: '172.16.0.2',
          v6: 'fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789',
        },
      },
    },
  },
};

const FIXED_NOW = Date.UTC(2026, 7, 15, 12, 0, 0); // 2026-08-15T12:00:00Z

function extractDefault() {
  return extractAccountRecord(WARP_RESPONSE, FAKE_KEYPAIR, {
    clientId: 'client-id-123', token: 'token-abc', now: () => FIXED_NOW,
  });
}

// ---- record extraction (pure) ----

test('extractAccountRecord snapshots every account material field', () => {
  const rec = extractDefault();
  assert.deepEqual(rec, {
    privateKey: 'aGVsbG8=',
    clientId: 'client-id-123',
    token: 'token-abc',
    peerPublicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
    v4: '172.16.0.2',
    v6: 'fd01:5ca1:ab1e:82d7:abcd:ef01:2345:6789',
    reserved: 'QGV1zKUsRS4=',
    source: 'register',
    verified: false, // ticket 10: register/rotate never soft-check
    verifiedAt: null,
    registeredAt: '2026-08-15T12:00:00.000Z',
  });
});

test('extractAccountRecord uses the first peer only', () => {
  const rec = extractDefault();
  assert.equal(rec.peerPublicKey, WARP_RESPONSE.result.config.peers[0].public_key);
});

test('extractAccountRecord tolerates missing v6 and reserved (empty strings)', () => {
  const warp = JSON.parse(JSON.stringify(WARP_RESPONSE));
  delete warp.result.config.client_id;
  delete warp.result.config.interface.addresses.v6;
  const rec = extractAccountRecord(warp, FAKE_KEYPAIR, { clientId: 'c', token: 't', now: () => FIXED_NOW });
  assert.equal(rec.reserved, '');
  assert.equal(rec.v6, '');
});

test('extractAccountRecord rejects a response without the peer public key', () => {
  const warp = JSON.parse(JSON.stringify(WARP_RESPONSE));
  delete warp.result.config.peers;
  assert.throws(() => extractAccountRecord(warp, FAKE_KEYPAIR, { clientId: 'c', token: 't' }),
    (err) => err instanceof AccountError && /peer public key/.test(err.message));
});

test('extractAccountRecord rejects a response without interface addresses', () => {
  const warp = JSON.parse(JSON.stringify(WARP_RESPONSE));
  delete warp.result.config.interface.addresses;
  assert.throws(() => extractAccountRecord(warp, FAKE_KEYPAIR, { clientId: 'c', token: 't' }),
    (err) => err instanceof AccountError && /interface address/.test(err.message));
});

test('extractAccountRecord rejects missing client id or token', () => {
  assert.throws(() => extractAccountRecord(WARP_RESPONSE, FAKE_KEYPAIR, { clientId: '', token: 't' }),
    (err) => err instanceof AccountError && /client id or token/.test(err.message));
  assert.throws(() => extractAccountRecord(WARP_RESPONSE, FAKE_KEYPAIR, { token: 't' }),
    (err) => err instanceof AccountError && /client id or token/.test(err.message));
});

test('extractAccountRecord rejects a non-object warp payload', () => {
  assert.throws(() => extractAccountRecord(null, FAKE_KEYPAIR, { clientId: 'c', token: 't' }), AccountError);
  assert.throws(() => extractAccountRecord({ result: {} }, FAKE_KEYPAIR, { clientId: 'c', token: 't' }), AccountError);
});

// ---- Cloudflare network calls (stubbed fetch) ----

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

test('registerClient POSTs to /reg with the okhttp UA and registration body', async (t) => {
  let captured;
  const restore = stubFetch(async (url, init) => {
    captured = { url: String(url), init };
    return Response.json({ result: { id: 'c1', token: 't1' } });
  });
  t.after(restore);

  const { id, token } = await registerClient('d29ybGQ=');
  assert.equal(id, 'c1');
  assert.equal(token, 't1');
  assert.ok(captured.url.endsWith('/v0a1922/reg'));
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers['User-Agent'], 'okhttp/3.12.1');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.headers['CF-Client-Version'], 'a-6.3-1922');
  assert.ok(captured.init.signal instanceof AbortSignal);
  assert.equal(captured.init.signal.aborted, false);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.key, 'd29ybGQ=');
  assert.equal(body.type, 'ios');
  assert.equal(body.install_id, '');
  assert.equal(body.fcm_token, '');
  assert.equal(body.locale, 'en_US');
  assert.ok(!Number.isNaN(Date.parse(body.tos)));
});

test('registerClient surfaces a readable rate-limit error with status 429', async (t) => {
  const restore = stubFetch(async () => new Response('rate limited', { status: 429 }));
  t.after(restore);
  await assert.rejects(() => registerClient('d29ybGQ='),
    (err) => err instanceof AccountError && err.status === 429 && /rate-limiting/.test(err.message));
});

test('registerClient wraps network failures into readable errors', async (t) => {
  const restore = stubFetch(async () => { throw new TypeError('fetch failed'); });
  t.after(restore);
  await assert.rejects(() => registerClient('d29ybGQ='),
    (err) => err instanceof AccountError && /Network error/.test(err.message) && err.cause instanceof TypeError);
});

test('registerClient rejects a response missing result.id/token', async (t) => {
  const restore = stubFetch(async () => Response.json({ result: {} }));
  t.after(restore);
  await assert.rejects(() => registerClient('d29ybGQ='),
    (err) => err instanceof AccountError && /client id or token/.test(err.message));
});

test('enableWarp PATCHes /reg/:id with the bearer token', async (t) => {
  let captured;
  const restore = stubFetch(async (url, init) => {
    captured = { url: String(url), init };
    return Response.json({ result: { id: 'client-id-123' } });
  });
  t.after(restore);
  const data = await enableWarp('client-id-123', 'token-abc');
  assert.equal(data.result.id, 'client-id-123');
  assert.ok(captured.url.endsWith('/v0a1922/reg/client-id-123'));
  assert.equal(captured.init.method, 'PATCH');
  assert.equal(captured.init.headers.Authorization, 'Bearer token-abc');
  assert.equal(captured.init.headers['User-Agent'], 'okhttp/3.12.1');
  assert.equal(captured.init.headers['CF-Client-Version'], 'a-6.3-1922');
  assert.deepEqual(JSON.parse(captured.init.body), { warp_enabled: true });
});

test('enableWarp surfaces HTTP failures with status and readable message', async (t) => {
  const restore = stubFetch(async () => new Response('boom', { status: 500 }));
  t.after(restore);
  await assert.rejects(() => enableWarp('c1', 't1'),
    (err) => err instanceof AccountError && err.status === 500 && /HTTP 500/.test(err.message));
});

// ---- error mapping (pure) ----

test('describeAccountError maps every failure kind to a readable message', () => {
  assert.equal(describeAccountError(new AccountError('Cloudflare is rate-limiting registrations from this network. Wait a few minutes, then try again.')),
    'Cloudflare is rate-limiting registrations from this network. Wait a few minutes, then try again.');
  const aborted = new Error('aborted'); aborted.name = 'AbortError';
  assert.match(describeAccountError(aborted), /Timed out after 10 s/);
  assert.match(describeAccountError(new TypeError('fetch failed')), /Network error while reaching/);
  // AccountError messages are already readable — passed through verbatim.
  assert.equal(describeAccountError(new AccountError('nope', { status: 403 })), 'nope');
  // Stray errors carrying an HTTP status get mapped (defense in depth).
  const forbidden = new Error('x'); forbidden.status = 403;
  assert.match(describeAccountError(forbidden), /Cloudflare rejected the registration \(HTTP 403\)/);
  const five = new Error('x'); five.status = 500;
  assert.match(describeAccountError(five), /HTTP 500/);
  assert.equal(describeAccountError(new Error('boom')), 'boom');
  assert.equal(describeAccountError(null), 'Unknown registration error.');
});

// ---- record shape validation (pure) ----

test('isValidAccountRecord accepts a full record and rejects partial/garbage', () => {
  const rec = extractDefault();
  assert.equal(isValidAccountRecord(rec), true);
  for (const field of ['privateKey', 'clientId', 'token', 'peerPublicKey', 'v4', 'registeredAt']) {
    const bad = { ...rec, [field]: '' };
    assert.equal(isValidAccountRecord(bad), false, `${field} should be required`);
  }
  const badDate = { ...rec, registeredAt: 'not-a-date' };
  assert.equal(isValidAccountRecord(badDate), false);
  assert.equal(isValidAccountRecord(null), false);
  assert.equal(isValidAccountRecord({}), false);
  assert.equal(isValidAccountRecord('string'), false);
});

test('publicAccount exposes only the card fields — never keys or tokens', () => {
  const rec = extractDefault();
  const out = publicAccount(rec);
  assert.deepEqual(out, {
    registeredAt: '2026-08-15T12:00:00.000Z',
    v4: '172.16.0.2',
    source: 'register',
    verified: false,
    verifiedAt: null,
  });
  const json = JSON.stringify(out);
  assert.ok(!json.includes('privateKey'));
  assert.ok(!json.includes('token'));
  assert.ok(!json.includes('clientId'));
});

// ---- registration spacing (pure) ----

test('registrationWaitMs: no cooldown when never registered', () => {
  assert.equal(registrationWaitMs(0, FIXED_NOW), 0);
  assert.equal(registrationWaitMs(null, FIXED_NOW), 0);
});

test('registrationWaitMs: full cooldown within 8 s, 0 after', () => {
  assert.equal(registrationWaitMs(FIXED_NOW, FIXED_NOW), 8000);
  assert.equal(registrationWaitMs(FIXED_NOW, FIXED_NOW + 1000), 7000);
  assert.equal(registrationWaitMs(FIXED_NOW, FIXED_NOW + 7999), 1);
  assert.equal(registrationWaitMs(FIXED_NOW, FIXED_NOW + 8000), 0);
  assert.equal(registrationWaitMs(FIXED_NOW, FIXED_NOW + 30000), 0);
});