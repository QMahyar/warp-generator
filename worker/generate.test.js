/**
 * Ticket 09 — the generator page reusing the stored account (worker/generate.js).
 *
 * Pure-part tests: config-building from a STORED account record across all 7
 * formats (smoke-assert each format's output contains the record key /
 * addresses), the QR data-URL path (fake encoder — `qrcode` is not installed
 * in this repo, same lazy-import pattern as tweetnacl in account.js), the
 * community-DNS "all sites" forcing, parity quirks (clash allowed-ips, husi
 * keepalive 600, wiresock Id masking, throne reserved dashed, I1 for awg15,
 * MTU stripping in the wireguard QR), the missing-account error, and the
 * session-gated route behaviour including the no-network guarantee (stubbed
 * fetch — nothing may reach api.cloudflareclient.com) and the retired
 * /api/generate → 404.
 *
 * Fixtures are throwaway records (never real keys). Run from the repo root
 * with `node --test worker/*.test.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';

import {
  FORMATS,
  GeneratorError,
  SERVICES,
  __setQrCodeImpl,
  generateQR,
  handleGeneratePost,
  renderGeneratedConfig,
} from './generate.js';
import { issueSession } from './auth.js';
import workerModule from './index.js';

/** The registered WARP peer public key — same constant the builders hardcode. */
const WARP_PUB = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=';

// ---- fixtures (throwaway, never used anywhere) ----

/** Full WARP-shaped record — v4 + v6 + 4-byte reserved. */
const ACCOUNT = {
  privateKey: '4Xt2vFqq91XsVPAkP1TaW4hcGeGEbODynYWlX47RJkQ=',
  clientId: 'throwaway-client-09',
  token: 'throwaway-token-09',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.2',
  v6: '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8',
  reserved: 'U4An', // base64 → bytes [83, 128, 39]
  source: 'register',
  verified: false,
  verifiedAt: null,
  registeredAt: '2026-08-19T00:00:00.000Z',
};

/** Minimal record — no v6, no reserved (conf-import shaped, ticket 10). */
const ACCOUNT_MIN = {
  ...ACCOUNT,
  v6: '',
  reserved: '',
};

const ENDPOINT = '162.159.192.1:2408';

// ---- fake QR encoder (qrcode is not installed in dev; see generate.js) ----

/** Data URL whose payload is the QR text itself — tests can decode it. */
function fakeQR(text) {
  return 'data:image/png;base64,' + Buffer.from(text, 'utf8').toString('base64');
}

__setQrCodeImpl({ toDataURL: async (t) => fakeQR(t) });

function decodeConfig(content) {
  return Buffer.from(content.configBase64, 'base64').toString('utf8');
}

/** Throne strips the trailing '=' from the key in its wg:// link — accept both. */
function keyInOutput(text, key = ACCOUNT.privateKey) {
  return text.includes(key) || text.includes(key.replace(/=$/, ''));
}

function decodeQR(content) {
  const b64 = content.qrCodeBase64.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

// ---- the seam: every format renders from the stored record ----

test('all 7 formats render from the stored record (key + addresses in the output)', async () => {
  for (const f of FORMATS) {
    const content = await renderGeneratedConfig(ACCOUNT, { configFormat: f.id, endpoint: ENDPOINT });
    const text = decodeConfig(content);
    assert.ok(keyInOutput(text), `${f.id}: private key present`);
    assert.ok(text.includes(ACCOUNT.v4), `${f.id}: v4 address present`);
    assert.deepEqual(Object.keys(content).sort(), ['configBase64', 'configFormat', 'fileName', 'qrCodeBase64'], `${f.id}: legacy content shape`);
    assert.equal(content.configFormat, f.id);
  }
});

test('wireguard: full conf from the record + full tunnel', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT }));
  assert.ok(text.includes(`PrivateKey = ${ACCOUNT.privateKey}`));
  assert.ok(text.includes(`Address = ${ACCOUNT.v4}, ${ACCOUNT.v6}`));
  assert.ok(text.includes(`DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001`)); // buildDnsLine order: v4 then v6
  assert.ok(text.includes('MTU = 1280'));
  assert.ok(text.includes(`PublicKey = ${ACCOUNT.peerPublicKey}`));
  assert.ok(text.includes(`AllowedIPs = 0.0.0.0/0, ::/0`));
  assert.ok(text.includes(`Endpoint = ${ENDPOINT}`));
  assert.ok(text.includes('S1 = 0\nS2 = 0\nJc = 4\nJmin = 40\nJmax = 70\nH1 = 1\nH2 = 2\nH3 = 3\nH4 = 4'));
});

