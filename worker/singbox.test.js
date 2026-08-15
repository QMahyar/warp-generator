/**
 * Ticket 06 — /sub/singbox — sing-box config.json (worker/sub.js renderSingbox).
 *
 * Seam tests (external behaviour): given an account record and a parsed
 * endpoint list, the payload is a full minimal sing-box `config.json`
 * that parses and matches the schemas in docs/research/sub-formats.md
 * §2.3 — the 1.13+ WireGuard ENDPOINT shape by default, and the pre-1.13
 * wireguard OUTBOUND shape under `opts.legacy === '1'` (NekoBox Android /
 * Husi). Schema facts (endpoint `address`/`peers[].allowed_ips`/`reserved`,
 * selector `outbounds`/`default`, `route.final`, DNS server `type` field,
 * legacy-format removal in 1.14) were verified against
 * sing-box.sagernet.org + the sing-box option source at implementation
 * time (see result file).
 *
 * Fixtures are the same throwaway records tickets 04/05 generated
 * (regenerated here — test files are not imported into each other).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ENDPOINTS,
  SubscriptionError,
  WARP_PUB,
  buildLegacyWireguardOutbound,
  buildSingboxEndpoint,
  renderSubscription,
  SUB_MTU,
} from './sub.js';

// ---- fixtures (throwaway, identical to tickets 04/05 — never real keys) ----

/** Full WARP-shaped record — v4 + v6 + 4-byte (3-byte decoded) reserved. */
const ACCOUNT_A = {
  privateKey: '4Xt2vFqq91XsVPAkP1TaW4hcGeGEbODynYWlX47RJkQ=',
  clientId: 'throwaway-client-04',
  token: 'throwaway-token-04',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.2',
  v6: '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8',
  reserved: 'U4An', // base64 → bytes [83, 128, 39]
  registeredAt: '2026-08-17T00:00:00.000Z',
};

/** Minimal record — no v6, empty reserved. */
const ACCOUNT_B = {
  privateKey: '0tMTHiHvXQRAh+NIX7ozB9cWVgCZkTEiVKrniJTTLx8=',
  clientId: 'throwaway-client-04b',
  token: 'throwaway-token-04b',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.3',
  v6: '',
  reserved: '',
  registeredAt: '2026-08-17T00:00:00.000Z',
};

/** The canonical parsed-endpoint shape settings.js produces. */
const ENDPOINTS = [
  { host: '162.159.192.1', port: 2408, raw: '162.159.192.1:2408' },
  { host: '2606:4700:4700::1111', port: 2408, raw: '[2606:4700:4700::1111]:2408' },
  { host: 'engage.cloudflareclient.com', port: 51820, raw: 'engage.cloudflareclient.com:51820' },
];

/** AWG record — must be invisible in the sing-box payload. */
const AWG_FULL = {
  enabled: true,
  Jc: '4', Jmin: '40', Jmax: '70',
  S1: '0', S2: '0', S3: '22', S4: '7',
  H1: '1', H2: '2', H3: '3', H4: '4',
  I1: 'I1 = <b 0x61>', I2: '', I3: '', I4: '', I5: '',
};

const TAGS = ['warp-162.159.192.1:2408', 'warp-[2606:4700:4700::1111]:2408', 'warp-engage.cloudflareclient.com:51820'];

/** Parse the renderer output; returns the config object (throws on bad JSON). */
function parseSingbox(rendered) {
  assert.equal(rendered.contentType, 'application/json; charset=utf-8');
  return JSON.parse(rendered.body);
}

function renderDefault(account = ACCOUNT_A, endpoints = ENDPOINTS, opts = {}) {
  return renderSubscription('singbox', opts, { account, endpoints, awg: null });
}

// ---- default payload: 1.13+ WireGuard endpoint shape ----

test('singbox: pretty-printed JSON document (never base64), application/json content type', () => {
  const { body, contentType } = renderDefault();
  assert.equal(contentType, 'application/json; charset=utf-8');
  assert.ok(body.startsWith('{\n'), 'pretty-printed with 2-space indent');
  assert.ok(body.endsWith('\n'), 'trailing newline');
  assert.ok(!body.includes('base64'));
  const doc = JSON.parse(body);
  for (const key of ['log', 'dns', 'inbounds', 'endpoints', 'outbounds', 'route']) {
    assert.ok(key in doc, `top-level key ${key}`);
  }
});

