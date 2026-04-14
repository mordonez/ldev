/**
 * Parse common boolean-like values. Returns null when value is not recognized.
 */
export function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  return null;
}

/**
 * Parse a boolean-like value and default to false when unknown.
 */
export function toBooleanOrFalse(value: unknown): boolean {
  return toBoolean(value) ?? false;
}

/**
 * Return the first non-empty string value.
 */
export function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return '';
}

/**
 * Return the first finite positive number from a list of values.
 */
export function firstPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}
