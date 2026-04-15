import {describe, expect, test} from 'vitest';

import {
  makeLocalizedMap,
  serializeLocalizedMap,
  localizedMap,
  type LocalizedMap,
} from '../../src/features/liferay/resource/liferay-resource-sync-shared.js';

// ---------------------------------------------------------------------------
// makeLocalizedMap
// ---------------------------------------------------------------------------

describe('makeLocalizedMap', () => {
  test('returns a typed object with the three default locales', () => {
    const result = makeLocalizedMap('My Template');
    expect(result).toStrictEqual({
      ca_ES: 'My Template',
      es_ES: 'My Template',
      en_US: 'My Template',
    });
  });

  test('all locale values match the input text', () => {
    const result = makeLocalizedMap('Test Value');
    expect(result.ca_ES).toBe('Test Value');
    expect(result.es_ES).toBe('Test Value');
    expect(result.en_US).toBe('Test Value');
  });

  test('works with empty string', () => {
    const result = makeLocalizedMap('');
    expect(result).toStrictEqual({ca_ES: '', es_ES: '', en_US: ''});
  });

  test('does not serialize — returns plain object, not a string', () => {
    const result = makeLocalizedMap('hello');
    expect(typeof result).toBe('object');
    expect(typeof result).not.toBe('string');
  });

  test('satisfies LocalizedMap type (structural check)', () => {
    const result: LocalizedMap = makeLocalizedMap('type-check');
    expect(Object.keys(result).sort()).toStrictEqual(['ca_ES', 'en_US', 'es_ES']);
  });

  test('handles special characters correctly', () => {
    const text = 'Template "quoted" & <special>';
    const result = makeLocalizedMap(text);
    expect(result.en_US).toBe(text);
    expect(result.ca_ES).toBe(text);
    expect(result.es_ES).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// serializeLocalizedMap
// ---------------------------------------------------------------------------

describe('serializeLocalizedMap', () => {
  test('returns valid JSON string', () => {
    const map = makeLocalizedMap('hello');
    const serialized = serializeLocalizedMap(map);
    let threw = false;
    try {
      JSON.parse(serialized);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  test('serialized output contains all three locales', () => {
    const serialized = serializeLocalizedMap(makeLocalizedMap('world'));
    const parsed = JSON.parse(serialized) as Record<string, string>;
    expect(parsed).toHaveProperty('ca_ES', 'world');
    expect(parsed).toHaveProperty('es_ES', 'world');
    expect(parsed).toHaveProperty('en_US', 'world');
  });

  test('serialized output matches JSON.stringify of the typed object', () => {
    const map = makeLocalizedMap('exact');
    expect(serializeLocalizedMap(map)).toBe(JSON.stringify({ca_ES: 'exact', es_ES: 'exact', en_US: 'exact'}));
  });

  test('serialized empty description is valid JSON with empty strings', () => {
    const serialized = serializeLocalizedMap(makeLocalizedMap(''));
    const parsed = JSON.parse(serialized) as Record<string, string>;
    expect(parsed.en_US).toBe('');
    expect(parsed.ca_ES).toBe('');
    expect(parsed.es_ES).toBe('');
  });
});

// ---------------------------------------------------------------------------
// localizedMap (backward-compatible wrapper)
// ---------------------------------------------------------------------------

describe('localizedMap', () => {
  test('is equivalent to serializeLocalizedMap(makeLocalizedMap(text))', () => {
    const text = 'BASIC_TEMPLATE';
    expect(localizedMap(text)).toBe(serializeLocalizedMap(makeLocalizedMap(text)));
  });

  test('returns a string (not an object)', () => {
    expect(typeof localizedMap('test')).toBe('string');
  });

  test('serialized output contains all default locales', () => {
    const parsed = JSON.parse(localizedMap('MY_KEY')) as Record<string, string>;
    expect(parsed).toHaveProperty('ca_ES', 'MY_KEY');
    expect(parsed).toHaveProperty('es_ES', 'MY_KEY');
    expect(parsed).toHaveProperty('en_US', 'MY_KEY');
  });

  test('backward compat: empty string description produces valid serialized JSON', () => {
    const parsed = JSON.parse(localizedMap('')) as Record<string, string>;
    expect(parsed.en_US).toBe('');
  });

  test('default locales are exactly ca_ES, es_ES, en_US — no extras', () => {
    const parsed = JSON.parse(localizedMap('x')) as Record<string, string>;
    expect(Object.keys(parsed).sort()).toStrictEqual(['ca_ES', 'en_US', 'es_ES']);
  });
});
