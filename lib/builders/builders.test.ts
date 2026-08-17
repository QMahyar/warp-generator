import { describe, it, expect } from 'vitest';
import { buildConfig } from './index';
import { parseEndpoint } from './shared';
import { reservedToBytes } from '../crypto';
import type { BuildParams } from '@/types';

function makeParams(overrides: Partial<BuildParams> = {}): BuildParams {
  return {
    privateKey: 'aGVsbG8ta2V5LTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA',
    publicKey: 'cHVibGljLWtleS1kb3RlY29u',
    clientIPv4: '172.16.0.2',
    clientIPv6: '2606:4700:4700::1112',
    allowedIPs: '0.0.0.0/0, ::/0',
    endpoint: 'engage.cloudflareclient.com:2408',
    deviceType: 'awg15',
    reserved: 'U4An',
    dns: '1.1.1.1, 1.0.0.1',
    includeIPv6: true,
    i1: 'I1 = <b 0x0000>',
    ...overrides,
  };
}

describe('buildClash', () => {
  it('emits AmneziaWG magic headers in the canonical order (h3=3, h4=4)', () => {
    const out = buildConfig('clash', makeParams());
    // WARP template: H3 = underload = 3, H4 = transport = 4.
    const h3 = out.indexOf('h3: 3');
    const h4 = out.indexOf('h4: 4');
    expect(h3).toBeGreaterThan(-1);
    expect(h4).toBeGreaterThan(-1);
    expect(h3).toBeLessThan(h4);
    expect(out).not.toContain('h4: 3');
    expect(out).not.toContain('h3: 4');
  });

  it('serializes reserved as an int array', () => {
    const out = buildConfig('clash', makeParams());
    const match = out.match(/reserved: \[([^\]]*)\]/);
    expect(match).toBeTruthy();
    const reserved = match![1].split(',').map((s) => s.trim());
    expect(reserved).toEqual(['83', '128', '39']);
  });

  it('renders the server:port from the endpoint', () => {
    const out = buildConfig('clash', makeParams({ endpoint: '1.2.3.4:51820' }));
    expect(out).toContain('server: 1.2.3.4');
    expect(out).toContain('port: 51820');
  });
});

describe('buildHusi', () => {
  it('emits reserved as an int array (sing-box schema), not a string', () => {
    const out = buildConfig('husi', makeParams());
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed.peers[0].reserved)).toBe(true);
    expect(parsed.peers[0].reserved).toEqual([83, 128, 39]);
  });
});

describe('buildWireguard', () => {
  it('includes the correct Address, PrivateKey and Endpoint lines', () => {
    const out = buildConfig('wireguard', makeParams());
    expect(out).toContain('PrivateKey = aGVsbG8ta2V5LTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA');
    expect(out).toContain('Address = 172.16.0.2, 2606:4700:4700::1112');
    expect(out).toContain('Endpoint = engage.cloudflareclient.com:2408');
  });
});

describe('parseEndpoint', () => {
  it('parses a plain host:port', () => {
    expect(parseEndpoint('1.2.3.4:51820')).toEqual({ server: '1.2.3.4', port: 51820 });
  });

  it('parses a bracketed IPv6 endpoint', () => {
    expect(parseEndpoint('[2606:4700:4700::1111]:2408')).toEqual({
      server: '2606:4700:4700::1111',
      port: 2408,
    });
  });

  it('defaults the port to 4500 when absent', () => {
    expect(parseEndpoint('engage.cloudflareclient.com')).toEqual({
      server: 'engage.cloudflareclient.com',
      port: 4500,
    });
  });

  it('treats an unbracketed bare IPv6 as a server with no port, not a split host', () => {
    expect(parseEndpoint('2606:4700:4700::1111')).toEqual({
      server: '2606:4700:4700::1111',
      port: 4500,
    });
  });
});

describe('reservedToBytes', () => {
  it('decodes base64url reserved to the 3-byte array', () => {
    expect(reservedToBytes('U4An')).toEqual([83, 128, 39]);
  });

  it('returns [0,0,0] for empty input', () => {
    expect(reservedToBytes('')).toEqual([0, 0, 0]);
  });
});
