/**
 * Ticket 08 — /sub/wg (ZIP of .confs) + /sub/awg (awg:// links).
 *
 * Seam tests (external behaviour): the seam's outputs are parsed here,
 * independently of the production code — the ZIP is walked byte-by-byte
 * (local headers → central directory → EOCD) with its own reference CRC-32
 * implementation, and the awg:// links are base64url-decoded back into
 * confs which are then asserted line-by-line.
 *
 * The zip writer itself (worker/zip.js) is also unit-tested directly:
 * magic bytes PK\x03\x04, entry parsing, CRC match, stored-method fields.
 *
 * Fixtures are throwaway records (generated once with crypto.randomBytes,
 * hardcoded here — never real keys).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';

import { buildZip, crc32 } from './zip.js';
import {
  DEFAULT_ENDPOINTS,
  SubscriptionError,
  WARP_PUB,
  awgConfLines,
  buildAwgLink,
  buildWgConf,
  confFileNameOf,
  renderSubscription,
} from './sub.js';

// ---- fixtures (throwaway, generated 2026-08-19, never used anywhere) ----

/** Full WARP-shaped record — v4 + v6 + 4-byte reserved. */
const ACCOUNT_A = {
  privateKey: 'vGXA5rV6uENcjPBDjl8BloJl1MzHapogD9n6PA3hdK4=',
  clientId: 'throwaway-client-08',
  token: 'throwaway-token-08',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.10',
  v6: '2606:4700:110:82ce:1d:7a:70:ae:81:06:c2:03',
  reserved: 'U4An', // base64 → bytes [83, 128, 39]
  registeredAt: '2026-08-19T00:00:00.000Z',
};

/** Minimal record — no v6, empty reserved. */
const ACCOUNT_B = {
  privateKey: 'AbHt+sgXup13GBEr9Qjm+z+pHksDt8FbaNqfeZGUDIk=',
  clientId: 'throwaway-client-08b',
  token: 'throwaway-token-08b',
  peerPublicKey: WARP_PUB,
  v4: '172.16.0.11',
  v6: '',
  reserved: '',
  registeredAt: '2026-08-19T00:00:00.000Z',
};

/** The canonical parsed-endpoint shape settings.js produces. */
const ENDPOINTS = [
  { host: '162.159.192.1', port: 2408, raw: '162.159.192.1:2408' },
  { host: 'engage.cloudflareclient.com', port: 51820, raw: 'engage.cloudflareclient.com:51820' },
  { host: '2606:4700:4700::1111', port: 2408, raw: '[2606:4700:4700::1111]:2408' },
];

/** An AWG record in the stored shape (settings.js): params as strings, I1 a CPS line. */
const AWG_ON = {
  enabled: true,
  Jc: '4', Jmin: '40', Jmax: '70',
  S1: '0', S2: '', S3: '3', S4: '',
  H1: '1', H2: '2', H3: '3', H4: '4',
  I1: 'I1 = <b 0xc10000000114367096bb0fb3f58f3a3f>',
  I2: '', I3: '', I4: '', I5: '',
};

// ---- independent ZIP parsing (verifies, never reuses, the production writer) ----

/** Reference CRC-32 — bitwise, no table (cross-checks zip.js crc32). */
function referenceCrc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Walk a ZIP byte-for-byte: local file headers, then the central
 * directory, then the EOCD. Asserts structural consistency as it goes and
 * returns the entries `[{ name, method, crc, data }]` (data = entry bytes).
 */
