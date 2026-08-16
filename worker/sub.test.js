/**
 * Ticket 04 — /sub — wireguard:// lines + ?scheme=wg (worker/sub.js).
 *
 * Seam tests (external behaviour): given an account record, a parsed
 * endpoint list and opts, the payload decodes to the structure v2rayN
 * (§2.1) and Throne expect — parse the base64 list, decode each link, and
 * assert fields per docs/research/sub-formats.md.
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
  buildThroneLink,
  buildWireguardLink,
  renderSubscription,
  resolveEndpoints,
} from './sub.js';

// ---- fixtures (throwaway, generated 2026-08-17, never used anywhere) ----

/** Full WARP-shaped record — v4 + v6 + 4-byte reserved. */
const ACCOUNT_A = {
  privateKey: '4Xt2vFqq91XsVPAkP1TaW4hcGeGEbODynYWlX47RJkQ=',
  clientId: 'throwaway-client-04',
  token: 'throwaway-token-04',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.2',
  v6: '2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8',
  reserved: 'U4An', // base64 → bytes [83, 128, 39] → dashed "83-128-39"
  registeredAt: '2026-08-17T00:00:00.000Z',
};

/** Minimal record — no v6, empty reserved (the extractor tolerates both). */
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
  { host: 'engage.cloudflareclient.com', port: 51820, raw: 'engage.cloudflareclient.com:51820' },
  { host: '2606:4700:4700::1111', port: 2408, raw: '[2606:4700:4700::1111]:2408' },
];

/** Golden wireguard:// link for ACCOUNT_A × 162.159.192.1:2408 (per §2.1). */
const GOLDEN_WG_LINK =
  'wireguard://4Xt2vFqq91XsVPAkP1TaW4hcGeGEbODynYWlX47RJkQ%3D@162.159.192.1:2408/' +
  '?publickey=bmXOC%2BF1FxEMF9dyiK2H5%2F1SUtzH0JuVo51h2wPfgyo%3D' +
  '&address=172.16.0.2%2F32%2C2606%3A4700%3A110%3A82ce%3Aa1b2%3Ac3d4%3Ae5f6%3Aa7b8%2F128' +
  '&mtu=1280&reserved=U4An#162.159.192.1%3A2408';

/** Golden Throne wg:// link for ACCOUNT_A × 162.159.192.1:2408 (legacy parity). */
const GOLDEN_THRONE_LINK =
  'wg://162.159.192.1:2408?private_key=4Xt2vFqq91XsVPAkP1TaW4hcGeGEbODynYWlX47RJkQ%3D' +
  '&peer_public_key=bmXOC%2BF1FxEMF9dyiK2H5%2F1SUtzH0JuVo51h2wPfgyo%3D' +
  '&pre_shared_key=&reserved=83-128-39&persistent_keepalive=0&mtu=1280' +
  '&use_system_interface=false&local_address=172.16.0.2/32-2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128&workers=0' +
  '&enable_amnezia=true&junk_packet_count=4&junk_packet_min_size=40&junk_packet_max_size=70' +
  '&init_packet_junk_size=0&response_packet_junk_size=0' +
  '&init_packet_magic_header=1&response_packet_magic_header=2' +
  '&underload_packet_magic_header=3&transport_packet_magic_header=4#WARP';

function decodePayload(rendered) {
  assert.equal(rendered.contentType, 'text/plain; charset=utf-8');
  return Buffer.from(rendered.body, 'base64').toString('utf8').split('\n');
}

/** Parse one wireguard:// link and un-escape the fields v2rayN reads. */
function parseWireguardLink(link) {
  assert.ok(link.startsWith('wireguard://'), `expected wireguard:// link, got: ${link.slice(0, 60)}`);
  const u = new URL(link);
  return {
    username: decodeURIComponent(u.username),
    host: u.host,
    publickey: u.searchParams.get('publickey'),
    address: u.searchParams.get('address'),
    mtu: u.searchParams.get('mtu'),
    reserved: u.searchParams.get('reserved'),
    fragment: decodeURIComponent(u.hash.slice(1)),
  };
}

// ---- wireguard:// renderer (v2rayN family, §2.1) ----

test('renderSubscription sub: base64 body decodes to one wireguard:// link per endpoint', () => {
  const { body, contentType } = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  assert.equal(contentType, 'text/plain; charset=utf-8');
  const lines = decodePayload({ body, contentType });
  assert.equal(lines.length, 3);
  for (const line of lines) assert.ok(line.startsWith('wireguard://'));
});

test('wireguard:// link is byte-identical to the §2.1 golden shape', () => {
  const { body } = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: [ENDPOINTS[0]] });
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), GOLDEN_WG_LINK);
});

