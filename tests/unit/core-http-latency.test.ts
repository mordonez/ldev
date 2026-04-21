import {describe, expect, test, vi} from 'vitest';

import {measureHttpLatency} from '../../src/core/http/latency.js';

function mockFetchStatus(status: number): void {
  const fetchMock: typeof fetch = vi.fn(() => Promise.resolve({status} as Response));
  global.fetch = fetchMock;
}

function mockFetchError(message: string): void {
  const fetchMock: typeof fetch = vi.fn(() => Promise.reject(new Error(message)));
  global.fetch = fetchMock;
}

describe('measureHttpLatency', () => {
  test('returns elapsed time for successful request', async () => {
    mockFetchStatus(200);

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeGreaterThanOrEqual(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://example.com',
      expect.objectContaining({
        redirect: 'manual',
      }),
    );
  });

  test('returns null for 5xx status', async () => {
    mockFetchStatus(500);

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeNull();
  });

  test('returns null for 503 status', async () => {
    mockFetchStatus(503);

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeNull();
  });

  test('returns null on fetch error', async () => {
    mockFetchError('Network error');

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeNull();
  });

  test('uses default timeout when not specified', async () => {
    mockFetchStatus(200);

    await measureHttpLatency('http://example.com');

    const [requestUrl, requestInit] = vi.mocked(global.fetch).mock.calls[0] ?? [];
    expect(requestUrl).toBe('http://example.com');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  test('uses custom timeout when specified', async () => {
    mockFetchStatus(200);

    await measureHttpLatency('http://example.com', {timeoutMs: 2000});

    const [requestUrl, requestInit] = vi.mocked(global.fetch).mock.calls[0] ?? [];
    expect(requestUrl).toBe('http://example.com');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  test('returns success for non-5xx status codes', async () => {
    mockFetchStatus(404);

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('returns success for 2xx status', async () => {
    mockFetchStatus(201);

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeGreaterThanOrEqual(0);
  });
});
