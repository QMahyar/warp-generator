import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import YAML from 'js-yaml';
import {
  generateWireGuardConf,
  generateThroneUri,
  generateWireguardUri,
  generateSingboxJson,
  generateSingboxLegacyJson,
  generateXrayJson,
  generateClashYaml,
  generateV2raynBase64,
  testHooks
} from '../_worker.js';
const { FORMATS } = testHooks();
import {
  ACCOUNT_FIXTURE,
  GLOBAL_AMNEZIA,
  PEER_PUBLIC_KEY,
  PRIVATE_KEY,
  fixtureAccount,
  fixtureConfigs,
  resolveAmneziaForAccount
} from './helpers.mjs';

const GENERATORS = {
  'wireguard-conf': (c) => generateWireGuardConf(c),
  'wireguard-conf-amnezia': (c) => generateWireGuardConf(c, resolveAmneziaForAccount(ACCOUNT_FIXTURE)),
  'throne': (c) => generateThroneUri(c),
  'throne-amnezia': (c) => generateThroneUri(c, resolveAmneziaForAccount(ACCOUNT_FIXTURE)),
  'wireguard-uri': (c) => generateWireguardUri(c),
  'singbox': (c) => generateSingboxJson(c),
  'singbox-legacy': (c) => generateSingboxLegacyJson(c),
  'xray': (c) => generateXrayJson(c),
  'clash': (c) => generateClashYaml(c),
  'v2rayn': (c) => generateV2raynBase64(c)
};

const decoder = new TextDecoder();

async function accountVariants() {
  const singlePreset = [{ id: 'single', name: 'Single', endpoints: [{ ip: '162.159.192.1', port: 2408 }] }];
  return {
    single: await fixtureConfigs(fixtureAccountWithEndpoints('single'), singlePreset),
    unicode: await fixtureConfigs(fixtureAccount({ name: '\u062e\u0627\u0646\u0647 \u0634\u0628\u06a9\u0647 \uD83C\uDF10' })),
    long100: await fixtureConfigs(fixtureAccount({ name: 'A'.repeat(100) })),
    ipv4only: await fixtureConfigs(fixtureAccount({ config: { ...ACCOUNT_FIXTURE.config, addresses: { ipv4: '10.2.0.2/32', ipv6: '' } } })),
    ipv6only: await fixtureConfigs(fixtureAccount({ config: { ...ACCOUNT_FIXTURE.config, addresses: { ipv4: '', ipv6: 'fd00::1/128' } } })),
    zeroReserved: await fixtureConfigs(fixtureAccount({ config: { ...ACCOUNT_FIXTURE.config, reserved: [0, 0, 0] } }))
  };
}

function fixtureAccountWithEndpoints(presetId) {
  return fixtureAccount({ endpoint_list: { type: 'preset', preset_id: presetId } });
}

test('edge matrix: all generators survive every account shape', async () => {
  const variants = await accountVariants();
  for (const [label, configs] of Object.entries(variants)) {
    for (const [format, gen] of Object.entries(GENERATORS)) {
      const out = gen(configs);
      assert.ok(out !== undefined && out !== null && String(out).length > 0, `${label}/${format} produced empty output`);
    }
  }
});

test('edge: single config tags have no ip suffix and route.final matches', async () => {
  const singlePreset = [{ id: 'single', name: 'Single', endpoints: [{ ip: 'engage.cloudflareclient.com', port: 2408 }] }];
  const single = await fixtureConfigs(fixtureAccountWithEndpoints('single'), singlePreset);
  const doc = JSON.parse(generateSingboxJson(single));
  assert.equal(doc.endpoints.length, 1);
  assert.equal(doc.endpoints[0].tag, ACCOUNT_FIXTURE.name);
  assert.equal(doc.route.final, doc.endpoints[0].tag);

  const clash = YAML.load(generateClashYaml(single));
  assert.equal(clash.proxies[0].name, ACCOUNT_FIXTURE.name);
});

test('edge: unicode name survives YAML round-trip and conf zip naming', async () => {
  const unicode = await fixtureConfigs(fixtureAccount({ name: '\u062e\u0627\u0646\u0647 ISP' }));
  const clash = YAML.load(generateClashYaml(unicode));
  assert.match(clash.proxies[0].name, /ISP/);

  const members = unzipSync(generateWireGuardConf(unicode));
  const names = Object.keys(members);
  assert.equal(names.length, unicode.length);
  for (const name of names) {
    assert.doesNotMatch(name, /[^\x20-\x7e.-]/, `filename not ASCII-safe: ${name}`);
  }
});

