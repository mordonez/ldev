import {describe, expect, test, vi} from 'vitest';

import {measureHttpLatency} from '../../src/core/http/latency.js';

describe('measureHttpLatency', () => {
  test('returns elapsed time for successful request', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 200,
      } as Response),
    );

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
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 500,
      } as Response),
    );

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeNull();
  });

  test('returns null for 503 status', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 503,
      } as Response),
    );

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeNull();
  });

  test('returns null on fetch error', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeNull();
  });

  test('uses default timeout when not specified', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 200,
      } as Response),
    );

    await measureHttpLatency('http://example.com');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test('uses custom timeout when specified', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 200,
      } as Response),
    );

    await measureHttpLatency('http://example.com', {timeoutMs: 2000});

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test('returns success for non-5xx status codes', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 404,
      } as Response),
    );

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('returns success for 2xx status', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 201,
      } as Response),
    );

    const result = await measureHttpLatency('http://example.com');

    expect(result).toBeGreaterThanOrEqual(0);
  });
});