test('singbox: one endpoints entry per valid endpoint, in stored order, tags warp-<host>:<port>', () => {
  const doc = parseSingbox(renderDefault());
  assert.equal(doc.endpoints.length, 3);
  assert.deepEqual(doc.endpoints.map((ep) => ep.tag), TAGS);
});

test('singbox: endpoint entry carries the §2.3 fields with record values', () => {
  const doc = parseSingbox(renderDefault());
  for (const [i, ep] of doc.endpoints.entries()) {
    assert.equal(ep.type, 'wireguard');
    assert.equal(ep.mtu, SUB_MTU);
    assert.deepEqual(ep.address, ['172.16.0.2/32', '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128']);
    assert.equal(ep.private_key, ACCOUNT_A.privateKey);
    assert.equal(ep.peers.length, 1, 'exactly one peer per endpoint');
    const peer = ep.peers[0];
    assert.equal(peer.address, ENDPOINTS[i].host);
    assert.equal(peer.port, ENDPOINTS[i].port);
    assert.equal(peer.public_key, ACCOUNT_A.peerPublicKey);
    assert.deepEqual(peer.allowed_ips, ['0.0.0.0/0', '::/0']);
    assert.deepEqual(peer.reserved, [83, 128, 39]); // 'U4An'
  }
});

test('singbox: IPv6 endpoint — tag re-bracketed, peer address bare, custom port preserved', () => {
  const doc = parseSingbox(renderDefault());
  const ipv6 = doc.endpoints[1];
  assert.equal(ipv6.tag, 'warp-[2606:4700:4700::1111]:2408');
  assert.equal(ipv6.peers[0].address, '2606:4700:4700::1111');
  assert.equal(ipv6.peers[0].port, 2408);
  assert.equal(doc.endpoints[2].peers[0].port, 51820); // hostname + custom port
});

test('singbox: v6-less account → address is v4/32 alone; empty reserved → [0,0,0]', () => {
  const { body } = renderDefault(ACCOUNT_B);
  const doc = JSON.parse(body);
  for (const ep of doc.endpoints) {
    assert.deepEqual(ep.address, ['172.16.0.3/32']);
    assert.deepEqual(ep.peers[0].reserved, [0, 0, 0]);
  }
  assert.ok(!body.includes('2606:4700:110'), 'the account v6 never leaks into the payload');
});

test('singbox: golden default config for one v4 endpoint (structural equality)', () => {
  const doc = parseSingbox(renderDefault(ACCOUNT_A, [ENDPOINTS[0]]));
  assert.deepEqual(doc, {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: [{ type: 'udp', tag: 'cloudflare-dns', server: '1.1.1.1' }],
      final: 'cloudflare-dns',
    },
    inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 2080 }],
    outbounds: [{
      type: 'selector',
      tag: 'select',
      outbounds: ['warp-162.159.192.1:2408'],
      default: 'warp-162.159.192.1:2408',
    }],
    route: { final: 'select' },
    endpoints: [{
      type: 'wireguard',
      tag: 'warp-162.159.192.1:2408',
      mtu: 1280,
      address: ['172.16.0.2/32', '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128'],
      private_key: ACCOUNT_A.privateKey,
      peers: [{
        address: '162.159.192.1',
        port: 2408,
        public_key: ACCOUNT_A.peerPublicKey,
        allowed_ips: ['0.0.0.0/0', '::/0'],
        reserved: [83, 128, 39],
      }],
    }],
  });
});

test('singbox: skeleton — dns 1.1.1.1 typed server, mixed inbound on 0.0.0.0:2080, selector lists every tag, route final = select', () => {
  const doc = parseSingbox(renderDefault());
  assert.deepEqual(doc.dns.servers, [{ type: 'udp', tag: 'cloudflare-dns', server: '1.1.1.1' }]);
  assert.equal(doc.dns.final, 'cloudflare-dns');
  assert.deepEqual(doc.inbounds, [{ type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 2080 }]);
  assert.equal(doc.outbounds.length, 1);
  assert.equal(doc.outbounds[0].type, 'selector');
  assert.deepEqual(doc.outbounds[0].outbounds, TAGS);
  assert.equal(doc.outbounds[0].default, TAGS[0]);
  assert.equal(doc.route.final, 'select');
});

