import fs from 'fs-extra';

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

export function parseJsonUnknown(body: string): unknown {
  return JSON.parse(body) as unknown;
}

export function parseJsonRecord(body: string): Record<string, unknown> | null {
  const parsed = parseJsonSafely<unknown>(body);
  return isRecord(parsed) ? parsed : null;
}

export async function readJsonUnknown(filePath: string): Promise<unknown> {
  return fs.readJson(filePath) as Promise<unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
