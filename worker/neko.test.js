/**
 * Ticket 07 — /sub/neko — NekoBox desktop `nekoray://custom#` links
 * (worker/sub.js).
 *
 * Seam tests (external behaviour): given an account record, a parsed
 * endpoint list and opts, the payload decodes to the structure NekoBox
 * desktop expects — base64 blob → newline-joined `nekoray://custom#`
 * links → URL-safe-base64 fragment → CustomBean JSON with the sing-box
 * wireguard outbound JSON as `cs` (fields per
 * docs/research/sub-formats.md §2.2, verified against nekoray
 * fmt/CustomBean.hpp, fmt/AbstractBean.cpp, sub/GroupUpdater.cpp and
 * 3rdparty/base64.cpp at implementation time).
 *
 * Fixtures are throwaway records (generated once with crypto.randomBytes,
 * hardcoded here — never real keys).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';

import {
  DEFAULT_ENDPOINTS,
  SubscriptionError,
  WARP_PUB,
  buildLegacyWireguardOutbound,
  buildNekoLink,
  renderSubscription,
  resolveEndpoints,
} from './sub.js';

// ---- fixtures (throwaway, generated 2026-08-18, never used anywhere) ----

/** Full WARP-shaped record — v4 + v6 + 4-byte reserved (same values as tickets 04–06). */
const ACCOUNT_A = {
  privateKey: '4Xt2vFqq91XsVPAkP1TaW4hcGeGEbODynYWlX47RJkQ=',
  clientId: 'throwaway-client-07',
  token: 'throwaway-token-07',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.2',
  v6: '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8',
  reserved: 'U4An', // base64 → bytes [83, 128, 39]
  registeredAt: '2026-08-18T00:00:00.000Z',
};

/** Minimal record — no v6, empty reserved (the extractor tolerates both). */
const ACCOUNT_B = {
  privateKey: '0tMTHiHvXQRAh+NIX7ozB9cWVgCZkTEiVKrniJTTLx8=',
  clientId: 'throwaway-client-07b',
  token: 'throwaway-token-07b',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.3',
  v6: '',
  reserved: '',
  registeredAt: '2026-08-18T00:00:00.000Z',
};

/** The canonical parsed-endpoint shape settings.js produces. */
const ENDPOINTS = [
  { host: '162.159.192.1', port: 2408, raw: '162.159.192.1:2408' },
  { host: 'engage.cloudflareclient.com', port: 51820, raw: 'engage.cloudflareclient.com:51820' },
  { host: '2606:4700:4700::1111', port: 2408, raw: '[2606:4700:4700::1111]:2408' },
];

/** Golden nekoray://custom# link for ACCOUNT_A × 162.159.192.1:2408 (per §2.2). */
const GOLDEN_NEKO_LINK =
  'nekoray://custom#eyJfdiI6MCwiYWRkciI6IjEyNy4wLjAuMSIsImNtZCI6WyIiXSwiY29yZSI6ImludGVybmFsIiwiY3MiOiJ7XCJ0eXBlXCI6XCJ3aXJlZ3VhcmRcIixcInRhZ1wiOlwid2FycC0xNjIuMTU5LjE5Mi4xOjI0MDhcIixcInNlcnZlclwiOlwiMTYyLjE1OS4xOTIuMVwiLFwic2VydmVyX3BvcnRcIjoyNDA4LFwibG9jYWxfYWRkcmVzc1wiOltcIjE3Mi4xNi4wLjIvMzJcIixcIjI2MDY6NDcwMDoxMTA6ODJjZTphMWIyOmMzZDQ6ZTVmNjphN2I4LzEyOFwiXSxcInByaXZhdGVfa2V5XCI6XCI0WHQydkZxcTkxWHNWUEFrUDFUYVc0aGNHZUdFYk9EeW5ZV2xYNDdSSmtRPVwiLFwicGVlcl9wdWJsaWNfa2V5XCI6XCJibVhPQytGMUZ4RU1GOWR5aUsySDUvMVNVdHpIMEp1Vm81MWgyd1BmZ3lvPVwiLFwicmVzZXJ2ZWRcIjpbODMsMTI4LDM5XSxcIm10dVwiOjEyODAsXCJzeXN0ZW1faW50ZXJmYWNlXCI6ZmFsc2UsXCJpbnRlcmZhY2VfbmFtZVwiOlwid2FycC13Z1wiLFwicHJlX3NoYXJlZF9rZXlcIjpcIlwifSIsIm1hcHBpbmdfcG9ydCI6MCwibmFtZSI6IndhcnAtMTYyLjE1OS4xOTIuMToyNDA4IiwicG9ydCI6MTA4MCwic29ja3NfcG9ydCI6MH0=';

