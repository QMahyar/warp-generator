import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWireGuardConf,
  parseWgUri,
  isValidIpv6Part,
  validateName,
  validateIPv4OrIPv6OrDomain,
  validatePort,
  validateAmneziaSettings,
  validateEndpointList,
  sanitizeFilename,
  resolveAmnezia,
  expandEndpoints
} from '../_worker.js';
import {
  ACCOUNT_FIXTURE,
  FIXTURE_ADDRESSES,
  FIXTURE_ENDPOINTS,
  FIXTURE_PRESET,
  PEER_PUBLIC_KEY,
  PRIVATE_KEY,
  fixtureEnv,
  deepEqual
} from './helpers.mjs';

const VALID_CONF = [
  '[Interface]',
  `PrivateKey = ${PRIVATE_KEY}`,
  'Address = 10.2.0.2/32, fd00:60ca:98fa:c88b:1234:5678:90ab:cdef/128',
  'DNS = 1.1.1.1',
  'MTU = 1280',
  '',
  '[Peer]',
  `PublicKey = ${PEER_PUBLIC_KEY}`,
  'AllowedIPs = 0.0.0.0/0, ::/0',
  'Endpoint = engage.cloudflareclient.com:2408',
  'PersistentKeepalive = 25',
  'Reserved = 1, 2, 3'
].join('\n');

test('parseWireGuardConf: happy path', () => {
  const parsed = parseWireGuardConf(VALID_CONF);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.config.private_key, PRIVATE_KEY);
  assert.deepEqual(parsed.config.addresses, FIXTURE_ADDRESSES);
  assert.equal(parsed.config.peer_public_key, PEER_PUBLIC_KEY);
  assert.equal(parsed.config.mtu, 1280);
  assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
  assert.equal(parsed.amnezia_overrides, null);
});

test('parseWireGuardConf: derives public key from private key', () => {
  const parsed = parseWireGuardConf(VALID_CONF);
  assert.ok(parsed.config.public_key);
  assert.match(parsed.config.public_key, /^[A-Za-z0-9+/]+={0,2}$/);
});

test('parseWireGuardConf: tolerates comments, blanks, and unknown sections', () => {
  const junky = `# top comment\n; ini comment\n\n${VALID_CONF}\n\n[Extra]\nFoo = bar\nrandom line\n`;
  const parsed = parseWireGuardConf(junky);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
});

test('parseWireGuardConf: amnezia keys become overrides (range strings kept)', () => {
  const conf = VALID_CONF.replace(
    '\n\n[Peer]',
    '\nJc = 7\nJmin = 40\nJmax = 900\nH1 = 100-150\n\n[Peer]'
  );
  const parsed = parseWireGuardConf(conf);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.amnezia_overrides, {
    Jc: 7, Jmin: 40, Jmax: 900, H1: '100-150'
  });
});

test('parseWireGuardConf: missing fields rejected', () => {
  const noPrivKey = [
    '[Interface]',
    'Address = 10.2.0.2/32, fd00:60ca:98fa:c88b:1234:5678:90ab:cdef/128',
    'DNS = 1.1.1.1',
    '',
    '[Peer]',
    `PublicKey = ${PEER_PUBLIC_KEY}`,
    'AllowedIPs = 0.0.0.0/0, ::/0'
  ].join('\n');
  assert.match(parseWireGuardConf(noPrivKey).error, /PrivateKey/);
  const noIface = ['[Peer]', `PublicKey = ${PEER_PUBLIC_KEY}`].join('\n');
  assert.match(parseWireGuardConf(noIface.padEnd(120, 'x')).error, /\[Interface\]/);
  const noAddr = `[Interface]\nPrivateKey = ${PRIVATE_KEY}\n\n[Peer]\nPublicKey = ${PEER_PUBLIC_KEY}`;
  assert.match(parseWireGuardConf(noAddr).error, /Address/);
  const noPeer = `[Interface]\nPrivateKey = ${PRIVATE_KEY}\nAddress = 10.0.0.1/32\nDNS = 1.1.1.1\nMTU = 1280\n`;
  assert.match(parseWireGuardConf(noPeer).error, /\[Peer\]/);
});

