import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import {
  generateWireGuardConf,
  generateWireguardUri,
  generateSingboxJson,
  generateSingboxLegacyJson,
  validateAmneziaValues,
  validateAmneziaSettings
} from '../_worker.js';
import { PRIVATE_KEY, PEER_PUBLIC_KEY } from './helpers.mjs';

const decoder = new TextDecoder();

const BASE = {
  Jc: 4, Jmin: 40, Jmax: 70, S1: 15, S2: 30, H1: 1237, H2: 3456, H3: 5280, H4: 8912
};

const SINGLE_CFG = [{
  name: 'Solo',
  endpoint: 'engage.cloudflareclient.com:2408',
  ip: 'engage.cloudflareclient.com',
  port: 2408,
  private_key: PRIVATE_KEY,
  peer_public_key: PEER_PUBLIC_KEY,
  addresses: { ipv4: '10.2.0.2/32', ipv6: '' },
  addressList: ['10.2.0.2/32'],
  addressCidr: ['10.2.0.2/32'],
  dns: '1.1.1.1',
  mtu: 1280,
  reserved: [0, 0, 0],
  allowedIps: ['0.0.0.0/0', '::/0']
}];

function firstConf(zipBytes) {
  const members = unzipSync(new Uint8Array(zipBytes));
  return decoder.decode(members[Object.keys(members).sort()[0]]);
}

test('validateAmneziaValues: legacy 9-field objects still valid (S3/S4/I1 optional)', () => {
  assert.equal(validateAmneziaValues(BASE), null);
});

test('validateAmneziaValues: S3/S4 accepted and range-checked when present', () => {
  assert.equal(validateAmneziaValues({ ...BASE, S3: 0, S4: 255 }), null);
  assert.equal(validateAmneziaValues({ ...BASE, S3: '25', S4: '30' }), null);
  assert.match(validateAmneziaValues({ ...BASE, S3: -1 }), /^S3 must be a whole number 0-255$/);
  assert.match(validateAmneziaValues({ ...BASE, S3: 256 }), /S3/);
  assert.match(validateAmneziaValues({ ...BASE, S4: '5-10' }), /S4 must be a whole number/);
});

test('validateAmneziaValues: I1 accepts <r N>/<b 0x..> or empty, rejects other shapes', () => {
  assert.equal(validateAmneziaValues({ ...BASE, I1: '<r 128>' }), null);
  assert.equal(validateAmneziaValues({ ...BASE, I1: '<b 0x0A1b>' }), null);
  assert.equal(validateAmneziaValues({ ...BASE, I1: '' }), null);
  assert.match(validateAmneziaValues({ ...BASE, I1: '<r -1>' }), /I1/);
  assert.match(validateAmneziaValues({ ...BASE, I1: 'r 128' }), /I1/);
  assert.match(validateAmneziaValues({ ...BASE, I1: '<x 1>' }), /I1/);
  assert.match(validateAmneziaValues({ ...BASE, I1: '<r abc>' }), /I1/);
  assert.match(validateAmneziaValues({ ...BASE, I1: 42 }), /I1/);
});

test('validateAmneziaSettings: S3/S4/I1 validated at API boundary', () => {
  assert.equal(validateAmneziaSettings({ ...BASE, S3: 25, S4: 30, I1: '<r 64>' }), null);
  assert.equal(validateAmneziaSettings(BASE), null);
  assert.match(validateAmneziaSettings({ ...BASE, S3: 256 }), /S3 must be 0-255/);
  assert.match(validateAmneziaSettings({ ...BASE, S4: 300 }), /S4 must be 0-255/);
  assert.match(validateAmneziaSettings({ ...BASE, S3: '1-9' }), /S3/);
  assert.match(validateAmneziaSettings({ ...BASE, I1: 'garbage' }), /I1/);
  assert.equal(validateAmneziaSettings({ ...BASE, I1: '<b 0xff>' }), null);
});

test('wireguard-conf-amnezia: emits S3/S4 iff non-zero and I1 iff valid notation', () => {
  const zip = generateWireGuardConf(SINGLE_CFG, { ...BASE, S3: 25, S4: 30, I1: '<r 128>' });
  const text = firstConf(zip);
  assert.match(text, /^S3 = 25$/m);
  assert.match(text, /^S4 = 30$/m);
  assert.match(text, /^I1 = <r 128>$/m);
});