test('throne: wg:// line — reserved dashed, WARP public key, junk params (legacy parity)', async () => {
  const link = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'throne', endpoint: ENDPOINT }));
  assert.ok(link.startsWith(`wg://${ENDPOINT}?private_key=${ACCOUNT.privateKey.replace(/=$/, '')}%3D`));
  assert.ok(link.includes(`&peer_public_key=${encodeURIComponent(WARP_PUB)}`));
  assert.ok(link.includes('&reserved=83-128-39')); // dashed form
  assert.ok(link.includes('&persistent_keepalive=0&mtu=1280'));
  assert.ok(link.includes(`&local_address=${ACCOUNT.v4}/32-${ACCOUNT.v6}/128`));
  assert.ok(link.includes('&enable_amnezia=true&junk_packet_count=4'));
  assert.ok(link.endsWith('#WARP'));
});

test('clash: allowed-ips hardcoded to 0.0.0.0/0 + reserved CSV (legacy parity)', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'clash', endpoint: ENDPOINT, siteMode: 'specific', selectedServices: ['telegram'] }));
  assert.ok(text.includes(`  private-key: ${ACCOUNT.privateKey}`));
  assert.ok(text.includes('  server: 162.159.192.1\n  port: 2408'));
  assert.ok(text.includes(`  ip: ${ACCOUNT.v4}`));
  assert.ok(text.includes("  allowed-ips: ['0.0.0.0/0']")); // ignores site mode — parity quirk
  assert.ok(text.includes('  reserved: [83, 128, 39]')); // CSV form
  assert.ok(text.includes('  mtu: 1280'));
  assert.ok(text.includes('  dns: [1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001]')); // buildDnsLine order
});

test('nekoray: sing-box wireguard outbound JSON from the record', async () => {
  const out = JSON.parse(decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'nekoray', endpoint: ENDPOINT })));
  assert.equal(out.type, 'wireguard');
  assert.equal(out.mtu, 1280);
  assert.equal(out.private_key, ACCOUNT.privateKey);
  assert.equal(out.peer_public_key, ACCOUNT.peerPublicKey);
  assert.deepEqual(out.reserved, [83, 128, 39]);
  assert.deepEqual(out.local_address, [`${ACCOUNT.v4}/32`, `${ACCOUNT.v6}/128`]);
  assert.equal(out.server, '162.159.192.1');
  assert.equal(out.server_port, 2408);
});

test('husi: keepalive hardcoded to 600 + reserved CSV (legacy parity)', async () => {
  const out = JSON.parse(decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'husi', endpoint: ENDPOINT, persistentKeepalive: 25 })));
  assert.equal(out.type, 'wireguard');
  assert.equal(out.mtu, 1280);
  assert.equal(out.private_key, ACCOUNT.privateKey);
  assert.deepEqual(out.address, [`${ACCOUNT.v4}/32`, `${ACCOUNT.v6}/128`]);
  assert.equal(out.peers[0].address, '162.159.192.1');
  assert.equal(out.peers[0].port, 2408);
  assert.equal(out.peers[0].public_key, ACCOUNT.peerPublicKey);
  assert.equal(out.peers[0].persistent_keepalive_interval, 600); // parity quirk — never the request value
  assert.equal(out.peers[0].reserved, '83, 128, 39'); // CSV string form — parity quirk
});