test('wireguard:// link fields decode per §2.1 (userinfo=privkey, publickey, address, mtu, reserved, fragment=endpoint)', () => {
  const link = buildWireguardLink(ACCOUNT_A, ENDPOINTS[0]);
  const p = parseWireguardLink(link);
  assert.equal(p.username, ACCOUNT_A.privateKey);
  assert.equal(p.host, '162.159.192.1:2408');
  assert.equal(p.publickey, ACCOUNT_A.peerPublicKey);
  assert.equal(p.address, '172.16.0.2/32,2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128');
  assert.equal(p.mtu, '1280');
  assert.equal(p.reserved, ACCOUNT_A.reserved); // base64 of the client id, passed through
  assert.equal(p.fragment, '162.159.192.1:2408');
});

test('hostname endpoint with a custom port renders host and port in authority and fragment', () => {
  const p = parseWireguardLink(buildWireguardLink(ACCOUNT_A, ENDPOINTS[1]));
  assert.equal(p.host, 'engage.cloudflareclient.com:51820');
  assert.equal(p.fragment, 'engage.cloudflareclient.com:51820');
});

test('IPv6 endpoint renders bracketed in the authority and percent-encoded in the fragment', () => {
  const p = parseWireguardLink(buildWireguardLink(ACCOUNT_A, ENDPOINTS[2]));
  assert.equal(p.host, '[2606:4700:4700::1111]:2408');
  assert.equal(p.fragment, '[2606:4700:4700::1111]:2408');
});

test('address drops the v6 CIDR when the record has no v6', () => {
  const p = parseWireguardLink(buildWireguardLink(ACCOUNT_B, ENDPOINTS[0]));
  assert.equal(p.address, '172.16.0.3/32');
});

test('wireguard:// reserved= is always present and valid base64 (empty record → [0,0,0] → "AAAA")', () => {
  for (const [account, expected] of [
    [ACCOUNT_A, 'U4An'], // record base64, round-tripped through the bytes
    [ACCOUNT_B, 'AAAA'], // empty reserved → [0,0,0] → base64 "AAAA"
    [{ ...ACCOUNT_B, reserved: 'AAAA' }, 'AAAA'], // "AAAA" → [0,0,0] → "AAAA"
  ]) {
    const p = parseWireguardLink(buildWireguardLink(account, ENDPOINTS[0]));
    assert.match(p.reserved, /^[A-Za-z0-9+/]+={0,2}$/, 'base64 alphabet');
    assert.equal(p.reserved, expected);
    assert.equal(Buffer.from(p.reserved, 'base64').length, 3, 'decodes to the 3 WARP reserved bytes');
  }
});

test('private key is url-encoded in userinfo ("=" → %3D, "+" → %2B, "/" → %2F)', () => {
  const link = buildWireguardLink({ ...ACCOUNT_B, privateKey: 'a+b/c=d' }, ENDPOINTS[0]);
  assert.ok(link.startsWith('wireguard://a%2Bb%2Fc%3Dd@'));
  assert.equal(decodeURIComponent(link.split('@')[0].slice('wireguard://'.length)), 'a+b/c=d');
});

test('?scheme=wireguard (explicit) is the same as the default', () => {
  const a = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  const b = renderSubscription('sub', { scheme: 'wireguard' }, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  assert.deepEqual(a, b);
});

test('unknown scheme falls back to wireguard (default), never errors', () => {
  const a = decodePayload(renderSubscription('sub', { scheme: 'clash' }, { account: ACCOUNT_A, endpoints: ENDPOINTS }));
  const b = decodePayload(renderSubscription('sub', { scheme: 'wg' }, { account: ACCOUNT_A, endpoints: ENDPOINTS }));
  assert.ok(a.every((line) => line.startsWith('wireguard://')));
  assert.ok(b.every((line) => line.startsWith('wg://')));
});

// ---- wg:// renderer (Throne, legacy buildThrone parity) ----

test('?scheme=wg returns the exact legacy buildThrone line shape (golden)', () => {
  const { body } = renderSubscription('sub', { scheme: 'wg' }, { account: ACCOUNT_A, endpoints: [ENDPOINTS[0]] });
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), GOLDEN_THRONE_LINK);
});

test('wg:// line hardcodes WARP_PUB as peer_public_key (legacy parity)', () => {
  const link = buildThroneLink(ACCOUNT_A, ENDPOINTS[0]);
  const u = new URL(link.replace('wg://', 'http://')); // parse the query
  assert.equal(u.searchParams.get('peer_public_key'), WARP_PUB);
  assert.equal(u.searchParams.get('mtu'), '1280');
  assert.equal(u.searchParams.get('persistent_keepalive'), '0');
  assert.equal(u.searchParams.get('workers'), '0');
  assert.equal(u.searchParams.get('enable_amnezia'), 'true');
  assert.equal(u.hash, '#WARP');
});

