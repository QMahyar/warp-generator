import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import YAML from 'js-yaml';
import {
  generateWireGuardConf,
  generateThroneUri,
  generateSingboxJson,
  generateSingboxLegacyJson,
  generateXrayJson,
  generateClashYaml,
  generateV2raynBase64,
  parseWireGuardConf,
  parseWgUri,
  testHooks
} from '../_worker.js';
const { FORMATS } = testHooks();
import {
  fixtureConfigs,
  resolveAmneziaForAccount,
  ACCOUNT_FIXTURE,
  FIXTURE_ADDRESSES,
  PRIVATE_KEY,
  PEER_PUBLIC_KEY
} from './helpers.mjs';

const N = 5;
const decoder = new TextDecoder();

test('singbox: valid JSON, unique tags, route.final === first tag', async () => {
  const configs = await fixtureConfigs();
  const doc = JSON.parse(generateSingboxJson(configs));
  assert.equal(doc.endpoints.length, N);
  assert.ok(doc.route);
  assert.equal(doc.route.final, doc.endpoints[0].tag);
  const tags = doc.endpoints.map(e => e.tag);
  assert.equal(new Set(tags).size, tags.length, 'endpoint tags must be unique');
  for (const ep of doc.endpoints) {
    assert.equal(ep.type, 'wireguard');
    assert.deepEqual(ep.peers[0].reserved, [1, 2, 3]);
    assert.equal(ep.peers[0].public_key, PEER_PUBLIC_KEY);
  }
});

test('singbox-legacy: valid JSON, unique outbound tags', async () => {
  const configs = await fixtureConfigs();
  const doc = JSON.parse(generateSingboxLegacyJson(configs));
  assert.equal(doc.outbounds.length, N);
  const tags = doc.outbounds.map(o => o.tag);
  assert.equal(new Set(tags).size, tags.length);
});

test('xray: valid JSON, unique outbound tags', async () => {
  const configs = await fixtureConfigs();
  const doc = JSON.parse(generateXrayJson(configs));
  assert.equal(doc.outbounds.length, N);
  const tags = doc.outbounds.map(o => o.tag);
  assert.equal(new Set(tags).size, tags.length);
});

test('clash: YAML round-trips with unique proxy names', async () => {
  const configs = await fixtureConfigs();
  const text = generateClashYaml(configs);
  const doc = YAML.load(text);
  assert.ok(Array.isArray(doc.proxies));
  assert.equal(doc.proxies.length, N);
  const names = doc.proxies.map(p => p.name);
  assert.equal(new Set(names).size, names.length, 'proxy names must be unique');
  for (const proxy of doc.proxies) {
    assert.equal(proxy.type, 'wireguard');
    assert.ok(proxy['private-key'], 'private key present');
    assert.deepEqual(proxy.reserved, [1, 2, 3]);
  }
});

test('clash-amnezia: emits amnezia-wg-option with int junk + string H, skips ranges/zeros', async () => {
  const configs = await fixtureConfigs();
  const text = generateClashYaml(configs, resolveAmneziaForAccount(ACCOUNT_FIXTURE));
  const doc = YAML.load(text);
  const awg = doc.proxies[0]['amnezia-wg-option'];
  assert.ok(awg, 'amnezia block must be present');
  assert.equal(awg.jc, 12);
  assert.equal(awg.jmin, 40);
  assert.equal(awg.jmax, 900);
  assert.equal(awg.s1, 15);
  assert.equal(awg.s2, 20);
  for (const key of ['h1', 'h2', 'h3', 'h4']) {
    assert.equal(awg[key], undefined, `range-string ${key} must be skipped`);
  }

  const plain = YAML.load(generateClashYaml(configs, { Jc: 4, Jmin: 40, Jmax: 70, S1: 15, S2: 30, H1: 1237, H2: 3456, H3: 5280, H4: 8912 }));
  const p = plain.proxies[0]['amnezia-wg-option'];
  assert.deepEqual(p, { jc: 4, jmin: 40, jmax: 70, s1: 15, s2: 30, h1: '1237', h2: '3456', h3: '5280', h4: '8912' });

  const zeros = YAML.load(generateClashYaml(configs, { Jc: 0, Jmin: 0, Jmax: 0, S1: 0, S2: 0, H1: 0, H2: 0, H3: 0, H4: 0 }));
  assert.equal(zeros.proxies[0]['amnezia-wg-option'], undefined, 'all-zero params omit the block');
});