test('karing: fake-packet outbound JSON from the record', async () => {
  const out = JSON.parse(decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'karing', endpoint: ENDPOINT })));
  assert.equal(out.outbounds[0].type, 'wireguard');
  assert.equal(out.outbounds[0].mtu, 1280);
  assert.equal(out.outbounds[0].private_key, ACCOUNT.privateKey);
  assert.equal(out.outbounds[0].peer_public_key, ACCOUNT.peerPublicKey);
  assert.deepEqual(out.outbounds[0].reserved, [83, 128, 39]);
  assert.equal(out.outbounds[0].fake_packets, '5-10');
  assert.equal(out.outbounds[0].server_port, 2408);
});

test('wiresock: Id masking domain + Ip = quic (legacy parity)', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wiresock', endpoint: ENDPOINT }));
  assert.ok(text.includes(`PrivateKey = ${ACCOUNT.privateKey}`));
  assert.ok(text.includes(`Address = ${ACCOUNT.v4}, ${ACCOUNT.v6}`));
  assert.ok(text.includes('# Protocol masking\nId = ')); // a masking domain is always chosen
  assert.ok(text.includes('Ip = quic\nIb = firefox'));
  assert.ok(text.includes(`Endpoint = ${ENDPOINT}`));
});

test('wiresock: customI1Domain doubles as the masking domain (legacy behaviour)', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wiresock', endpoint: ENDPOINT, customI1Domain: 'ozon.ru' }));
  assert.ok(text.includes('Id = ozon.ru'));
});

// ---- QR ----

test('QR formats return a data URL; others return empty', async () => {
  for (const f of FORMATS.filter((x) => x.supportsQR)) {
    const content = await renderGeneratedConfig(ACCOUNT, { configFormat: f.id, endpoint: ENDPOINT });
    assert.ok(content.qrCodeBase64.startsWith('data:image/png;base64,'), `${f.id}: QR is a data URL`);
  }
  for (const f of FORMATS.filter((x) => !x.supportsQR)) {
    const content = await renderGeneratedConfig(ACCOUNT, { configFormat: f.id, endpoint: ENDPOINT });
    assert.equal(content.qrCodeBase64, '', `${f.id}: no QR`);
  }
  assert.deepEqual(FORMATS.filter((f) => f.supportsQR).map((f) => f.id), ['wireguard', 'throne', 'wiresock']);
});

test('wireguard QR strips the MTU line; throne QR carries the full wg:// link', async () => {
  const wg = await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT });
  const wgText = decodeQR(wg);
  assert.ok(!/^MTU = \d+$/m.test(wgText), 'MTU line removed from the QR payload');
  assert.ok(wgText.includes(`PrivateKey = ${ACCOUNT.privateKey}`));

  const throne = await renderGeneratedConfig(ACCOUNT, { configFormat: 'throne', endpoint: ENDPOINT });
  assert.ok(decodeQR(throne).startsWith('wg://'));
});

test('generateQR falls back to empty when the encoder is unavailable', async () => {
  __setQrCodeImpl(null); // qrcode is not installed in this repo → graceful ''
  assert.equal(await generateQR('anything'), '');
  __setQrCodeImpl({ toDataURL: async (t) => fakeQR(t) }); // restore
  assert.ok((await generateQR('anything')).startsWith('data:image/png;base64,'));
});

// ---- community-DNS rule (server side) ----

test('community DNS forces siteMode all and drops services', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, {
    configFormat: 'wireguard', endpoint: ENDPOINT,
    dnsId: 'malw', siteMode: 'specific', selectedServices: ['telegram'],
  }));
  assert.ok(text.includes('AllowedIPs = 0.0.0.0/0, ::/0')); // services dropped — full tunnel
  assert.ok(!text.includes('104.16.0.0/12')); // telegram range dropped
  assert.ok(text.includes('DNS = 84.21.189.133, 193.23.209.189, 2a12:bec4:1460:294::2, 2a01:ecc0:680:120::2'));
});