test('wireguard-conf-amnezia: zero S3/S4 and empty/invalid I1 stay omitted', () => {
  const zeros = firstConf(generateWireGuardConf(SINGLE_CFG, BASE));
  assert.ok(!/^S3 = /m.test(zeros), 'zero S3 omitted');
  assert.ok(!/^S4 = /m.test(zeros), 'zero S4 omitted');
  assert.ok(!/^I1 = /m.test(zeros), 'empty I1 omitted');

  const invalid = firstConf(generateWireGuardConf(SINGLE_CFG, { ...BASE, S3: 25, S4: 30, I1: 'not-junk' }));
  assert.match(invalid, /^S3 = 25$/m);
  assert.ok(!/^I1 = /m.test(invalid), 'invalid I1 omitted');

  const i1only = firstConf(generateWireGuardConf(SINGLE_CFG, { ...BASE, Jc: 0, Jmin: 0, Jmax: 0, S1: 0, S2: 0, H1: 0, H2: 0, H3: 0, H4: 0, I1: '<b 0xdead>' }));
  assert.match(i1only, /^I1 = <b 0xdead>$/m);
});

test('singbox-amnezia: endpoint schema injects amnezia_wg with junk params + i1', () => {
  const doc = JSON.parse(generateSingboxJson(SINGLE_CFG, { ...BASE, S3: 25, S4: 30, I1: '<r 128>' }));
  assert.deepEqual(doc.endpoints[0].amnezia_wg, {
    jc: 4, jmin: 40, jmax: 70, s1: 15, s2: 30, s3: 25, s4: 30,
    h1: 1237, h2: 3456, h3: 5280, h4: 8912, i1: '<r 128>'
  });
});

test('singbox-amnezia: omits zero/range params and skips block entirely when nothing set', () => {
  const partial = JSON.parse(generateSingboxJson(SINGLE_CFG, { ...BASE, H1: '100-150', S3: 0, I1: 'nope' }));
  assert.equal(partial.endpoints[0].amnezia_wg.h1, undefined, 'range-string H1 skipped');
  assert.equal(partial.endpoints[0].amnezia_wg.s3, undefined, 'zero S3 skipped');
  assert.equal(partial.endpoints[0].amnezia_wg.i1, undefined, 'invalid I1 skipped');
  assert.equal(partial.endpoints[0].amnezia_wg.jc, 4);

  const none = JSON.parse(generateSingboxJson(SINGLE_CFG));
  assert.equal(none.endpoints[0].amnezia_wg, undefined);

  const allZero = JSON.parse(generateSingboxJson(SINGLE_CFG, { Jc: 0, Jmin: 0, Jmax: 0, S1: 0, S2: 0, S3: 0, S4: 0, H1: 0, H2: 0, H3: 0, H4: 0 }));
  assert.equal(allZero.endpoints[0].amnezia_wg, undefined);
});

test('singbox-legacy-amnezia: outbound schema injects amnezia_wg the same way', () => {
  const doc = JSON.parse(generateSingboxLegacyJson(SINGLE_CFG, { ...BASE, S3: 7, S4: 8 }));
  assert.deepEqual(doc.outbounds[0].amnezia_wg, {
    jc: 4, jmin: 40, jmax: 70, s1: 15, s2: 30, s3: 7, s4: 8,
    h1: 1237, h2: 3456, h3: 5280, h4: 8912
  });
  const plain = JSON.parse(generateSingboxLegacyJson(SINGLE_CFG));
  assert.equal(plain.outbounds[0].amnezia_wg, undefined);
});

test('wireguard:// URI carries presharedkey only when pre_shared_key is truthy', () => {
  const psk = '31aIhAPwktDGpH4JDhA8GNvjFXEf/a6+UaQRyOAiyfM=';
  const withPsk = generateWireguardUri([{ ...SINGLE_CFG[0], pre_shared_key: psk }]);
  assert.ok(withPsk.endsWith(`&presharedkey=${encodeURIComponent(psk)}#Solo`), `unexpected URI: ${withPsk}`);

  const emptyPsk = generateWireguardUri([{ ...SINGLE_CFG[0], pre_shared_key: '' }]);
  assert.ok(!emptyPsk.includes('presharedkey'), 'empty psk (WARP) stays omitted');

  const noPsk = generateWireguardUri(SINGLE_CFG);
  assert.ok(!noPsk.includes('presharedkey'), 'missing psk key stays omitted');
});
