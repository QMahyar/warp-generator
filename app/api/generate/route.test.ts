import { describe, it, expect, beforeEach, vi } from 'vitest';
import { throttleGenerate, __resetGenerateThrottle } from '@/lib/generate-throttle';
import { POST } from './route';
import { generateWarpConfig } from '@/lib/warp-service';
import type { GenerateRequest } from '@/types';

// Mock generation so the tests never hit Cloudflare's /reg (account minting).
vi.mock('@/lib/warp-service', () => ({
  generateWarpConfig: vi.fn(),
  WarpGenerationError: class WarpGenerationError extends Error {},
}));

const generateMock = vi.mocked(generateWarpConfig);

function generateReq(ip: string): Request {
  return new Request('https://panel.example/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ siteMode: 'all' } as GenerateRequest),
  });
}

describe('throttleGenerate (per-IP account-mint limits)', () => {
  beforeEach(() => {
    __resetGenerateThrottle();
    generateMock.mockReset();
  });

  it('allows requests up to the per-window cap', () => {
    for (let i = 0; i < 5; i++) {
      expect(throttleGenerate('203.0.113.7')).toBeNull();
    }
  });

  it('rejects requests past the per-window cap with a readable message', () => {
    for (let i = 0; i < 5; i++) throttleGenerate('203.0.113.7');
    expect(throttleGenerate('203.0.113.7')).toMatch(/rate limit/i);
  });

  it('tracks each client IP independently', () => {
    for (let i = 0; i < 5; i++) throttleGenerate('203.0.113.7');
    for (let i = 0; i < 5; i++) {
      expect(throttleGenerate('198.51.100.9')).toBeNull();
    }
  });

  it('POST returns 429 before generation when the IP is throttled', async () => {
    // Pre-fill the throttle so the very first request is already limited.
    for (let i = 0; i < 5; i++) throttleGenerate('203.0.113.7');
    const res = await POST(generateReq('203.0.113.7'));
    expect(res.status).toBe(429);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('POST generates when under the limit', async () => {
    generateMock.mockResolvedValue({
      configBase64: 'cmVk',
      qrCodeBase64: 'cXJjb2Rl',
      configFormat: 'wireguard',
      fileName: 'warp.conf',
    });
    const res = await POST(generateReq('198.51.100.9'));
    expect(res.status).toBe(200);
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});