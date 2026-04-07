/**
 * Measure HTTP roundtrip latency in milliseconds.
 * Returns null if the request fails or the server returns a 5xx error.
 */
export async function measureHttpLatency(url: string, options?: {timeoutMs?: number}): Promise<number | null> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(options?.timeoutMs ?? 5000),
      redirect: 'manual',
    });
    if (response.status >= 500) {
      return null;
    }
    return Date.now() - startedAt;
  } catch {
    return null;
  }
}