function parseZip(bytes) {
  assert.ok(bytes instanceof Uint8Array);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = [];
  let pos = 0;

  // Local file headers (PK\x03\x04) + entry data.
  while (pos + 30 <= bytes.length && view.getUint32(pos, true) === 0x04034b50) {
    const localOffset = pos;
    const method = view.getUint16(pos + 8, true);
    const crc = view.getUint32(pos + 14, true);
    const compSize = view.getUint32(pos + 18, true);
    const uncompSize = view.getUint32(pos + 22, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const dataStart = pos + 30 + nameLen + extraLen;
    const data = bytes.subarray(dataStart, dataStart + compSize);
    entries.push({ name, method, crc, compSize, uncompSize, data, localOffset });
    pos = dataStart + compSize;
  }

  // Central directory (PK\x01\x02).
  const cdEntries = [];
  while (pos + 46 <= bytes.length && view.getUint32(pos, true) === 0x02014b50) {
    const crc = view.getUint32(pos + 16, true);
    const compSize = view.getUint32(pos + 20, true);
    const uncompSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    cdEntries.push({ name, crc, compSize, uncompSize, localOffset });
    pos += 46 + nameLen;
  }

  // End of central directory (PK\x05\x06).
  assert.equal(view.getUint32(pos, true), 0x06054b50, 'EOCD signature');
  const count = view.getUint16(pos + 10, true);
  const cdSize = view.getUint32(pos + 12, true);
  const cdOffset = view.getUint32(pos + 16, true);
  assert.equal(bytes.length, pos + 22, 'archive ends exactly at the EOCD');

  // Cross-checks: central directory vs local headers, and the CRC of
  // every entry against the independently computed reference.
  assert.equal(count, entries.length);
  assert.equal(cdEntries.length, entries.length);
  assert.equal(cdSize, cdEntries.reduce((sum, e) => sum + 46 + e.name.length, 0));
  for (let i = 0; i < entries.length; i++) {
    assert.equal(cdEntries[i].name, entries[i].name);
    assert.equal(cdEntries[i].crc, entries[i].crc);
    assert.equal(cdEntries[i].localOffset, entries[i].localOffset, 'central dir points at the local header');
    assert.equal(cdEntries[i].compSize, entries[i].compSize);
    assert.equal(referenceCrc32(entries[i].data), entries[i].crc, `CRC of ${entries[i].name}`);
  }
  return entries;
}

// ---- zip writer unit tests ----

test('crc32 matches the CRC-32 check value and the reference implementation', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926); // IEEE check value
  assert.equal(crc32(Buffer.from('123456789')), referenceCrc32(Buffer.from('123456789')));
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(Buffer.from('the quick brown fox jumps over the lazy dog')), referenceCrc32(Buffer.from('the quick brown fox jumps over the lazy dog')));
});

test('buildZip: magic bytes PK\\x03\\x04, entries parse back byte-exact', () => {
  const zip = buildZip([
    { name: 'a.conf', data: '[Interface]\nPrivateKey = x\n' },
    { name: 'b.conf', data: 'hello world' },
  ]);
  assert.equal(zip[0], 0x50); // 'P'
  assert.equal(zip[1], 0x4b); // 'K'
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
  const entries = parseZip(zip);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'a.conf');
  assert.equal(new TextDecoder().decode(entries[0].data), '[Interface]\nPrivateKey = x\n');
  assert.equal(new TextDecoder().decode(entries[1].data), 'hello world');
});

test('buildZip: entries are stored (method 0) with matching size fields', () => {
  const zip = buildZip([{ name: 'x.conf', data: 'abcdef' }]);
  const [entry] = parseZip(zip);
  assert.equal(entry.method, 0);
  assert.equal(entry.compSize, 6);
  assert.equal(entry.uncompSize, 6);
  assert.equal(entry.compSize, entry.data.length);
});

test('buildZip: string and byte-array data both work; empty list → valid EOCD-only archive', () => {
  const a = parseZip(buildZip([{ name: 's.conf', data: 'text' }]));
  assert.equal(new TextDecoder().decode(a[0].data), 'text');
  const b = parseZip(buildZip([{ name: 'u.conf', data: new Uint8Array([0, 1, 2, 255]) }]));
  assert.deepEqual(Array.from(b[0].data), [0, 1, 2, 255]);
  const empty = buildZip([]);
  assert.equal(empty.length, 22); // EOCD only
  assert.equal(new DataView(empty.buffer).getUint32(0, true), 0x06054b50);
});

// ---- conf builder ----

