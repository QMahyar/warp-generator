import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEndpointList,
  validateWarpAddresses,
  normalizeEndpointIp,
  parseWgUri,
  generateThroneUri,
  generateWireguardUri,
  expandEndpoints,
  createSession,
  storeAccount
} from '../_worker.js';
import {
  ACCOUNT_FIXTURE,
  FIXTURE_ADDRESSES,
  PRIVATE_KEY,
  PEER_PUBLIC_KEY,
  fixtureAccount,
  fixtureConfigs,
  fixtureEnv,
  FIXTURE_PRESET
} from './helpers.mjs';

test('validateEndpointList rejects empty custom endpoint array', () => {
  assert.match(validateEndpointList({ type: 'custom', custom_endpoints: [] }), /At least one endpoint/);
  assert.equal(validateEndpointList({ type: 'preset', preset_id: 'x' }), null);
});

test('validateEndpointList normalizes bracketed IPv6 at validation boundary', () => {
  const list = { type: 'custom', custom_endpoints: [{ ip: '[2606:4700:d0::a29f:c001]', port: 2408 }] };
  const err = validateEndpointList(list);
  assert.equal(err, null);
  assert.equal(list.custom_endpoints[0].ip, '2606:4700:d0::a29f:c001');
});

test('validateWarpAddresses rejects undefined/null/non-string v4 or v6', () => {
  assert.match(validateWarpAddresses(undefined, 'fd00::1/128'), /missing or not strings/);
  assert.match(validateWarpAddresses('10.2.0.2/32', undefined), /missing or not strings/);
  assert.match(validateWarpAddresses(null, null), /missing or not strings/);
  assert.match(validateWarpAddresses(42, 'fd00::1/128'), /missing or not strings/);
  assert.match(validateWarpAddresses('10.2.0.2/32', {}), /missing or not strings/);
});

test('validateWarpAddresses rejects garbage addresses, accepts sane CIDRs', () => {
  assert.match(validateWarpAddresses('not-an-ip', 'fd00::1/128'), /malformed IPv4/);
  assert.match(validateWarpAddresses('999.2.0.2/32', 'fd00::1/128'), /malformed IPv4/);
  assert.match(validateWarpAddresses('10.2.0.2', 'fd00::1/128'), /malformed IPv4/);
  assert.match(validateWarpAddresses('10.2.0.2/64', 'fd00::1/128'), /malformed IPv4/);
  assert.match(validateWarpAddresses('10.2.0.2/32', 'garbage'), /malformed IPv6/);
  assert.match(validateWarpAddresses('10.2.0.2/32', 'fd00::1<script>'), /malformed IPv6/);
  assert.equal(validateWarpAddresses('172.16.0.2/32', '2606:4700:d0::a29f:c001/128'), null);
  assert.equal(validateWarpAddresses('10.2.0.2/32', 'fd00::1'), null);
});

