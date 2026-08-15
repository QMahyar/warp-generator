/**
 * Ticket 05 — /sub/clash — raw Clash YAML (worker/sub.js renderClash).
 *
 * Seam tests (external behaviour): given an account record, a parsed
 * endpoint list and the stored AWG record, the payload is a raw YAML
 * document (never base64) with one `type: wireguard` proxy per valid
 * endpoint, minimal proxy-groups/rules, and `amnezia-wg-option` exactly
 * when AWG is enabled. The YAML is parsed with the tiny indentation-based
 * subset parser at the bottom of this file (map/seq/scalar + flow arrays —
 * no dependencies), per the ticket's testing decision.
 *
 * Fixtures are the same throwaway records ticket 04 generated (regenerated
 * here — sub.test.js keeps its own copies; they are not imported because
 * importing a test file would execute its suite inside this process).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_AWG } from './settings.js';
import {
  DEFAULT_ENDPOINTS,
  SubscriptionError,
  WARP_PUB,
  buildAmneziaWgOption,
  buildClashProxy,
  renderSubscription,
} from './sub.js';

// ---- fixtures (throwaway, identical to ticket 04's — never real keys) ----

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

/** AWG record shape settings.js stores — params carried on + some empty. */
const AWG_FULL = {
  enabled: true,
  Jc: '4', Jmin: '40', Jmax: '70',
  S1: '0', S2: '0', S3: '22', S4: '7',
  H1: '1', H2: '2', H3: '3', H4: '4',
  I1: 'I1 = <b 0x61>', I2: 'I2 = <b 0x62> <s 0x63>', I3: '', I4: '', I5: '',
};

/** Enabled with only the legacy defaults → S3/S4 and I1–I5 empty. */
const AWG_DEFAULTS = { enabled: true, ...DEFAULT_AWG };

/** Golden full document for ACCOUNT_A × one v4 endpoint, AWG off. */
const GOLDEN_YAML = [
  'proxies:',
  '  - name: "warp-162.159.192.1:2408"',
  '    type: wireguard',
  '    server: "162.159.192.1"',
  '    port: 2408',
  '    ip: "172.16.0.2"',
  '    ipv6: "2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8"',
  `    private-key: "${ACCOUNT_A.privateKey}"`,
  `    public-key: "${WARP_PUB}"`,
  '    reserved: [83,128,39]',
  '    udp: true',
  '    mtu: 1280',
  '    remote-dns-resolve: true',
  '    dns: [1.1.1.1]',
  'proxy-groups:',
  '  - name: "PROXY"',
  '    type: select',
  '    proxies:',
  '      - "warp-162.159.192.1:2408"',
  'rules:',
  '  - MATCH,PROXY',
  '',
].join('\n');

// ---- tiny YAML subset parser (indentation-based; this test file only) ----
// Supports exactly what renderClash emits: maps (`key:` / `key: value`),
// sequences (`- item`), inline map starts (`- name: "x"` with continuation
// lines at +2), quoted/flow-array/scalar values. No deps.

function scalar(raw) {
  const s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map((p) => scalar(p));
  if (/^\d+$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

function parseYaml(text) {
  const lines = text.split('\n')
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))
    .map((l) => { const m = l.match(/^(\s*)(.*)$/); return { indent: m[1].length, text: m[2] }; });
  let pos = 0;

  function parseBlock(indent) {
    if (lines[pos].indent !== indent) throw new Error(`block must start at indent ${indent}`);
    return lines[pos].text.startsWith('- ') ? parseSeq(indent) : parseMap(indent);
  }

  function parseSeq(indent) {
    const items = [];
    while (pos < lines.length) {
      const t = lines[pos];
      if (t.indent < indent) break;
      if (t.indent !== indent || !t.text.startsWith('- ')) throw new Error(`expected seq item: ${JSON.stringify(t.text)}`);
      const rest = t.text.slice(2);
      const inline = rest.match(/^([A-Za-z0-9-]+):(?:\s+(.*))?$/);
      if (inline) {
        const entry = { name: inline[1], value: inline[2] !== undefined ? scalar(inline[2]) : null };
        pos++;
        if (pos < lines.length && lines[pos].indent > indent) {
          const sub = parseMap(indent + 2);
          items.push({ ...sub, [entry.name]: entry.value });
        } else {
          items.push({ [entry.name]: entry.value });
        }
      } else {
        items.push(scalar(rest));
        pos++;
      }
    }
    return items;
  }

  function parseMap(indent) {
    const node = {};
    while (pos < lines.length) {
      const t = lines[pos];
      if (t.indent < indent) break;
      if (t.indent !== indent) throw new Error(`bad map indent ${t.indent} vs ${indent}: ${JSON.stringify(t.text)}`);
      const m = t.text.match(/^([A-Za-z0-9-]+):(?:\s+(.*))?$/);
      if (!m) throw new Error(`not a map entry: ${JSON.stringify(t.text)}`);
      pos++;
      if (m[2] !== undefined) {
        node[m[1]] = scalar(m[2]);
      } else if (pos < lines.length && lines[pos].indent > indent) {
        node[m[1]] = parseBlock(lines[pos].indent);
      } else {
        node[m[1]] = null;
      }
    }
    return node;
  }

  return parseBlock(0);
}