/** Golden CustomBean JSON (parsed value) the golden link encodes. */
const GOLDEN_BEAN = {
  _v: 0,
  addr: '127.0.0.1',
  cmd: [''],
  core: 'internal',
  cs: {
    type: 'wireguard',
    tag: 'warp-162.159.192.1:2408',
    server: '162.159.192.1',
    server_port: 2408,
    system_interface: false,
    interface_name: 'warp-wg',
    local_address: ['172.16.0.2/32', '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128'],
    private_key: ACCOUNT_A.privateKey,
    peer_public_key: ACCOUNT_A.peerPublicKey,
    pre_shared_key: '',
    reserved: [83, 128, 39],
    mtu: 1280,
  },
  mapping_port: 0,
  name: 'warp-162.159.192.1:2408',
  port: 1080,
  socks_port: 0,
};

function decodePayload(rendered) {
  assert.equal(rendered.contentType, 'text/plain; charset=utf-8');
  return Buffer.from(rendered.body, 'base64').toString('utf8').split('\n');
}

/** URL-safe base64 fragment → the decoded CustomBean JSON value. */
function parseNekoLink(link) {
  assert.ok(link.startsWith('nekoray://custom#'), `expected nekoray://custom# link, got: ${link.slice(0, 60)}`);
  const frag = link.slice('nekoray://custom#'.length);
  assert.match(frag, /^[A-Za-z0-9_-]+=*$/, 'fragment must be URL-safe base64 (no + or /)');
  const json = Buffer.from(frag.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const bean = JSON.parse(json);
  bean.cs = JSON.parse(bean.cs); // the cs is a JSON string — parse it for assertions
  return bean;
}

// ---- payload / envelope ----

test('renderSubscription neko: base64 body decodes to one nekoray://custom# link per endpoint', () => {
  const { body, contentType } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  assert.equal(contentType, 'text/plain; charset=utf-8');
  const lines = decodePayload({ body, contentType });
  assert.equal(lines.length, 3);
  for (const line of lines) assert.ok(line.startsWith('nekoray://custom#'));
});

test('link is byte-identical to the golden §2.2 shape (hand-built literal)', () => {
  const { body } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: [ENDPOINTS[0]] });
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), GOLDEN_NEKO_LINK);
  const link = buildNekoLink(ACCOUNT_A, ENDPOINTS[0]);
  assert.equal(link, GOLDEN_NEKO_LINK);
});

test('every fragment is URL-safe base64 (no + or /, padding allowed) and parses to JSON', () => {
  const { body } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  for (const line of decodePayload({ body, contentType: 'text/plain; charset=utf-8' })) {
    const frag = line.slice('nekoray://custom#'.length);
    assert.match(frag, /^[A-Za-z0-9_-]+=*$/);
    assert.doesNotThrow(() => parseNekoLink(line));
  }
});

// ---- CustomBean shape (per §2.2 + nekoray CustomBean.hpp/AbstractBean.cpp) ----

test('CustomBean matches the §2.2 golden bean field-for-field', () => {
  const bean = parseNekoLink(buildNekoLink(ACCOUNT_A, ENDPOINTS[0]));
  assert.deepEqual(bean, GOLDEN_BEAN);
});

test('cs is exactly the ticket-06 legacy outbound plus system_interface/interface_name/pre_shared_key', () => {
  const bean = parseNekoLink(buildNekoLink(ACCOUNT_A, ENDPOINTS[0]));
  const legacy = buildLegacyWireguardOutbound(ACCOUNT_A, ENDPOINTS[0]);
  assert.deepEqual(bean.cs, {
    ...legacy,
    system_interface: false,
    interface_name: 'warp-wg',
    pre_shared_key: '',
  });
});

test('cs wireguard outbound carries every §2.2 field with account/endpoint values', () => {
  const bean = parseNekoLink(buildNekoLink(ACCOUNT_A, ENDPOINTS[0]));
  assert.equal(bean.cs.type, 'wireguard');
  assert.equal(bean.cs.server, '162.159.192.1');
  assert.equal(bean.cs.server_port, 2408);
  assert.equal(bean.cs.local_address[0], '172.16.0.2/32');
  assert.equal(bean.cs.local_address[1], '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128');
  assert.equal(bean.cs.private_key, ACCOUNT_A.privateKey);
  assert.equal(bean.cs.peer_public_key, ACCOUNT_A.peerPublicKey);
  assert.deepEqual(bean.cs.reserved, [83, 128, 39]); // 'U4An' → bytes
  assert.equal(bean.cs.mtu, 1280);
});