test('edge: 100-char name kept intact in URI fragment and singbox tag', async () => {
  const long = await fixtureConfigs(fixtureAccount({ name: 'A'.repeat(100) }));
  const uri = generateThroneUri(long).split('\n')[0];
  assert.ok(uri.endsWith(`#${'A'.repeat(100)}`));

  const legacy = JSON.parse(generateSingboxLegacyJson(long));
  assert.ok(legacy.outbounds[0].tag.startsWith('A'));
});

test('edge: IPv4-only account emits only v4 address everywhere', async () => {
  const ipv4only = await fixtureConfigs(fixtureAccount({
    config: { ...ACCOUNT_FIXTURE.config, addresses: { ipv4: '10.2.0.2/32', ipv6: '' } }
  }));
  const doc = JSON.parse(generateSingboxJson(ipv4only));
  assert.deepEqual(doc.endpoints[0].address, ['10.2.0.2/32']);

  const members = unzipSync(generateWireGuardConf(ipv4only));
  const text = decoder.decode(members[Object.keys(members)[0]]);
  assert.match(text, /^Address = 10\.2\.0\.2\/32$/m);
  assert.ok(!text.includes('fd00'), 'no ipv6 leak in conf Address');

  const throne = generateThroneUri(ipv4only).split('\n')[0];
  assert.ok(!throne.includes('fd00'), 'no ipv6 leak in throne local_address');
});

test('edge: IPv6-only account emits only v6 address everywhere', async () => {
  const ipv6only = await fixtureConfigs(fixtureAccount({
    config: { ...ACCOUNT_FIXTURE.config, addresses: { ipv4: '', ipv6: 'fd00::1/128' } }
  }));
  const doc = JSON.parse(generateSingboxJson(ipv6only));
  assert.deepEqual(doc.endpoints[0].address, ['fd00::1/128']);

  const clash = YAML.load(generateClashYaml(ipv6only));
  assert.equal(clash.proxies[0].ip, undefined);
  assert.equal(clash.proxies[0].ipv6, 'fd00::1');

  const members = unzipSync(generateWireGuardConf(ipv6only));
  const text = decoder.decode(members[Object.keys(members)[0]]);
  assert.match(text, /^Address = fd00::1\/128$/m);
});

test('edge: zero reserved omits conf comment but keeps explicit zeros elsewhere', async () => {
  const zero = await fixtureConfigs(fixtureAccount({
    config: { ...ACCOUNT_FIXTURE.config, reserved: [0, 0, 0] }
  }));
  const members = unzipSync(generateWireGuardConf(zero));
  const text = decoder.decode(members[Object.keys(members)[0]]);
  assert.ok(!text.includes('# Reserved'));

  const throne = generateThroneUri(zero).split('\n')[0];
  assert.match(throne, /reserved=0-0-0/);

  const wireguardUri = generateWireguardUri(zero).split('\n')[0];
  assert.match(wireguardUri, /reserved=0%2C0%2C0/);

  const clash = YAML.load(generateClashYaml(zero));
  assert.deepEqual(clash.proxies[0].reserved, [0, 0, 0]);
});

test('edge: amnezia range strings emitted verbatim in conf, skipped by throne junk params', async () => {
  const amz = {
    Jc: 12, Jmin: 40, Jmax: 900, S1: 15, S2: 20,
    H1: '100-150', H2: '200-250', H3: '300-350', H4: '400-450'
  };
  const configs = await fixtureConfigs();
  const confZip = unzipSync(generateWireGuardConf(configs, amz));
  const first = decoder.decode(confZip[Object.keys(confZip).sort()[0]]);
  assert.match(first, /^Jc = 12$/m);
  assert.match(first, /^H1 = 100-150$/m);
  assert.match(first, /^H4 = 400-450$/m);

  const throne = generateThroneUri(configs, amz).split('\n')[0];
  assert.match(throne, /enable_amnezia=true/);
  assert.match(throne, /jc=12/);
  assert.match(throne, /jmin=40&jmax=900/);
  assert.ok(!throne.includes('s1='), 'S1 must not leak into throne wg:// URIs');
  assert.ok(!throne.includes('h1='), 'H params must not leak into throne wg:// URIs');
});

test('edge: global-only amnezia still produces full conf block', async () => {
  const configs = await fixtureConfigs();
  const plainAccount = fixtureAccount({ amnezia_overrides: null });
  const merged = resolveAmneziaForAccount(plainAccount);
  const confZip = unzipSync(generateWireGuardConf(configs, merged));
  const names = Object.keys(confZip).sort();
  const text = decoder.decode(confZip[names[0]]);
  assert.match(text, /^Jc = 9$/m);
  assert.match(text, /^H1 = 100$/m);
});

test('edge: fixture keys are valid base64 of expected size', () => {
  assert.equal(Buffer.from(PRIVATE_KEY, 'base64').length, 32);
  assert.equal(Buffer.from(PEER_PUBLIC_KEY, 'base64').length, 32);
});