test('non-community DNS keeps specific-site routing', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, {
    configFormat: 'wireguard', endpoint: ENDPOINT,
    dnsId: 'cf', siteMode: 'specific', selectedServices: ['telegram'],
  }));
  assert.ok(!text.includes('AllowedIPs = 0.0.0.0/0'));
  assert.ok(text.includes('104.16.0.0/12')); // telegram range
});

test('exclude-LAN applies to all-site configs (LAN_EXCLUDE_IPS)', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, {
    configFormat: 'wireguard', endpoint: ENDPOINT,
    dnsId: 'cf', siteMode: 'all', excludeLan: true,
  }));
  assert.ok(text.includes('AllowedIPs = 1.0.0.0/8, 2.0.0.0/7'));
  assert.ok(!text.includes('0.0.0.0/0, ::/0'));
});

// ---- options: IPv6, keepalive, I1, endpoint default, file names ----

test('ipv6=false: bare v4 address, v4-only DNS line', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT, ipv6: false }));
  assert.ok(text.includes(`Address = ${ACCOUNT.v4}`));
  assert.ok(!text.includes(ACCOUNT.v6));
  assert.ok(text.includes('DNS = 1.1.1.1, 1.0.0.1'));
});

test('persistent keepalive: normalized like the legacy handler', async () => {
  const withKeepalive = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT, persistentKeepalive: 25 }));
  assert.ok(withKeepalive.includes('PersistentKeepalive = 25'));
  const floored = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT, persistentKeepalive: 25.9 }));
  assert.ok(floored.includes('PersistentKeepalive = 25'));
  for (const bad of [0, -1, 65536, 99999]) {
    const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT, persistentKeepalive: bad }));
    assert.ok(!text.includes('PersistentKeepalive'), `keepalive ${bad} is dropped`);
  }
});

test('I1 mask: emitted for the awg15 device only (wireguard format)', async () => {
  const awg15 = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT, deviceType: 'awg15' }));
  assert.ok(awg15.includes('I1 = <b 0x'));
  const phone = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT, deviceType: 'phone' }));
  assert.ok(!phone.includes('I1 ='));
});

test('custom I1 domain generates a QUIC mask line', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard', endpoint: ENDPOINT, customI1Domain: 'example.com' }));
  assert.ok(text.includes('I1 = <b 0x'));
});

test('endpoint defaults to engage.cloudflareclient.com:4500 when omitted', async () => {
  const text = decodeConfig(await renderGeneratedConfig(ACCOUNT, { configFormat: 'wireguard' }));
  assert.ok(text.includes('Endpoint = engage.cloudflareclient.com:4500'));
});

test('file names follow the legacy scheme (WARP/upper + 7-digit id + ext)', async () => {
  const cases = { wireguard: /^WARP\d{7}\.conf$/, throne: /^THRONE\d{7}\.txt$/, clash: /^CLASH\d{7}\.yaml$/, nekoray: /^NEKORAY\d{7}\.json$/, husi: /^HUSI\d{7}\.json$/, karing: /^KARING\d{7}\.json$/, wiresock: /^WIRESOCK\d{7}\.conf$/ };
  for (const [format, re] of Object.entries(cases)) {
    const content = await renderGeneratedConfig(ACCOUNT, { configFormat: format, endpoint: ENDPOINT });
    assert.match(content.fileName, re, format);
  }
});

test('minimal record (no v6, no reserved) renders every format', async () => {
  for (const f of FORMATS) {
    const content = await renderGeneratedConfig(ACCOUNT_MIN, { configFormat: f.id, endpoint: ENDPOINT });
    const text = decodeConfig(content);
    assert.ok(keyInOutput(text, ACCOUNT_MIN.privateKey), `${f.id}: key present`);
    assert.ok(!text.includes(ACCOUNT.v6), `${f.id}: no v6 leak`);
  }
});

