import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useGenerator } from './use-generator';

// Mock the fetch call so the tests never hit a real endpoint.
function mockFetchOnceWith(handler: (init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => handler(init as RequestInit));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function defaultGenerator() {
  return renderHook(() => useGenerator());
}

describe('useGenerator — debounce flush-before-generate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the latest typed keepalive value even before the debounce commits', async () => {
    const fetchMock = mockFetchOnceWith(() =>
      new Response(
        JSON.stringify({
          success: true,
          content: { configBase64: 'eA==', qrCodeBase64: '', configFormat: 'wireguard', fileName: 'warp.conf' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const { result } = defaultGenerator();

    // User enables keepalive and types a value (parent setter is synchronous).
    await act(async () => {
      result.current.set('keepaliveEnabled', true);
      result.current.setKeepaliveValue('42');
    });
    await act(async () => {
      await result.current.handleGenerate();
    });

    // The request must carry keepalive 42 (not the initial stale value).
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.persistentKeepalive).toBe(42);
  });

  it('uses the latest typed I1 domain even before the debounce commits', async () => {
    const fetchMock = mockFetchOnceWith(() =>
      new Response(
        JSON.stringify({
          success: true,
          content: { configBase64: 'eA==', qrCodeBase64: '', configFormat: 'wireguard', fileName: 'warp.conf' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const { result } = defaultGenerator();

    await act(async () => {
      result.current.setCustomI1Domain('example.com');
      result.current.set('customI1Enabled', true);
    });
    await act(async () => {
      await result.current.handleGenerate();
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.customI1Domain).toBe('example.com');
  });
});

describe('useGenerator — request sequence guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a stale (older) response does not overwrite a newer generation result', async () => {
    // First generate hangs; second resolve immediately.
    let releaseFirst!: (r: Response) => void;
    const firstPromise = new Promise<Response>((resolve) => { releaseFirst = resolve; });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              content: { configBase64: 'bg==', qrCodeBase64: '', configFormat: 'wireguard', fileName: 'warp.conf' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = defaultGenerator();

    const firstCall = result.current.handleGenerate(); // in-flight, not resolved
    await act(async () => {
      await result.current.handleGenerate(); // newer: resolves immediately
    });
    await act(async () => {
      releaseFirst(
        new Response(
          JSON.stringify({
            success: true,
            content: { configBase64: 'b2xk', qrCodeBase64: '', configFormat: 'wireguard', fileName: 'warp.conf' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      await firstCall;
    });

    // The result must be the NEWER one ('bg==' = b), not the stale 'b2xk' (old).
    expect(result.current.state.result?.configBase64).toBe('bg==');
    expect(result.current.state.isLoading).toBe(false);
  });
});