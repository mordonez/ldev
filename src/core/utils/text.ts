export function normalizeScalarString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized === '' ? undefined : normalized;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  return undefined;
}

/**
 * Split text into non-empty trimmed lines, optionally ignoring comment lines.
 */
export function parseLines(text: string, options?: {ignoreComments?: boolean}): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line === '') return false;
      if (options?.ignoreComments && line.startsWith('#')) return false;
      return true;
    });
}

/**
 * Return the first non-blank string value from a list.
 */
export function firstNonBlank(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim() !== '') ?? '';
}

/**
 * Coerce a value to string, returning undefined if empty after trimming.
 * Supports arrays by finding first non-empty element.
 */
export function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map(normalizeScalarString).find((item): item is string => item !== undefined);
  }

  return normalizeScalarString(value);
}

/**
 * Remove leading slash if present (e.g. "/foo" → "foo", "foo" → "foo").
 */
export function trimLeadingSlash(value: string): string {
  return value.startsWith('/') ? value.slice(1) : value;
}