test('parseWireGuardConf: invalid keys and sections rejected', () => {
  const badKey = VALID_CONF.replace('DNS = 1.1.1.1', 'FwMark = 1234');
  assert.match(parseWireGuardConf(badKey).error, /unknown key "FwMark" in \[Interface\]/);

  const dupIface = `${VALID_CONF}\n[Interface]\nPrivateKey = ${PRIVATE_KEY}`;
  assert.match(parseWireGuardConf(dupIface).error, /duplicate \[Interface\]/);
});

test('parseWireGuardConf: duplicate [Peer] silently skipped (first wins)', () => {
  const dupPeer = `${VALID_CONF}\n\n[Peer]\nPublicKey = ${PEER_PUBLIC_KEY}`;
  const parsed = parseWireGuardConf(dupPeer);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
});

test('parseWireGuardConf: bad keys and sizes rejected', () => {
  assert.match(
    parseWireGuardConf(VALID_CONF.replace(PRIVATE_KEY, 'not-base64!!')).error,
    /PrivateKey/
  );
  const shortKey = Buffer.alloc(16).toString('base64');
  assert.match(
    parseWireGuardConf(VALID_CONF.replace(PRIVATE_KEY, shortKey)).error,
    /32 bytes/
  );
  assert.match(parseWireGuardConf(VALID_CONF.replace('Reserved = 1, 2, 3', 'Reserved = 1,2')).error, /3 bytes/);
});

test('parseWireGuardConf: size guards and ClientId decoding', () => {
  assert.match(parseWireGuardConf('short').error, /too short/);
  assert.match(parseWireGuardConf('x'.repeat(10241)).error, /too large/);
  assert.match(parseWireGuardConf(null).error, /not a string/);

  const clientId = Buffer.from([7, 8, 9]).toString('base64');
  const conf = VALID_CONF.replace('Reserved = 1, 2, 3', `ClientId = ${clientId}`);
  const parsed = parseWireGuardConf(conf);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.config.reserved, [7, 8, 9]);
});

function wgUri(extra = '') {
  return `wg://engage.cloudflareclient.com:2408?private_key=${PRIVATE_KEY}&public_key=${PEER_PUBLIC_KEY}&local_address=${FIXTURE_ADDRESSES.ipv4}-${FIXTURE_ADDRESSES.ipv6}&mtu=1280${extra}&reserved=1,2,3#Home`;
}

test('parseWgUri: vanilla happy path', () => {
  const parsed = parseWgUri(wgUri());
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.config.private_key, PRIVATE_KEY);
  assert.deepEqual(parsed.config.addresses, FIXTURE_ADDRESSES);
  assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
  assert.equal(parsed.amnezia_overrides, null);
});

test('parseWgUri: amnezia params require enable flag and map to overrides', () => {
  const withParams = parseWgUri(wgUri('&enable_amnezia=true&jc=5&jmin=50&jmax=1000&s1=0'));
  assert.equal(withParams.error, undefined);
  assert.deepEqual(withParams.amnezia_overrides, { Jc: 5, Jmin: 50, Jmax: 1000, S1: 0 });

  const noFlag = parseWgUri(wgUri('&jc=5&jmin=50'));
  assert.equal(noFlag.amnezia_overrides, null);
});

test('parseWgUri: reserved accepts base64 form', () => {
  const uri = wgUri().replace('reserved=1,2,3', 'reserved=AQID');
  const parsed = parseWgUri(uri);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
});

test('parseWgUri: wireguard:// userinfo variant', () => {
  const uri = `wireguard://${encodeURIComponent(PRIVATE_KEY)}@162.159.192.1:500?publickey=${encodeURIComponent(PEER_PUBLIC_KEY)}&address=${FIXTURE_ADDRESSES.ipv4}`;
  const parsed = parseWgUri(uri);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.config.private_key, PRIVATE_KEY);
  assert.equal(parsed.config.peer_public_key, PEER_PUBLIC_KEY);
  assert.equal(parsed.config.addresses.ipv4, FIXTURE_ADDRESSES.ipv4);
});