// ---- errors ----

test('missing account → GeneratorError with the readable 503 message', async () => {
  for (const bad of [null, undefined, {}, { privateKey: '' }]) {
    await assert.rejects(
      () => renderGeneratedConfig(bad, { configFormat: 'wireguard' }),
      (err) => err instanceof GeneratorError && err.status === 503 && /register or import/i.test(err.message),
    );
  }
});

test('unknown format → GeneratorError 400 with the legacy message', async () => {
  await assert.rejects(
    () => renderGeneratedConfig(ACCOUNT, { configFormat: 'bogus' }),
    (err) => err instanceof GeneratorError && err.status === 400 && err.message === 'Unknown format: bogus',
  );
});

// ---- route handler (fake KV, stubbed fetch) ----

function makeKv(value) {
  return { get: async () => (value === undefined ? null : (typeof value === 'string' ? value : JSON.stringify(value))) };
}

function jsonBody(obj) {
  return new Request('http://panel.local/api/generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
}

function installNoNetworkStub() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return new Response('network must not be reached', { status: 500 });
  };
  return function restore() {
    globalThis.fetch = original;
    return calls;
  };
}

test('handler: generation makes zero network calls (stored account only)', async () => {
  const restore = installNoNetworkStub();
  try {
    const res = await handleGeneratePost(jsonBody({ configFormat: 'wireguard', endpoint: ENDPOINT }), { ACCOUNT: makeKv(ACCOUNT) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.content.configFormat, 'wireguard');
    assert.ok(decodeConfig(data.content).includes(`PrivateKey = ${ACCOUNT.privateKey}`));
  } finally {
    const calls = restore();
    assert.deepEqual(calls, [], 'no fetch calls at all during generation');
  }
});

test('handler: all 7 formats round-trip through the route', async () => {
  const restore = installNoNetworkStub();
  try {
    for (const f of FORMATS) {
      const res = await handleGeneratePost(jsonBody({ configFormat: f.id, endpoint: ENDPOINT }), { ACCOUNT: makeKv(ACCOUNT) });
      assert.equal(res.status, 200, f.id);
      const data = await res.json();
      assert.equal(data.success, true, f.id);
      assert.ok(keyInOutput(decodeConfig(data.content)), `${f.id}: key in decoded output`);
      assert.equal(data.content.fileName.endsWith('.' + f.extension), true, `${f.id}: file extension`);
    }
  } finally {
    const calls = restore();
    assert.deepEqual(calls, [], 'no network calls during any generation');
  }
});

test('handler: missing or corrupt account → 503 with a readable message', async () => {
  for (const env of [
    { ACCOUNT: undefined },
    { ACCOUNT: makeKv(undefined) },
    { ACCOUNT: makeKv('not json') },
    { ACCOUNT: makeKv({ privateKey: '' }) },
  ]) {
    const res = await handleGeneratePost(jsonBody({ configFormat: 'wireguard' }), env);
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /register or import/i);
  }
});

test('handler: unknown format → 400, bad body → 500, wrong method → 405', async () => {
  const env = { ACCOUNT: makeKv(ACCOUNT) };
  const badFormat = await handleGeneratePost(jsonBody({ configFormat: 'nope' }), env);
  assert.equal(badFormat.status, 400);
  assert.equal((await badFormat.json()).message, 'Unknown format: nope');

  const badBody = await handleGeneratePost(new Request('http://panel.local/api/generator', { method: 'POST', body: '{' }), env);
  assert.equal(badBody.status, 500);

  const get = await handleGeneratePost(new Request('http://panel.local/api/generator', { method: 'GET' }), env);
  assert.equal(get.status, 405);
});

// ---- worker-level smoke (the real router, session-gated) ----

const SECRET = 'ticket-09-test-secret';
const SESSION = (async () => `warp_session=${await issueSession(SECRET)}`)();