test('wg:// reserved is the legacy dashed form of the record reserved bytes', () => {
  assert.match(buildThroneLink(ACCOUNT_A, ENDPOINTS[0]), /reserved=83-128-39/); // 'U4An' → [83,128,39]
  assert.match(buildThroneLink({ ...ACCOUNT_A, reserved: 'AAAA' }, ENDPOINTS[0]), /reserved=0-0-0/);
  assert.match(buildThroneLink(ACCOUNT_B, ENDPOINTS[0]), /reserved=0-0-0/); // empty → [0,0,0]
});

test('wg:// private_key drops the trailing "=" and appends %3D (legacy parity)', () => {
  const link = buildThroneLink(ACCOUNT_A, ENDPOINTS[0]);
  assert.ok(link.includes('private_key=4Xt2vFqq91XsVPAkP1TaW4hcGeGEbODynYWlX47RJkQ%3D'));
  assert.ok(!link.includes('private_key=' + ACCOUNT_A.privateKey)); // no raw "="
});

test('wg:// IPv6 endpoint renders bracketed in the authority', () => {
  assert.ok(buildThroneLink(ACCOUNT_A, ENDPOINTS[2]).startsWith('wg://[2606:4700:4700::1111]:2408?'));
});

test('wg:// local_address is v4/32-v6/128, or v4/32 alone when the record has no v6', () => {
  assert.match(buildThroneLink(ACCOUNT_A, ENDPOINTS[0]), /local_address=172\.16\.0\.2\/32-2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8\/128/);
  assert.match(buildThroneLink(ACCOUNT_B, ENDPOINTS[0]), /local_address=172\.16\.0\.3\/32&/);
});

// ---- endpoint semantics ----

test('one config per valid line, in the stored order', () => {
  const { body } = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS });
  const lines = decodePayload({ body, contentType: 'text/plain; charset=utf-8' });
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('@162.159.192.1:2408/'));
  assert.ok(lines[1].includes('@engage.cloudflareclient.com:51820/'));
  assert.ok(lines[2].includes('@[2606:4700:4700::1111]:2408/'));
});

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
  const { body } = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: [...junk, ENDPOINTS[0], ...junk] });
  const lines = decodePayload({ body, contentType: 'text/plain; charset=utf-8' });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('@162.159.192.1:2408/'));
});

test('empty endpoint list falls back to the two known-good defaults', () => {
  const { body } = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: [] });
  const lines = decodePayload({ body, contentType: 'text/plain; charset=utf-8' });
  assert.equal(lines.length, DEFAULT_ENDPOINTS.length);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('@162.159.192.1:2408/'));
  assert.ok(lines[1].includes('@engage.cloudflareclient.com:2408/'));
});

test('undefined / null endpoints fall back too (no ENDPOINTS key in KV)', () => {
  const a = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: undefined });
  const b = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: null });
  const c = renderSubscription('sub', {}, { account: ACCOUNT_A }); // no endpoints member at all
  assert.equal(decodePayload(a).length, 2);
  assert.deepEqual(a, c);
  assert.deepEqual(a, b);
});

test('a list where every line is malformed falls back (zero valid lines)', () => {
  const junk = [{ host: 'bad', port: 99999 }, { host: '', port: 1 }];
  const { body } = renderSubscription('sub', {}, { account: ACCOUNT_A, endpoints: junk });
  assert.equal(decodePayload({ body, contentType: 'text/plain; charset=utf-8' }).length, 2);
});

test('wg:// scheme applies the same endpoint semantics including fallback', () => {
  const { body } = renderSubscription('sub', { scheme: 'wg' }, { account: ACCOUNT_A, endpoints: [] });
  const lines = decodePayload({ body, contentType: 'text/plain; charset=utf-8' });
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('wg://162.159.192.1:2408?'));
  assert.ok(lines[1].startsWith('wg://engage.cloudflareclient.com:2408?'));
});

// ---- seam guards ----

test('missing account throws a readable SubscriptionError', () => {
  assert.throws(() => renderSubscription('sub', {}, { endpoints: ENDPOINTS }), SubscriptionError);
  assert.throws(() => renderSubscription('sub', {}, { account: null, endpoints: ENDPOINTS }), /register one in the panel/i);
});

test('unknown format throws a readable SubscriptionError', () => {
  // NOTE: 'clash', 'singbox', 'neko' (tickets 05–07), then 'wg' and 'awg'
  // (ticket 08) are all registered renderers now — use a nonsense format
  // name to prove the guard.
  assert.throws(() => renderSubscription('bogus', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS }), /Unknown subscription format: "bogus"/);
  assert.throws(() => renderSubscription(undefined, {}, { account: ACCOUNT_A }), SubscriptionError);
});

test('resolveEndpoints is exported for reuse (fallback constant shape)', () => {
  assert.equal(resolveEndpoints([]), DEFAULT_ENDPOINTS);
  assert.equal(resolveEndpoints(null), DEFAULT_ENDPOINTS);
  assert.equal(resolveEndpoints([ENDPOINTS[2]]).length, 1);
});