function renderClash(data) {
  return renderSubscription('clash', {}, data);
}

// ---- document structure ----

test('clash: raw YAML document (never base64) with proxies/proxy-groups/rules', () => {
  const { body, contentType } = renderClash({ account: ACCOUNT_A, endpoints: [ENDPOINTS[0]], awg: null });
  assert.equal(contentType, 'text/plain; charset=utf-8');
  assert.ok(body.startsWith('proxies:\n'), 'starts with the proxies: key');
  assert.ok(!body.includes('base64') && !body.includes('=='), 'not base64');
  const doc = parseYaml(body);
  assert.deepEqual(Object.keys(doc), ['proxies', 'proxy-groups', 'rules']);
  assert.equal(doc.proxies.length, 1);
  assert.equal(doc['proxy-groups'].length, 1);
  assert.deepEqual(doc.rules, ['MATCH,PROXY']);
});

test('clash: golden byte-identical document for one v4 endpoint (AWG off)', () => {
  const { body } = renderClash({ account: ACCOUNT_A, endpoints: [ENDPOINTS[0]], awg: null });
  assert.equal(body, GOLDEN_YAML);
});

test('clash: one proxy per valid endpoint, in the stored order, names warp-<host>:<port>', () => {
  const { body } = renderClash({ account: ACCOUNT_A, endpoints: ENDPOINTS, awg: null });
  const doc = parseYaml(body);
  assert.deepEqual(doc.proxies.map((p) => p.name), [
    'warp-162.159.192.1:2408',
    'warp-[2606:4700:4700::1111]:2408', // IPv6 re-bracketed in the name
    'warp-engage.cloudflareclient.com:51820', // custom port
  ]);
  // the select group lists exactly the same names
  const group = doc['proxy-groups'][0];
  assert.equal(group.name, 'PROXY');
  assert.equal(group.type, 'select');
  assert.deepEqual(group.proxies, [
    'warp-162.159.192.1:2408',
    'warp-[2606:4700:4700::1111]:2408',
    'warp-engage.cloudflareclient.com:51820',
  ]);
});

test('clash: every proxy carries the §2.4 required fields with record values', () => {
  const doc = parseYaml(renderClash({ account: ACCOUNT_A, endpoints: ENDPOINTS, awg: null }).body);
  for (const p of doc.proxies) {
    assert.equal(p.type, 'wireguard');
    assert.equal(p['private-key'], ACCOUNT_A.privateKey);
    assert.equal(p['public-key'], ACCOUNT_A.peerPublicKey);
    assert.equal(p.ip, ACCOUNT_A.v4);
    assert.equal(p.udp, true);
    assert.equal(p.mtu, 1280);
    assert.equal(p['remote-dns-resolve'], true);
    assert.deepEqual(p.dns, ['1.1.1.1']);
  }
  assert.deepEqual(doc.proxies.map((p) => p.server), ['162.159.192.1', '2606:4700:4700::1111', 'engage.cloudflareclient.com']);
  assert.deepEqual(doc.proxies.map((p) => p.port), [2408, 2408, 51820]);
});

test('clash: reserved renders as [a,b,c] bytes of the record reserved', () => {
  const dA = parseYaml(renderClash({ account: ACCOUNT_A, endpoints: [ENDPOINTS[0]], awg: null }).body);
  assert.deepEqual(dA.proxies[0].reserved, [83, 128, 39]); // 'U4An'
  const dB = parseYaml(renderClash({ account: ACCOUNT_B, endpoints: [ENDPOINTS[0]], awg: null }).body);
  assert.deepEqual(dB.proxies[0].reserved, [0, 0, 0]); // empty reserved
});

test('clash: ipv6 line present only when the account record has v6', () => {
  const dA = parseYaml(renderClash({ account: ACCOUNT_A, endpoints: [ENDPOINTS[0]], awg: null }).body);
  assert.equal(dA.proxies[0].ipv6, ACCOUNT_A.v6);
  const dB = parseYaml(renderClash({ account: ACCOUNT_B, endpoints: [ENDPOINTS[0]], awg: null }).body);
  assert.ok(!('ipv6' in dB.proxies[0]), 'no ipv6 key when the record has none');
});

// ---- amnezia-wg-option ----