test('confFileNameOf: warp-<host>-<port>.conf, with hostile chars sanitized', () => {
  assert.equal(confFileNameOf(ENDPOINTS[0]), 'warp-162.159.192.1-2408.conf');
  assert.equal(confFileNameOf(ENDPOINTS[1]), 'warp-engage.cloudflareclient.com-51820.conf');
  assert.equal(confFileNameOf(ENDPOINTS[2]), 'warp-2606-4700-4700--1111-2408.conf'); // IPv6 colons → dashes
  // No path tricks, no brackets: separators and bracket/colon chars become dashes.
  const weird = confFileNameOf({ host: '../../etc\\[passwd]:x', port: 1 });
  assert.ok(!weird.includes('/'));
  assert.ok(!weird.includes('\\'));
  assert.ok(!weird.includes('['));
  assert.ok(!weird.includes(':'));
  assert.ok(!weird.includes('..'));
  assert.ok(weird.endsWith('-1.conf'));
});

test('buildWgConf: standard WireGuard [Interface]/[Peer] shape (AWG off)', () => {
  const conf = buildWgConf(ACCOUNT_A, ENDPOINTS[0], null);
  assert.equal(
    conf,
    [
      '[Interface]',
      `PrivateKey = ${ACCOUNT_A.privateKey}`,
      'Address = 172.16.0.10/32, 2606:4700:110:82ce:1d:7a:70:ae:81:06:c2:03/128',
      'DNS = 1.1.1.1',
      'MTU = 1280',
      '',
      '[Peer]',
      `PublicKey = ${WARP_PUB}`,
      'AllowedIPs = 0.0.0.0/0, ::/0',
      'Endpoint = 162.159.192.1:2408',
    ].join('\n'),
  );
});

test('buildWgConf: IPv6 endpoint re-bracketed in Endpoint; v6-less record → v4-only Address', () => {
  assert.ok(buildWgConf(ACCOUNT_A, ENDPOINTS[2], null).includes('Endpoint = [2606:4700:4700::1111]:2408'));
  const conf = buildWgConf(ACCOUNT_B, ENDPOINTS[0], null);
  assert.ok(conf.includes('Address = 172.16.0.11/32'));
  assert.ok(!conf.includes('2606:'));
});

test('buildWgConf: AWG record enabled adds J/S/H/I lines, omitting empty params, I lines verbatim', () => {
  const conf = buildWgConf(ACCOUNT_A, ENDPOINTS[0], AWG_ON);
  // Order per the canonical conf order (Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5),
  // formatted like the legacy buildWireguard lines.
  const awgBlock = [
    'Jc = 4',
    'Jmin = 40',
    'Jmax = 70',
    'S1 = 0',
    'S3 = 3',
    'H1 = 1',
    'H2 = 2',
    'H3 = 3',
    'H4 = 4',
    'I1 = <b 0xc10000000114367096bb0fb3f58f3a3f>',
  ].join('\n');
  assert.ok(conf.includes(`MTU = 1280\n${awgBlock}\n\n[Peer]`));
  // Omitted: S2, S4 (empty strings).
  assert.ok(!conf.includes('S2 ='));
  assert.ok(!conf.includes('S4 ='));
  assert.ok(!conf.includes('I2 ='));
});

test('awgConfLines: disabled/absent/null records → no lines; {enabled:false} and {} also none', () => {
  assert.deepEqual(awgConfLines(null), []);
  assert.deepEqual(awgConfLines(undefined), []);
  assert.deepEqual(awgConfLines({}), []);
  assert.deepEqual(awgConfLines({ enabled: false, Jc: '4' }), []);
  assert.deepEqual(awgConfLines({ enabled: true, Jc: '4', Jmin: '', I1: 'I1 = <b 0xab>' }), ['Jc = 4', 'I1 = <b 0xab>']);
});

// ---- wg renderer (zip) ----

test('renderSubscription wg: application/zip archive with one .conf per valid endpoint, in order', () => {
  const { body, contentType } = renderSubscription('wg', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg: null });
  assert.equal(contentType, 'application/zip');
  assert.ok(body instanceof Uint8Array);
  const entries = parseZip(body);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((e) => e.name), [
    'warp-162.159.192.1-2408.conf',
    'warp-engage.cloudflareclient.com-51820.conf',
    'warp-2606-4700-4700--1111-2408.conf',
  ]);
  // Each entry: the conf builder's output for that endpoint.
  for (let i = 0; i < entries.length; i++) {
    assert.equal(new TextDecoder().decode(entries[i].data), buildWgConf(ACCOUNT_A, ENDPOINTS[i], null));
  }
});