test('parseWgUri: malformed inputs rejected', () => {
  assert.match(parseWgUri('https://example.com').error, /wg:\/\/|wireguard:\/\//);
  assert.match(parseWgUri('not a uri').error, /format/);
  assert.match(parseWgUri('wg://host:2408?public_key=x').error, /private_key/);
  const noAddr = wgUri().replace(`local_address=${FIXTURE_ADDRESSES.ipv4}-${FIXTURE_ADDRESSES.ipv6}`, '');
  assert.match(parseWgUri(noAddr).error, /local_address/);
  const badKey = wgUri().replace(PRIVATE_KEY, encodeURIComponent('short'));
  assert.match(parseWgUri(badKey).error, /PrivateKey/);
  assert.match(parseWgUri(null).error, /not a string/);
});

test('isValidIpv6Part: accepts compressed, CIDR; rejects junk', () => {
  assert.equal(isValidIpv6Part('fd00:60ca:98fa:c88b:1234:5678:90ab:cdef/128'), true);
  assert.equal(isValidIpv6Part('::1'), true);
  assert.equal(isValidIpv6Part('2606:4700:d0::a29f:c001'), true);
  assert.equal(isValidIpv6Part('fe80::1/129'), false);
  assert.equal(isValidIpv6Part('1.2.3.4'), false);
  assert.equal(isValidIpv6Part('gggg::1'), false);
  assert.equal(isValidIpv6Part('::1::2'), false);
});

test('validateIPv4OrIPv6OrDomain', () => {
  assert.equal(validateIPv4OrIPv6OrDomain('162.159.192.1'), null);
  assert.match(validateIPv4OrIPv6OrDomain('256.0.0.1'), /Invalid IPv4/);
  assert.equal(validateIPv4OrIPv6OrDomain('::1'), null);
  assert.equal(validateIPv4OrIPv6OrDomain('2606:4700:d0::a29f:c001'), null);
  assert.equal(validateIPv4OrIPv6OrDomain('[2606:4700::1]'), null);
  assert.equal(validateIPv4OrIPv6OrDomain('::ffff:1.2.3.4'), null);
  assert.match(validateIPv4OrIPv6OrDomain('12345::'), /Invalid IPv6/);
  assert.match(validateIPv4OrIPv6OrDomain('1:2:3:4:5:6:7:8:9'), /Invalid IPv6/);
  assert.equal(validateIPv4OrIPv6OrDomain('engage.cloudflareclient.com'), null);
  assert.equal(validateIPv4OrIPv6OrDomain('a.b'), null);
  assert.match(validateIPv4OrIPv6OrDomain('localhost'), /Invalid domain/);
  assert.match(validateIPv4OrIPv6OrDomain('-bad.example.com'), /Invalid domain/);
  assert.match(validateIPv4OrIPv6OrDomain('a..b'), /Invalid domain/);
  assert.match(validateIPv4OrIPv6OrDomain(`${'a'.repeat(64)}.com`), /Invalid domain/);
  assert.match(validateIPv4OrIPv6OrDomain(`${'ab.'.repeat(85)}com`), /too long/);
  assert.match(validateIPv4OrIPv6OrDomain('has space.com'), /Invalid domain/);
  assert.match(validateIPv4OrIPv6OrDomain(''), /required/);
  assert.match(validateIPv4OrIPv6OrDomain(null), /required/);
  assert.match(validateIPv4OrIPv6OrDomain(42), /required/);
});

test('validatePort bounds', () => {
  assert.equal(validatePort(1), null);
  assert.equal(validatePort(65535), null);
  assert.equal(validatePort(2408), null);
  assert.match(validatePort(0), /1-65535/);
  assert.match(validatePort(65536), /1-65535/);
  assert.match(validatePort(1.5), /1-65535/);
  assert.match(validatePort(NaN), /1-65535/);
  assert.equal(validatePort('443'), null);
  assert.match(validatePort(undefined), /required/);
  assert.match(validatePort(null), /required/);
});

test('validateName limits and control characters', () => {
  assert.equal(validateName('Home ISP'), null);
  assert.equal(validateName('  padded name  '), null);
  assert.equal(validateName('a'.repeat(100)), null);
  assert.match(validateName('a'.repeat(101)), /max 100/);
  assert.match(validateName(''), /required/);
  assert.match(validateName(null), /required/);
  assert.match(validateName('bad\x01name'), /invalid characters/);
  assert.match(validateName('bad\x7fname'), /invalid characters/);
  assert.match(validateName('<script>'), /invalid characters/);
});

test('validateAmneziaSettings boundaries', () => {
  assert.match(validateAmneziaSettings(null), /Invalid Amnezia/);
  assert.equal(validateAmneziaSettings({}), null);

  assert.equal(validateAmneziaSettings({ Jc: 0 }), null);
  assert.equal(validateAmneziaSettings({ Jc: 128 }), null);
  assert.match(validateAmneziaSettings({ Jc: 129 }), /Jc must be 0-128/);
  assert.match(validateAmneziaSettings({ Jc: -1 }), /Jc must be 0-128/);
  assert.match(validateAmneziaSettings({ Jc: 1.5 }), /Jc must be 0-128/);

  assert.equal(validateAmneziaSettings({ Jmin: 100, Jmax: 100 }), null);
  assert.equal(validateAmneziaSettings({ Jmin: 1280, Jmax: 1280 }), null);
  assert.match(validateAmneziaSettings({ Jmax: 1281 }), /Jmax must be/);
  assert.match(validateAmneziaSettings({ Jmin: 100, Jmax: 50 }), /Jmin must be <= Jmax/);

  assert.equal(validateAmneziaSettings({ S1: 255, S2: 255 }), null);
  assert.match(validateAmneziaSettings({ S1: 256 }), /S1 must be 0-255/);
  assert.match(validateAmneziaSettings({ S2: 'abc' }), /S2 must be/);

  assert.equal(
    validateAmneziaSettings({ H1: 11111, H2: 22222, H3: 33333, H4: 44444 }),
    null
  );
  assert.equal(
    validateAmneziaSettings({ H1: '100-200', H2: '300-400', H3: '500-600', H4: '700-800' }),
    null
  );
  assert.equal(
    validateAmneziaSettings({
      H1: '2147483646-2147483647', H2: 1, H3: 2, H4: 3
    }),
    null
  );
  assert.match(
    validateAmneziaSettings({ H1: '100-200', H2: '150-300', H3: 1, H4: 2 }),
    /must not overlap/
  );
  assert.match(
    validateAmneziaSettings({ H1: '200-100', H2: 1, H3: 2, H4: 3 }),
    /range invalid/
  );
  assert.match(
    validateAmneziaSettings({ H1: '0-2147483648', H2: 1, H3: 2, H4: 3 }),
    /range invalid/
  );
  assert.match(
    validateAmneziaSettings({ H1: 5 }),
    /all-or-none/
  );
  assert.match(
    validateAmneziaSettings({ H1: 5, H2: 6, H3: 7 }),
    /all-or-none/
  );
  assert.match(
    validateAmneziaSettings({ H1: 2147483648, H2: 1, H3: 2, H4: 3 }),
    /H1 must be/
  );
});

function customList(endpoints) {
  return { type: 'custom', custom_endpoints: endpoints };
}

test('validateEndpointList presets and customs', () => {
  assert.equal(validateEndpointList({ type: 'preset', preset_id: 'default' }), null);
  assert.match(validateEndpointList({ type: 'preset', preset_id: '' }), /preset_id/);
  assert.match(validateEndpointList({ type: 'preset' }), /preset_id/);
  assert.match(validateEndpointList(null), /endpoint_list/);
  assert.match(validateEndpointList({ type: 'bogus' }), /type/);

  assert.match(validateEndpointList(customList([])), /At least one endpoint/);
  assert.equal(validateEndpointList(customList(FIXTURE_ENDPOINTS)), null);
  assert.equal(validateEndpointList(customList([{ ip: '1.2.3.4', port: 1 }, { ip: 'example.com', port: 65535 }])), null);
  assert.match(validateEndpointList(customList([{ ip: 'no spaces allowed', port: 1 }])), /Endpoint 1/);
  assert.match(validateEndpointList(customList([{ ip: '1.2.3.4', port: 0 }])), /Endpoint 1/);
  assert.match(validateEndpointList(customList([{ ip: '1.2.3.4' }])), /invalid endpoint|Port/);
  assert.match(validateEndpointList({ type: 'custom', custom_endpoints: 'nope' }), /custom_endpoints/);

  const tooMany = Array.from({ length: 201 }, (_, i) => ({ ip: '162.159.192.1', port: 1000 + i }));
  assert.match(validateEndpointList(customList(tooMany)), /Too many endpoints \(max 200\)/);
});

test('sanitizeFilename behavior', () => {
  assert.equal(sanitizeFilename('Home ISP'), 'Home-ISP');
  assert.equal(sanitizeFilename('a  b--c'), 'a-b-c');
  assert.equal(sanitizeFilename('--lead--trail--'), 'lead-trail');
  assert.equal(sanitizeFilename('my_file_v1.2'), 'my_file_v1.2');
  assert.equal(sanitizeFilename('\u062e\u0627\u0646\u0647 ISP'), 'ISP');
  assert.equal(sanitizeFilename('\uD83C\uDF10'), '');
});

test('resolveAmnezia precedence: account > global > defaults', () => {
  const defaultsOnly = resolveAmnezia(fixtureWithOverrides(null), null);
  assert.equal(defaultsOnly.Jc, 5);
  assert.equal(defaultsOnly.Jmin, 50);

  const withGlobal = resolveAmnezia(fixtureWithOverrides(null), { Jc: 9 });
  assert.equal(withGlobal.Jc, 9);
  assert.equal(withGlobal.Jmin, 50);

  const withOverride = resolveAmnezia(fixtureWithOverrides({ Jc: 99 }), { Jc: 9 });
  assert.equal(withOverride.Jc, 99);

  const rangeOverride = resolveAmnezia(fixtureWithOverrides({ H1: '100-150' }), { H1: 100 });
  assert.equal(rangeOverride.H1, '100-150');
  assert.ok(deepEqual(Object.keys(rangeOverride).sort(), ['H1', 'H2', 'H3', 'H4', 'I1', 'Jc', 'Jmax', 'Jmin', 'S1', 'S2', 'S3', 'S4']));
});

function fixtureWithOverrides(amnezia_overrides) {
  return { ...ACCOUNT_FIXTURE, amnezia_overrides };
}

test('expandEndpoints: expansion, dedupe, brackets, fallback', async () => {
  const expanded = await expandEndpoints(ACCOUNT_FIXTURE, fixtureEnv([FIXTURE_PRESET]));
  assert.equal(expanded.error, undefined);
  assert.equal(expanded.configs.length, FIXTURE_ENDPOINTS.length);

  const byEndpoint = expanded.configs.map(c => c.endpoint);
  assert.equal(byEndpoint[0], 'engage.cloudflareclient.com:2408');
  assert.equal(byEndpoint[1], '162.159.192.1:500');
  assert.equal(byEndpoint[2], '[2606:4700:d0::a29f:c001]:2408');

  const dupePreset = {
    ...FIXTURE_PRESET,
    endpoints: [{ ip: '1.2.3.4', port: 500 }, { ip: '1.2.3.4', port: 500 }]
  };
  const deduped = await expandEndpoints(ACCOUNT_FIXTURE, fixtureEnv([dupePreset]));
  assert.equal(deduped.configs.length, 1);

  const fallback = await expandEndpoints(
    { ...ACCOUNT_FIXTURE, endpoint_list: { type: 'preset', preset_id: 'default' } },
    fixtureEnv([])
  );
  assert.equal(fallback.error, undefined);
  assert.equal(fallback.configs.length, 5);

  const missing = await expandEndpoints(
    { ...ACCOUNT_FIXTURE, endpoint_list: { type: 'preset', preset_id: 'ghost' } },
    fixtureEnv([])
  );
  assert.match(missing.error, /preset/i);

  const custom = await expandEndpoints(
    { ...ACCOUNT_FIXTURE, endpoint_list: { type: 'custom', custom_endpoints: [{ ip: '9.9.9.9', port: 1 }] } },
    fixtureEnv([])
  );
  assert.equal(custom.configs.length, 1);
  assert.equal(custom.configs[0].endpoint, '9.9.9.9:1');
});