test('clash: amnezia-wg-option absent when AWG is off, unset, or record disabled', () => {
  for (const awg of [null, undefined, { enabled: false, ...DEFAULT_AWG }, {}]) {
    const doc = parseYaml(renderClash({ account: ACCOUNT_A, endpoints: ENDPOINTS, awg }).body);
    for (const p of doc.proxies) {
      assert.ok(!('amnezia-wg-option' in p), `no option for awg=${JSON.stringify(awg)}`);
      assert.ok(!bodyHas('amnezia-wg-option', renderClash({ account: ACCOUNT_A, endpoints: ENDPOINTS, awg }).body));
    }
  }
});

function bodyHas(needle, body) { return body.includes(needle); }

test('clash: amnezia-wg-option maps Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5 onto mihomo keys', () => {
  const doc = parseYaml(renderClash({ account: ACCOUNT_A, endpoints: ENDPOINTS, awg: AWG_FULL }).body);
  for (const p of doc.proxies) {
    assert.deepEqual(p['amnezia-wg-option'], {
      jc: 4, jmin: 40, jmax: 70,
      s1: 0, s2: 0, s3: 22, s4: 7,
      h1: '1', h2: '2', h3: '3', h4: '4',
      i1: '<b 0x61>', i2: '<b 0x62> <s 0x63>',
    });
  }
});

test('clash: amnezia-wg-option omits empty fields (defaults record → no S3/S4/I*)', () => {
  const doc = parseYaml(renderClash({ account: ACCOUNT_A, endpoints: [ENDPOINTS[0]], awg: AWG_DEFAULTS }).body);
  const opt = doc.proxies[0]['amnezia-wg-option'];
  assert.deepEqual(Object.keys(opt), ['jc', 'jmin', 'jmax', 's1', 's2', 'h1', 'h2', 'h3', 'h4']);
  assert.equal(opt.jc, 4);
  assert.equal(opt.h1, '1');
});

test('clash: i-values carry the bare CPS chain (settings stores "I<n> = <b 0x…>")', () => {
  assert.deepEqual(buildAmneziaWgOption(AWG_FULL), [
    '      jc: 4',
    '      jmin: 40',
    '      jmax: 70',
    '      s1: 0',
    '      s2: 0',
    '      s3: 22',
    '      s4: 7',
    '      h1: "1"',
    '      h2: "2"',
    '      h3: "3"',
    '      h4: "4"',
    '      i1: "<b 0x61>"',
    '      i2: "<b 0x62> <s 0x63>"',
  ]);
  assert.equal(buildAmneziaWgOption(null), null);
  assert.equal(buildAmneziaWgOption({ enabled: false }), null);
  assert.equal(buildAmneziaWgOption({ enabled: true, Jc: '', Jmin: '', Jmax: '', S1: '', S2: '', S3: '', S4: '', H1: '', H2: '', H3: '', H4: '', I1: '', I2: '', I3: '', I4: '', I5: '' }), null);
});

// ---- endpoint semantics (identical to ticket 04, exercised here for clash) ----

test('clash: malformed endpoint entries are skipped — the renderer never errors', () => {
  const junk = [null, { host: '', port: 2408 }, { host: 'x', port: 0 }, '162.159.192.1:2408'];
  const { body } = renderClash({ account: ACCOUNT_A, endpoints: [...junk, ENDPOINTS[0], ...junk], awg: null });
  const doc = parseYaml(body);
  assert.equal(doc.proxies.length, 1);
  assert.equal(doc.proxies[0].name, 'warp-162.159.192.1:2408');
  assert.deepEqual(doc['proxy-groups'][0].proxies, ['warp-162.159.192.1:2408']);
});

test('clash: empty / null / all-malformed endpoint lists fall back to the default pair', () => {
  for (const endpoints of [[], null, undefined, [{ host: 'bad', port: 99999 }, { host: '', port: 1 }]]) {
    const doc = parseYaml(renderClash({ account: ACCOUNT_A, endpoints, awg: null }).body);
    assert.deepEqual(doc.proxies.map((p) => p.name), DEFAULT_ENDPOINTS.map((e) => `warp-${e.host}:${e.port}`));
    assert.deepEqual(doc.proxies.map((p) => p.server), ['162.159.192.1', 'engage.cloudflareclient.com']);
    assert.deepEqual(doc.proxies.map((p) => p.port), [2408, 2408]);
  }
});

// ---- seam guards ----

test('clash: missing account throws a readable SubscriptionError', () => {
  assert.throws(() => renderClash({ endpoints: ENDPOINTS }), SubscriptionError);
  assert.throws(() => renderClash({ account: null, endpoints: ENDPOINTS }), /register one in the panel/i);
});

test('clash: buildClashProxy composes the amnezia-wg-option block inline', () => {
  const proxy = buildClashProxy(ACCOUNT_A, ENDPOINTS[0], AWG_FULL);
  assert.ok(proxy.includes('    amnezia-wg-option:\n      jc: 4'), 'option block nested under the proxy');
  assert.ok(!buildClashProxy(ACCOUNT_A, ENDPOINTS[0], null).includes('amnezia-wg-option'));
});