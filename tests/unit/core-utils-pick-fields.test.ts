import {describe, expect, test} from 'vitest';

import {pickFields} from '../../src/core/utils/pick-fields.js';

describe('pickFields', () => {
  test('returns value unchanged when fields list is empty', () => {
    const input = {id: 1, name: 'Site A', url: '/a'};
    expect(pickFields(input, [])).toBe(input);
  });

  test('picks top-level fields from an object', () => {
    const input = {id: 1, name: 'Site A', url: '/a'};
    expect(pickFields(input, ['id', 'name'])).toEqual({id: 1, name: 'Site A'});
  });

  test('ignores fields that do not exist', () => {
    const input = {id: 1, name: 'Site A'};
    expect(pickFields(input, ['id', 'missing'])).toEqual({id: 1});
  });

  test('picks nested fields using dot notation', () => {
    const input = {id: 1, site: {name: 'Site A', url: '/a'}, extra: 'x'};
    expect(pickFields(input, ['id', 'site.name'])).toEqual({id: 1, site: {name: 'Site A'}});
  });

  test('merges multiple nested fields under the same parent key', () => {
    const input = {site: {id: 99, name: 'Site A', url: '/a'}};
    expect(pickFields(input, ['site.id', 'site.name'])).toEqual({site: {id: 99, name: 'Site A'}});
  });

  test('maps over arrays applying projection to each element', () => {
    const input = [
      {id: 1, name: 'A', url: '/a'},
      {id: 2, name: 'B', url: '/b'},
    ];
    expect(pickFields(input, ['id', 'name'])).toEqual([
      {id: 1, name: 'A'},
      {id: 2, name: 'B'},
    ]);
  });

  test('handles arrays nested inside objects', () => {
    const input = {
      items: [
        {id: 1, name: 'A'},
        {id: 2, name: 'B'},
      ],
      total: 2,
    };
    expect(pickFields(input, ['items', 'total'])).toEqual({
      items: [
        {id: 1, name: 'A'},
        {id: 2, name: 'B'},
      ],
      total: 2,
    });
  });

  test('returns primitives unchanged regardless of fields', () => {
    expect(pickFields('hello', ['id'])).toBe('hello');
    expect(pickFields(42, ['id'])).toBe(42);
    expect(pickFields(null, ['id'])).toBeNull();
  });
});
