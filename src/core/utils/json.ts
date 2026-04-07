/**
 * Parse JSON safely without throwing. Returns null on empty or invalid input.
 */
export function parseJsonSafely<T>(body: string): T | null {
  if (body.trim() === '') return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