function workerEnv(accountValue) {
  return {
    PASSWORD: SECRET,
    SUB_PATH: 'tok',
    ACCOUNT: makeKv(accountValue),
    ENDPOINTS: makeKv({ text: '162.159.192.1:2408\nengage.cloudflareclient.com:2408' }),
    AWG: makeKv(null),
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  };
}

test('worker: /api/generator is session-gated (anon → 401)', async () => {
  const res = await workerModule.fetch(new Request('http://panel.local/api/generator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), workerEnv(ACCOUNT), {});
  assert.equal(res.status, 401);
});

test('worker: legacy public /api/generate is gone (anon → 401 gate, authed → 404 fallthrough)', async () => {
  const env = workerEnv(ACCOUNT);
  for (const method of ['GET', 'POST', 'OPTIONS']) {
    const anon = await workerModule.fetch(new Request(`http://panel.local/api/generate`, { method }), env, {});
    assert.equal(anon.status, 401, `${method} anon hits the gate`);
  }
  const authed = await workerModule.fetch(new Request('http://panel.local/api/generate', { method: 'GET', headers: { Cookie: await SESSION } }), env, {});
  assert.equal(authed.status, 404); // removed from the router — falls through to ASSETS
});

test('worker: gated generation works end-to-end per format, offline, with a stored account', async () => {
  const restore = installNoNetworkStub();
  try {
    for (const f of FORMATS) {
      const res = await workerModule.fetch(new Request('http://panel.local/api/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: await SESSION },
        body: JSON.stringify({ configFormat: f.id, endpoint: ENDPOINT }),
      }), workerEnv(ACCOUNT), {});
      assert.equal(res.status, 200, f.id);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.content.configFormat, f.id);
      const text = Buffer.from(data.content.configBase64, 'base64').toString('utf8');
      assert.ok(keyInOutput(text), `${f.id}: decoded output carries the stored key`);
      assert.ok(text.includes(ACCOUNT.v4), `${f.id}: decoded output carries the stored address`);
    }
  } finally {
    const calls = restore();
    assert.ok(calls.every((url) => !url.includes('api.cloudflareclient.com')), `no /reg calls: ${calls}`);
    assert.deepEqual(calls, [], 'no fetch calls at all during worker generation');
  }
});

test('worker: missing account → 503 with the readable register-or-import message', async () => {
  const res = await workerModule.fetch(new Request('http://panel.local/api/generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await SESSION },
    body: JSON.stringify({ configFormat: 'wireguard' }),
  }), workerEnv(undefined), {});
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.message, /register or import/i);
});

test('worker: OPTIONS on the gated route → 405 (no public CORS preflight anymore)', async () => {
  const res = await workerModule.fetch(new Request('http://panel.local/api/generator', {
    method: 'OPTIONS',
    headers: { Cookie: await SESSION },
  }), workerEnv(ACCOUNT), {});
  assert.equal(res.status, 405);
});

// ---- the page's embedded lists stay in sync with the engine ----

test('SERVICES list has 27 entries, ids match the IP_RANGES keys, sorted by name', async () => {
  assert.equal(SERVICES.length, 27);
  assert.equal(SERVICES[0].id, 'animego');
  assert.equal(SERVICES[24].name, 'YouTube');
  assert.equal(SERVICES[26].name, 'Zetflix');
  const ids = SERVICES.map((s) => s.id);
  assert.ok(ids.includes('telegram') && ids.includes('youtube') && ids.includes('xvideos'));
  const names = SERVICES.map((s) => s.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'sorted by name like config/services-loader.ts');
});

test('FORMATS list mirrors the 7 legacy ids with names/extensions/QR support', async () => {
  assert.deepEqual(FORMATS.map((f) => f.id), ['wireguard', 'throne', 'clash', 'nekoray', 'husi', 'karing', 'wiresock']);
  assert.deepEqual(FORMATS.map((f) => f.extension), ['conf', 'txt', 'yaml', 'json', 'json', 'json', 'conf']);
});