// ---- legacy payload: pre-1.13 wireguard outbound shape ----

test('singbox: ?legacy=1 → pre-1.13 wireguard outbounds; no endpoints key', () => {
  const doc = parseSingbox(renderDefault(ACCOUNT_A, ENDPOINTS, { legacy: '1' }));
  assert.ok(!('endpoints' in doc), 'endpoints key absent in the legacy payload');
  const wg = doc.outbounds.filter((o) => o.type === 'wireguard');
  assert.equal(wg.length, 3, 'one legacy wireguard outbound per endpoint');
  const sel = doc.outbounds.filter((o) => o.type === 'selector');
  assert.equal(sel.length, 1);
  assert.deepEqual(sel[0].outbounds, TAGS);
});

test('singbox: legacy outbound carries the §2.3 first-block fields with record values', () => {
  const doc = parseSingbox(renderDefault(ACCOUNT_A, ENDPOINTS, { legacy: '1' }));
  for (const [i, ob] of doc.outbounds.filter((o) => o.type === 'wireguard').entries()) {
    assert.equal(ob.tag, TAGS[i]);
    assert.equal(ob.server, ENDPOINTS[i].host);
    assert.equal(ob.server_port, ENDPOINTS[i].port);
    assert.deepEqual(ob.local_address, ['172.16.0.2/32', '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128']);
    assert.equal(ob.private_key, ACCOUNT_A.privateKey);
    assert.equal(ob.peer_public_key, ACCOUNT_A.peerPublicKey);
    assert.deepEqual(ob.reserved, [83, 128, 39]);
    assert.equal(ob.mtu, SUB_MTU);
  }
});

test('singbox: legacy outbound maps 1:1 onto the default endpoint entry (same account + endpoint)', () => {
  const def = parseSingbox(renderDefault(ACCOUNT_A, ENDPOINTS, {}));
  const leg = parseSingbox(renderDefault(ACCOUNT_A, ENDPOINTS, { legacy: '1' })).outbounds.filter((o) => o.type === 'wireguard');
  for (let i = 0; i < def.endpoints.length; i++) {
    const ep = def.endpoints[i];
    const peer = ep.peers[0];
    const ob = leg[i];
    assert.equal(ob.tag, ep.tag);
    assert.equal(ob.server, peer.address);
    assert.equal(ob.server_port, peer.port);
    assert.deepEqual(ob.local_address, ep.address);
    assert.equal(ob.private_key, ep.private_key);
    assert.equal(ob.peer_public_key, peer.public_key);
    assert.deepEqual(ob.reserved, peer.reserved);
    assert.equal(ob.mtu, ep.mtu);
  }
});

test('singbox: legacy payload keeps the skeleton, with the era-correct legacy dns server form', () => {
  const doc = parseSingbox(renderDefault(ACCOUNT_A, [ENDPOINTS[0]], { legacy: '1' }));
  assert.deepEqual(doc.dns.servers, [{ tag: 'cloudflare-dns', address: '1.1.1.1' }]); // pre-1.12 address form (valid ≤1.13)
  assert.deepEqual(doc.inbounds, [{ type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 2080 }]);
  assert.equal(doc.route.final, 'select');
  assert.deepEqual(doc.log, { level: 'info', timestamp: true });
});

test('singbox: only the exact ?legacy=1 flag selects the legacy shape', () => {
  for (const opts of [{}, undefined, { legacy: null }, { legacy: '0' }, { legacy: 'true' }, { legacy: '2' }]) {
    const doc = parseSingbox(renderDefault(ACCOUNT_A, ENDPOINTS, opts));
    assert.ok('endpoints' in doc, `endpoints present for opts=${JSON.stringify(opts)}`);
    assert.ok(!doc.outbounds.some((o) => o.type === 'wireguard'), `no wireguard outbound for opts=${JSON.stringify(opts)}`);
  }
  const legacy = parseSingbox(renderDefault(ACCOUNT_A, ENDPOINTS, { legacy: '1' }));
  assert.ok(!('endpoints' in legacy));
});

// ---- endpoint semantics (identical to tickets 04/05, exercised here) ----

