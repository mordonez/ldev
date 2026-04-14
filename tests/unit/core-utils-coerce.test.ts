import {describe, expect, it} from 'vitest';
import {firstNonEmptyString, firstPositiveNumber, toBoolean, toBooleanOrFalse} from '../../src/core/utils/coerce.js';

describe('core utils coerce', () => {
  it('parses boolean-like values', () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(false)).toBe(false);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean('yes')).toBe(true);
    expect(toBoolean('No')).toBe(false);
    expect(toBoolean('unknown')).toBeNull();
  });

  it('defaults unknown booleans to false', () => {
    expect(toBooleanOrFalse('unknown')).toBe(false);
    expect(toBooleanOrFalse('true')).toBe(true);
  });

  it('returns first non-empty string', () => {
    expect(firstNonEmptyString(undefined, '   ', 10, 'value', 'next')).toBe('value');
    expect(firstNonEmptyString(undefined, null, 123)).toBe('');
  });

  it('returns first finite positive number', () => {
    expect(firstPositiveNumber(undefined, -2, '0', '5', 7)).toBe(5);
    expect(firstPositiveNumber(null, 'NaN', -3, 0)).toBeNull();
  });
});