test('renderSubscription wg: AWG on → every conf carries the J/S/H/I lines; off/absent → plain confs', () => {
  const on = renderSubscription('wg', {}, { account: ACCOUNT_A, endpoints: [ENDPOINTS[0]], awg: AWG_ON });
  const confOn = new TextDecoder().decode(parseZip(on.body)[0].data);
  assert.ok(confOn.includes('Jc = 4'));
  assert.ok(confOn.includes('I1 = <b 0xc10000000114367096bb0fb3f58f3a3f>'));
  assert.ok(confOn.includes('\n\n[Peer]'));

  for (const off of [null, undefined, { enabled: false }, {}]) {
    const { body } = renderSubscription('wg', {}, { account: ACCOUNT_A, endpoints: [ENDPOINTS[0]], awg: off });
    const conf = new TextDecoder().decode(parseZip(body)[0].data);
    assert.ok(!conf.includes('Jc ='));
    assert.ok(!conf.includes('S1 ='));
    assert.ok(!conf.includes('H1 ='));
    assert.ok(!conf.includes('I1 ='));
    assert.equal(conf, buildWgConf(ACCOUNT_A, ENDPOINTS[0], null));
  }
});

test('renderSubscription wg: malformed entries skipped, zero valid → the two fallback endpoints', () => {
  const junk = [null, { host: '', port: 2408 }, { host: 'x', port: 70000 }, '162.159.192.1:2408'];
  const { body } = renderSubscription('wg', {}, { account: ACCOUNT_A, endpoints: [...junk, ENDPOINTS[0]] });
  assert.equal(parseZip(body).length, 1);

  for (const empty of [[], null, undefined]) {
    const { body: b } = renderSubscription('wg', {}, { account: ACCOUNT_A, endpoints: empty });
    const entries = parseZip(b);
    assert.equal(entries.length, DEFAULT_ENDPOINTS.length);
    assert.deepEqual(entries.map((e) => e.name), ['warp-162.159.192.1-2408.conf', 'warp-engage.cloudflareclient.com-2408.conf']);
  }
});

// ---- awg renderer (awg:// links) ----

/** Independent base64url decoder (RFC 4648 §5): - → +, _ → /, then standard base64. */
function decodeUrlSafeBase64(s) {
  assert.match(s, /^[A-Za-z0-9_-]+=*$/, 'segment is URL-safe base64');
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** The /sub envelope: whole blob is standard base64 → one link per line. */
function decodeAwgBlob(rendered) {
  assert.equal(rendered.contentType, 'text/plain; charset=utf-8');
  return Buffer.from(rendered.body, 'base64').toString('utf8').split('\n');
}

test('renderSubscription awg: base64 envelope decodes to one awg:// link per valid endpoint', () => {
  const { body, contentType } = renderSubscription('awg', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg: null });
  assert.equal(contentType, 'text/plain; charset=utf-8');
  const lines = decodeAwgBlob({ body, contentType });
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.ok(line.startsWith('awg://'));
    assert.ok(line.includes('#'));
  }
});

test('awg:// link: base64url segment round-trips to the conf, #name = warp-<host>:<port>', () => {
  const link = buildAwgLink(ACCOUNT_A, ENDPOINTS[0], AWG_ON);
  const [segment, name] = link.slice('awg://'.length).split('#');
  assert.equal(name, 'warp-162.159.192.1:2408');
  assert.equal(decodeUrlSafeBase64(segment), buildWgConf(ACCOUNT_A, ENDPOINTS[0], AWG_ON));
});