test('wireguard:// single-stack accounts have no trailing comma in address', async () => {
  const ipv4only = await fixtureConfigs(fixtureAccount({
    config: { ...ACCOUNT_FIXTURE.config, addresses: { ipv4: '10.2.0.2/32', ipv6: '' } }
  }));
  const uri4 = decodeURIComponent(generateWireguardUri(ipv4only).split('\n')[0]);
  const addr4 = uri4.match(/address=([^&#]*)/)[1];
  assert.equal(addr4, '10.2.0.2/32');
  assert.ok(!addr4.startsWith(','), 'no leading comma');
  assert.ok(!addr4.endsWith(','), 'no trailing comma');

  const ipv6only = await fixtureConfigs(fixtureAccount({
    config: { ...ACCOUNT_FIXTURE.config, addresses: { ipv4: '', ipv6: 'fd00::1/128' } }
  }));
  const uri6 = decodeURIComponent(generateWireguardUri(ipv6only).split('\n')[0]);
  const addr6 = uri6.match(/address=([^&#]*)/)[1];
  assert.equal(addr6, 'fd00::1/128');
});

test('parseWgUri accepts dash-separated reserved triples', () => {
  const base = `wg://engage.cloudflareclient.com:2408?private_key=${PRIVATE_KEY}&public_key=${PEER_PUBLIC_KEY}&local_address=${FIXTURE_ADDRESSES.ipv4}`;
  const parsed = parseWgUri(`${base}&reserved=9-8-7#t`);
  assert.equal(parsed.error, undefined, parsed.error);
  assert.deepEqual(parsed.config.reserved, [9, 8, 7]);

  assert.match(parseWgUri(`${base}&reserved=1-300-3#t`).error, /reserved/);
  assert.match(parseWgUri(`${base}&reserved=1-2-3-4#t`).error, /reserved|base64/);
});

test('generated Throne URIs round-trip through our own parser untouched', async () => {
  const configs = await fixtureConfigs();
  for (const uri of generateThroneUri(configs).split('\n')) {
    assert.match(uri, /reserved=1-2-3/);
    const parsed = parseWgUri(uri);
    assert.equal(parsed.error, undefined, `${uri}: ${parsed.error}`);
    assert.deepEqual(parsed.config.reserved, [1, 2, 3]);
  }
});

test('expandEndpoints stores bare IPv6 but keeps brackets in conf endpoint field', async () => {
  const expanded = await expandEndpoints(ACCOUNT_FIXTURE, fixtureEnv([FIXTURE_PRESET]));
  assert.equal(expanded.error, undefined);
  const bracketedCfg = expanded.configs.find(c => c.ip.includes('2606:4700:d0::a29f:c001'));
  assert.ok(bracketedCfg);
  assert.equal(bracketedCfg.ip, '2606:4700:d0::a29f:c001');
  assert.equal(bracketedCfg.endpoint, '[2606:4700:d0::a29f:c001]:2408');
});

test('expandEndpoints flags accounts with malformed config instead of emitting undefined', async () => {
  const broken = fixtureAccount({ config: null });
  const result = await expandEndpoints(broken, fixtureEnv([FIXTURE_PRESET]));
  assert.match(result.error, /invalid/i);
  assert.equal(result.status, 500);

  const noKey = fixtureAccount({ config: { ...ACCOUNT_FIXTURE.config, private_key: undefined } });
  const result2 = await expandEndpoints(noKey, fixtureEnv([FIXTURE_PRESET]));
  assert.match(result2.error, /private_key/);

  const junkRow = fixtureAccount({
    endpoint_list: { type: 'custom', custom_endpoints: [{ ip: '162.159.192.1', port: 500 }, null, { port: 700 }] }
  });
  const result3 = await expandEndpoints(junkRow, fixtureEnv([]));
  assert.equal(result3.configs.length, 1);
});

test('createSession passes KV expirationTtl matching session duration', async () => {
  const captured = {};
  const env = {
    WARP_KV: {
      put: async (key, value, opts) => {
        captured.key = key;
        captured.value = JSON.parse(value);
        captured.opts = opts;
      }
    }
  };
  const session = await createSession(env);
  assert.ok(session && typeof session.token === 'string');
  assert.equal(captured.key, `session:${session.token}`);
  assert.equal(captured.opts.expirationTtl, 24 * 60 * 60);
  assert.ok(captured.value.expires_at > Date.now());
});

test('storeAccount writes token mapping last and compensates on failure', async () => {
  const ops = [];
  const goodEnv = {
    WARP_KV: {
      put: async (key) => { ops.push(`put ${key.split(':')[0]}`); },
      delete: async (key) => { ops.push(`delete ${key.split(':')[0]}`); }
    }
  };
  const account = fixtureAccount();
  assert.equal(await storeAccount(goodEnv, account), true);
  assert.deepEqual(ops, ['put account', 'put token']);

  ops.length = 0;
  const failingEnv = {
    WARP_KV: {
      put: async (key) => {
        if (key.startsWith('token:')) throw new Error('kv write quota');
        ops.push(`put account`);
      },
      delete: async (key) => { ops.push(`delete account`); }
    }
  };
  assert.equal(await storeAccount(failingEnv, account), false);
  assert.deepEqual(ops, ['put account', 'delete account']);
});
