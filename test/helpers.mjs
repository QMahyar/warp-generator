import { unzipSync } from 'fflate';
import { expandEndpoints, resolveAmnezia } from '../_worker.js';

export const PRIVATE_KEY = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=';
export const PEER_PUBLIC_KEY = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=';

export const FIXTURE_ADDRESSES = {
  ipv4: '10.2.0.2/32',
  ipv6: 'fd00:60ca:98fa:c88b:1234:5678:90ab:cdef/128'
};

export const FIXTURE_ENDPOINTS = [
  { ip: 'engage.cloudflareclient.com', port: 2408 },
  { ip: '162.159.192.1', port: 500 },
  { ip: '[2606:4700:d0::a29f:c001]', port: 2408 },
  { ip: '162.159.192.33', port: 1701 },
  { ip: '2606:4700:d0::a29f:c002', port: 878 }
];

export const FIXTURE_PRESET = {
  id: 'fixture',
  name: 'Fixture',
  endpoints: FIXTURE_ENDPOINTS
};

export const GLOBAL_AMNEZIA = {
  Jc: 9, Jmin: 40, Jmax: 900, S1: 15, S2: 20, S3: 25, S4: 30,
  H1: 100, H2: 200, H3: 300, H4: 400,
  I1: '<r 128>'
};

export const ACCOUNT_AMNEZIA_OVERRIDES = {
  Jc: 12, H1: '100-150', H2: '200-250', H3: '300-350', H4: '400-450'
};

export function fixtureAccount(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Home ISP',
    token: '11111111-2222-4333-8444-555555555555',
    created_at: '2026-01-01T00:00:00.000Z',
    config: {
      private_key: PRIVATE_KEY,
      addresses: { ...FIXTURE_ADDRESSES },
      peer_public_key: PEER_PUBLIC_KEY,
      mtu: 1280,
      reserved: [1, 2, 3]
    },
    endpoint_list: { type: 'preset', preset_id: 'fixture' },
    amnezia_overrides: null,
    ...overrides
  };
}

export const ACCOUNT_FIXTURE = fixtureAccount({
  amnezia_overrides: { ...ACCOUNT_AMNEZIA_OVERRIDES }
});

export function resolveAmneziaForAccount(account) {
  return resolveAmnezia(account, GLOBAL_AMNEZIA);
}

export function fixtureEnv(presets = [FIXTURE_PRESET]) {
  return {
    WARP_KV: {
      get: async (key) => (key === 'presets' ? presets : null)
    }
  };
}

export async function fixtureConfigs(account = ACCOUNT_FIXTURE, presets = [FIXTURE_PRESET]) {
  const expanded = await expandEndpoints(account, fixtureEnv(presets));
  if (expanded.error) throw new Error(expanded.error);
  return expanded.configs;
}

const decoder = new TextDecoder();

export function normalizeFormatOutput(format, body, formatInfo) {
  if (formatInfo.binary) {
    const members = unzipSync(new Uint8Array(body));
    const names = Object.keys(members).sort();
    let text = '';
    for (const name of names) {
      text += `### ${name}\n${decoder.decode(members[name])}`;
    }
    return text;
  }
  return body;
}

export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