test('awg:// link with AWG on: decoded conf carries the stored params incl. the verbatim I1 CPS line', () => {
  const link = buildAwgLink(ACCOUNT_A, ENDPOINTS[1], AWG_ON);
  const conf = decodeUrlSafeBase64(link.slice('awg://'.length).split('#')[0]);
  assert.ok(conf.includes('Jc = 4'));
  assert.ok(conf.includes('S3 = 3'));
  assert.ok(conf.includes('H4 = 4'));
  assert.ok(conf.includes('I1 = <b 0xc10000000114367096bb0fb3f58f3a3f>'));
  assert.ok(!conf.includes('S2 =')); // empty params still omitted
  assert.ok(conf.endsWith('Endpoint = engage.cloudflareclient.com:51820'));
});

test('awg:// link with AWG off/absent: legacy defaults — Jc/Jmin/Jmax/S1/S2/H1–H4, no I lines', () => {
  for (const awg of [null, undefined, { enabled: false }]) {
    const link = buildAwgLink(ACCOUNT_A, ENDPOINTS[0], awg);
    const conf = decodeUrlSafeBase64(link.slice('awg://'.length).split('#')[0]);
    // The exact legacy buildWireguard set (settings.js DEFAULT_AWG):
    // Jc 4, Jmin 40, Jmax 70, S1 0, S2 0, H1–H4 1–4; S3/S4/I1–I5 unset →
    // omitted. Same lines the legacy generator hardcoded into every conf.
    const block = [
      'Jc = 4', 'Jmin = 40', 'Jmax = 70', 'S1 = 0', 'S2 = 0',
      'H1 = 1', 'H2 = 2', 'H3 = 3', 'H4 = 4',
    ];
    for (const line of block) assert.ok(conf.includes(line), `missing ${line}`);
    assert.ok(!conf.includes('S3 ='));
    assert.ok(!conf.includes('S4 ='));
    assert.ok(!conf.includes('I1 ='));
    assert.ok(!conf.includes('I2 ='));
  }
});

test('renderSubscription awg: IPv6 endpoint name is bracketed; v6-less record → v4-only Address', () => {
  const link = buildAwgLink(ACCOUNT_A, ENDPOINTS[2], null);
  assert.ok(link.endsWith('#warp-[2606:4700:4700::1111]:2408'));
  const conf = decodeUrlSafeBase64(link.slice('awg://'.length).split('#')[0]);
  assert.ok(conf.includes('Endpoint = [2606:4700:4700::1111]:2408'));

  const linkB = buildAwgLink(ACCOUNT_B, ENDPOINTS[0], null);
  const confB = decodeUrlSafeBase64(linkB.slice('awg://'.length).split('#')[0]);
  assert.ok(confB.includes('Address = 172.16.0.11/32'));
  assert.ok(!confB.includes('2606:'));
});

test('renderSubscription awg: malformed skipped, zero valid → the two fallback links', () => {
  const junk = [null, { host: '', port: 1 }, { host: 'x', port: 0 }];
  const { body } = renderSubscription('awg', {}, { account: ACCOUNT_A, endpoints: [...junk, ENDPOINTS[0], ...junk] });
  assert.equal(decodeAwgBlob({ body, contentType: 'text/plain; charset=utf-8' }).length, 1);

  const { body: b } = renderSubscription('awg', {}, { account: ACCOUNT_A, endpoints: [] });
  const lines = decodeAwgBlob({ body: b, contentType: 'text/plain; charset=utf-8' });
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('awg://'));
  assert.ok(lines[0].endsWith('#warp-162.159.192.1:2408'));
  assert.ok(lines[1].endsWith('#warp-engage.cloudflareclient.com:2408'));
});

// ---- seam guards ----

test('wg and awg: missing account throws a readable SubscriptionError', () => {
  for (const format of ['wg', 'awg']) {
    assert.throws(() => renderSubscription(format, {}, { endpoints: ENDPOINTS }), SubscriptionError);
    assert.throws(() => renderSubscription(format, {}, { account: null, endpoints: ENDPOINTS }), /register one in the panel/i);
  }
});

test('wg renderer output is deterministic for identical inputs', () => {
  const a = renderSubscription('wg', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg: AWG_ON });
  const b = renderSubscription('wg', {}, { account: ACCOUNT_A, endpoints: ENDPOINTS, awg: AWG_ON });
  assert.deepEqual(a, b);
  assert.deepEqual(Buffer.from(a.body), Buffer.from(b.body));
});