test('v2rayn: base64 decodes to N wireguard:// lines', async () => {
  const configs = await fixtureConfigs();
  const decoded = Buffer.from(generateV2raynBase64(configs), 'base64').toString('utf8');
  const lines = decoded.split('\n').filter(Boolean);
  assert.equal(lines.length, N);
  for (const line of lines) {
    assert.ok(line.startsWith('wireguard://'), `unexpected line: ${line.slice(0, 40)}`);
  }
});

for (const format of ['wireguard-conf', 'wireguard-conf-amnezia']) {
  test(`${format}: ZIP has N .conf members that re-parse cleanly`, async () => {
    const configs = await fixtureConfigs();
    const params = format === 'wireguard-conf-amnezia' ? resolveAmneziaForAccount(ACCOUNT_FIXTURE) : null;
    const zip = unzipSync(generateWireGuardConf(configs, params));
    const names = Object.keys(zip).sort();
    assert.equal(names.length, N);

    let sawAmneziaLine = false;
    for (const name of names) {
      assert.ok(name.endsWith('.conf'), `member not a .conf: ${name}`);
      const content = decoder.decode(zip[name]);
      const parsed = parseWireGuardConf(content);
      assert.equal(parsed.error, undefined, `${name}: ${parsed.error}`);
      const cfg = parsed.config;
      assert.equal(cfg.private_key, PRIVATE_KEY);
      assert.equal(cfg.peer_public_key, PEER_PUBLIC_KEY);
      assert.equal(cfg.mtu, 1280);
      assert.deepEqual(cfg.addresses, FIXTURE_ADDRESSES);
      if (content.includes('Jc =')) sawAmneziaLine = true;
    }

    if (params) {
      assert.ok(sawAmneziaLine, 'amnezia conf must contain Jc line');
      const first = decoder.decode(zip[names[0]]);
      assert.match(first, /^H1 = 100-150$/m, 'range-string H1 must be emitted verbatim');
    } else {
      assert.ok(!sawAmneziaLine, 'vanilla conf must not contain Jc line');
    }
  });
}

test('throne: URIs round-trip through parseWgUri (with reserved normalized)', async () => {
  const configs = await fixtureConfigs();
  const uris = generateThroneUri(configs).split('\n');
  assert.equal(uris.length, N);
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i].replace('reserved=1-2-3', 'reserved=1%2C2%2C3');
    const parsed = parseWgUri(uri);
    assert.equal(parsed.error, undefined, `URI ${i}: ${parsed.error}`);
    assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
    assert.deepEqual(parsed.config.addresses, FIXTURE_ADDRESSES);
    assert.equal(parsed.config.private_key, PRIVATE_KEY);
    assert.equal(parsed.config.peer_public_key, PEER_PUBLIC_KEY);
  }
});

test('throne: dash-separated reserved round-trips through parseWgUri', async () => {
  const configs = await fixtureConfigs();
  const uri = generateThroneUri(configs).split('\n')[0];
  assert.match(uri, /reserved=1-2-3/);
  const parsed = parseWgUri(uri);
  assert.equal(parsed.error, undefined, `round-trip failed: ${parsed.error}`);
  assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
});

test('parseWgUri: out-of-range dash reserved rejected', () => {
  const uri = `wg://engage.cloudflareclient.com:2408?private_key=${PRIVATE_KEY}&public_key=${PEER_PUBLIC_KEY}&local_address=${FIXTURE_ADDRESSES.ipv4}&reserved=1-300-3`;
  const parsed = parseWgUri(uri);
  assert.match(parsed.error, /reserved/);
});

test('throne-amnezia: junk params survive round-trip as overrides', async () => {
  const configs = await fixtureConfigs();
  const params = resolveAmneziaForAccount(ACCOUNT_FIXTURE);
  const uri = generateThroneUri(configs, params).split('\n')[0].replace('reserved=1-2-3', 'reserved=1%2C2%2C3');
  const parsed = parseWgUri(uri);
  assert.equal(parsed.error, undefined);
  assert.ok(parsed.amnezia_overrides);
  assert.equal(parsed.amnezia_overrides.Jc, params.Jc);
  assert.equal(parsed.amnezia_overrides.Jmin, params.Jmin);
  assert.equal(parsed.amnezia_overrides.Jmax, params.Jmax);
});
