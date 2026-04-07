import {describe, expect, test} from 'vitest';

import {parseJsonSafely} from '../../src/core/utils/json.js';

describe('parseJsonSafely', () => {
  test('parses valid JSON', () => {
    const result = parseJsonSafely('{"key":"value"}');

    expect(result).toEqual({key: 'value'});
  });

  test('returns null for empty string', () => {
    const result = parseJsonSafely('');

    expect(result).toBeNull();
  });

  test('returns null for whitespace only', () => {
    const result = parseJsonSafely('   ');

    expect(result).toBeNull();
  });

  test('returns null for invalid JSON', () => {
    const result = parseJsonSafely('{invalid json}');

    expect(result).toBeNull();
  });

  test('parses JSON array', () => {
    const result = parseJsonSafely('[1,2,3]');

    expect(result).toEqual([1, 2, 3]);
  });

  test('parses JSON string', () => {
    const result = parseJsonSafely('"hello"');

    expect(result).toBe('hello');
  });

  test('parses JSON number', () => {
    const result = parseJsonSafely('42');

    expect(result).toBe(42);
  });

  test('parses JSON boolean', () => {
    const resultTrue = parseJsonSafely('true');
    const resultFalse = parseJsonSafely('false');

    expect(resultTrue).toBe(true);
    expect(resultFalse).toBe(false);
  });

  test('parses JSON null', () => {
    const result = parseJsonSafely('null');

    expect(result).toBeNull();
  });

  test('preserves nested structures', () => {
    const result = parseJsonSafely('{"nested":{"deep":{"value":123}}}');

    expect(result).toEqual({nested: {deep: {value: 123}}});
  });
});