test('name is warp-<host>:<port> per endpoint — incl. custom port and bracketed IPv6', () => {
  const { body } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  const beans = decodePayload({ body, contentType: 'text/plain; charset=utf-8' }).map(parseNekoLink);
  assert.equal(beans[0].name, 'warp-162.159.192.1:2408');
  assert.equal(beans[1].name, 'warp-engage.cloudflareclient.com:51820');
  assert.equal(beans[2].name, 'warp-[2606:4700:4700::1111]:2408');
  assert.equal(beans[0].cs.server, '162.159.192.1');
  assert.equal(beans[1].cs.server_port, 51820);
  assert.equal(beans[2].cs.server, '2606:4700:4700::1111'); // bare IPv6 in the outbound address
  assert.equal(beans[2].cs.server_port, 2408);
});

test('one link per valid endpoint, in the stored order', () => {
  const { body } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  const beans = decodePayload({ body, contentType: 'text/plain; charset=utf-8' }).map(parseNekoLink);
  assert.equal(beans.length, 3);
  assert.equal(beans[0].cs.server, '162.159.192.1');
  assert.equal(beans[1].cs.server, 'engage.cloudflareclient.com');
  assert.equal(beans[2].cs.server, '2606:4700:4700::1111');
});

test('v6-less record: local_address is v4/32 only and reserved is [0,0,0] — no v6 leak', () => {
  const bean = parseNekoLink(buildNekoLink(ACCOUNT_B, ENDPOINTS[0]));
  assert.deepEqual(bean.cs.local_address, ['172.16.0.3/32']);
  assert.deepEqual(bean.cs.reserved, [0, 0, 0]);
  assert.ok(!JSON.stringify(bean).includes('2606:'));
});

test('reserved bytes come from the record reserved field (base64 → bytes)', () => {
  assert.deepEqual(parseNekoLink(buildNekoLink({ ...ACCOUNT_A, reserved: 'AAAA' }, ENDPOINTS[0])).cs.reserved, [0, 0, 0]);
  assert.deepEqual(parseNekoLink(buildNekoLink(ACCOUNT_B, ENDPOINTS[0])).cs.reserved, [0, 0, 0]); // '' → [0,0,0]
});

// ---- endpoint semantics ----

test('malformed endpoint entries are skipped — the renderer never errors on them', () => {
  const junk = [
    null,
    { host: '', port: 2408 },
    { host: 'no-port-here' },
    { host: 'x', port: 0 },
    { host: 'x', port: 70000 },
    { host: 'y', port: '2408' }, // string port
    '162.159.192.1:2408', // raw string — not the parsed shape
  ];
  const { body } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: [...junk, ENDPOINTS[0], ...junk] });
  const beans = decodePayload({ body, contentType: 'text/plain; charset=utf-8' }).map(parseNekoLink);
  assert.equal(beans.length, 1);
  assert.equal(beans[0].name, 'warp-162.159.192.1:2408');
});

test('empty endpoint list falls back to the two known-good defaults', () => {
  const { body } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: [] });
  const lines = decodePayload({ body, contentType: 'text/plain; charset=utf-8' });
  assert.equal(lines.length, DEFAULT_ENDPOINTS.length);
  assert.equal(lines.length, 2);
  const beans = lines.map(parseNekoLink);
  assert.equal(beans[0].cs.server, '162.159.192.1');
  assert.equal(beans[0].cs.server_port, 2408);
  assert.equal(beans[1].cs.server, 'engage.cloudflareclient.com');
  assert.equal(beans[1].cs.server_port, 2408);
});

test('undefined / null endpoints fall back too (no ENDPOINTS key in KV)', () => {
  const a = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: undefined });
  const b = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: null });
  const c = renderSubscription('neko', {}, { account: ACCOUNT_A }); // no endpoints member at all
  assert.equal(decodePayload(a).length, 2);
  assert.deepEqual(a, c);
  assert.deepEqual(a, b);
});

test('a list where every line is malformed falls back (zero valid lines)', () => {
  const junk = [{ host: 'bad', port: 99999 }, { host: '', port: 1 }];
  const { body } = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: junk });
  assert.equal(decodePayload({ body, contentType: 'text/plain; charset=utf-8' }).length, 2);
});

// ---- seam guards ----

test('AWG record is ignored — payload byte-identical with and without awg', () => {
  const awg = { enabled: true, Jc: '4', Jmin: '40', Jmax: '70', S1: '0', S2: '0', S3: '22', S4: '7', H1: '1', H2: '2', H3: '3', H4: '4', I1: 'I1 = <b 0x61>', I2: '', I3: '', I4: '', I5: '' };
  const a = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  const b = renderSubscription('neko', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg });
  assert.deepEqual(a, b);
  assert.ok(!JSON.stringify(a).includes('amnezia'));
});

test('missing account throws a readable SubscriptionError', () => {
  assert.throws(() => renderSubscription('neko', {}, { endpoints: ENDPOINTS }), SubscriptionError);
  assert.throws(() => renderSubscription('neko', {}, { account: null, endpoints: ENDPOINTS }), /register one in the panel/i);
});