test('singbox: malformed endpoint entries are skipped — the renderer never errors', () => {
  const junk = [
    null,
    { host: '', port: 2408 },
    { host: 'no-port-here' },
    { host: 'x', port: 0 },
    { host: 'x', port: 70000 },
    { host: 'y', port: '2408' }, // string port
    '162.159.192.1:2408', // raw string — not the parsed shape
  ];
  const doc = parseSingbox(renderDefault(ACCOUNT_A, [...junk, ENDPOINTS[0], ...junk]));
  assert.equal(doc.endpoints.length, 1);
  assert.equal(doc.endpoints[0].tag, TAGS[0]);
  assert.deepEqual(doc.outbounds[0].outbounds, [TAGS[0]]);
});

test('singbox: zero valid endpoints → the two fallback endpoints (default and legacy)', () => {
  const expected = DEFAULT_ENDPOINTS.map((e) => `warp-${e.host}:${e.port}`);
  for (const endpoints of [[], null, undefined, [{ host: 'bad', port: 99999 }, { host: '', port: 1 }]]) {
    const doc = parseSingbox(renderSubscription('singbox', {}, { account: ACCOUNT_A, endpoints, awg: null }));
    assert.deepEqual(doc.endpoints.map((ep) => ep.tag), expected);
    assert.deepEqual(doc.endpoints.map((ep) => ep.peers[0].address), ['162.159.192.1', 'engage.cloudflareclient.com']);
    assert.deepEqual(doc.endpoints.map((ep) => ep.peers[0].port), [2408, 2408]);
    const legacy = parseSingbox(renderSubscription('singbox', { legacy: '1' }, { account: ACCOUNT_A, endpoints, awg: null }));
    const wg = legacy.outbounds.filter((o) => o.type === 'wireguard');
    assert.deepEqual(wg.map((o) => o.tag), expected);
  }
});

test('singbox: endpoints absent from the data object falls back too', () => {
  const a = renderSubscription('singbox', {}, { account: ACCOUNT_A });
  const b = renderSubscription('singbox', {}, { account: ACCOUNT_A, endpoints: undefined });
  assert.deepEqual(a, b);
  assert.equal(parseSingbox(a).endpoints.length, 2);
});

// ---- AWG is not expressible ----

test('singbox: AWG record is ignored — payload byte-identical with and without it', () => {
  const without = renderDefault(ACCOUNT_A, ENDPOINTS);
  const withAwg = renderSubscription('singbox', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg: AWG_FULL });
  assert.deepEqual(withAwg, without);
  const legacy = renderSubscription('singbox', { legacy: '1' }, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg: AWG_FULL });
  const legacyPlain = renderSubscription('singbox', { legacy: '1' }, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg: null });
  assert.deepEqual(legacy, legacyPlain);
  assert.ok(!legacy.body.includes('amnezia'));
});

// ---- unit contracts of the entry builders ----

test('singbox: buildSingboxEndpoint / buildLegacyWireguardOutbound return the §2.3 shapes directly', () => {
  const ep = buildSingboxEndpoint(ACCOUNT_B, ENDPOINTS[2]);
  assert.equal(ep.type, 'wireguard');
  assert.equal(ep.tag, 'warp-engage.cloudflareclient.com:51820');
  assert.deepEqual(ep.peers[0].allowed_ips, ['0.0.0.0/0', '::/0']);
  const ob = buildLegacyWireguardOutbound(ACCOUNT_B, ENDPOINTS[2]);
  assert.equal(ob.type, 'wireguard');
  assert.equal(ob.server, 'engage.cloudflareclient.com');
  assert.equal(ob.server_port, 51820);
  assert.equal(ob.private_key, ACCOUNT_B.privateKey);
  assert.equal(ob.peer_public_key, WARP_PUB);
  assert.deepEqual(ob.local_address, ['172.16.0.3/32']);
  assert.deepEqual(ob.reserved, [0, 0, 0]);
});

// ---- seam guards ----

test('singbox: missing account throws a readable SubscriptionError', () => {
  assert.throws(() => renderSubscription('singbox', {}, { endpoints: ENDPOINTS }), SubscriptionError);
  assert.throws(() => renderSubscription('singbox', {}, { account: null, endpoints: ENDPOINTS }), /register one in the panel/i);
});