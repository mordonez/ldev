import {describe, expect, test} from 'vitest';

import {CliError} from '../../src/core/errors.js';
import {
  matchesDdmTemplate,
  matchesAdtRow,
  matchesInventoryTemplate,
  normalizeAdtIdentifier,
  type AdtRowShape,
  type InventoryTemplateShape,
} from '../../src/features/liferay/liferay-identifiers.js';

// ---------------------------------------------------------------------------
// matchesDdmTemplate
// ---------------------------------------------------------------------------

describe('matchesDdmTemplate', () => {
  const baseItem: Record<string, unknown> = {
    templateId: '101',
    templateKey: 'BASIC_TEMPLATE',
    externalReferenceCode: 'ERC-001',
    nameCurrentValue: 'Basic Template',
    name: 'basic-template',
  };

  test('matches by templateId', () => {
    expect(matchesDdmTemplate(baseItem, '101')).toBe(true);
  });

  test('matches by templateKey', () => {
    expect(matchesDdmTemplate(baseItem, 'BASIC_TEMPLATE')).toBe(true);
  });

  test('matches by externalReferenceCode', () => {
    expect(matchesDdmTemplate(baseItem, 'ERC-001')).toBe(true);
  });

  test('matches by nameCurrentValue', () => {
    expect(matchesDdmTemplate(baseItem, 'Basic Template')).toBe(true);
  });

  test('matches by name', () => {
    expect(matchesDdmTemplate(baseItem, 'basic-template')).toBe(true);
  });

  test('does not match an unrelated identifier', () => {
    expect(matchesDdmTemplate(baseItem, 'UNKNOWN')).toBe(false);
  });

  test('does not match empty string when all fields are non-empty', () => {
    expect(matchesDdmTemplate(baseItem, '')).toBe(false);
  });

  test('matches empty string when a field is empty (falsy coercion)', () => {
    const itemWithEmptyKey = {...baseItem, templateKey: ''};
    expect(matchesDdmTemplate(itemWithEmptyKey, '')).toBe(true);
  });

  test('handles numeric templateId coercion', () => {
    const item = {...baseItem, templateId: 42};
    expect(matchesDdmTemplate(item, '42')).toBe(true);
  });

  test('handles missing fields via ?? coercion', () => {
    const sparseItem: Record<string, unknown> = {templateKey: 'SPARSE'};
    expect(matchesDdmTemplate(sparseItem, 'SPARSE')).toBe(true);
    expect(matchesDdmTemplate(sparseItem, 'UNKNOWN')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchesAdtRow
// ---------------------------------------------------------------------------

describe('matchesAdtRow', () => {
  const baseRow: AdtRowShape = {
    templateId: 202,
    templateKey: 'FEATURED_ADT',
    displayName: 'Featured Display',
    adtName: 'featured-adt',
  };

  test('matches by templateId as string', () => {
    expect(matchesAdtRow(baseRow, '202')).toBe(true);
  });

  test('matches by ddmTemplate_<templateId>', () => {
    expect(matchesAdtRow(baseRow, 'ddmTemplate_202')).toBe(true);
  });

  test('matches by templateKey', () => {
    expect(matchesAdtRow(baseRow, 'FEATURED_ADT')).toBe(true);
  });

  test('matches by displayName', () => {
    expect(matchesAdtRow(baseRow, 'Featured Display')).toBe(true);
  });

  test('matches by adtName', () => {
    expect(matchesAdtRow(baseRow, 'featured-adt')).toBe(true);
  });

  test('does not match unrelated identifier', () => {
    expect(matchesAdtRow(baseRow, 'UNKNOWN')).toBe(false);
  });

  test('does not match partial templateId without prefix', () => {
    // "20" should not match when templateId is 202
    expect(matchesAdtRow(baseRow, '20')).toBe(false);
  });

  test('handles string templateId correctly', () => {
    const rowWithStringId: AdtRowShape = {...baseRow, templateId: '303'};
    expect(matchesAdtRow(rowWithStringId, '303')).toBe(true);
    expect(matchesAdtRow(rowWithStringId, 'ddmTemplate_303')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// matchesInventoryTemplate
// ---------------------------------------------------------------------------

describe('matchesInventoryTemplate', () => {
  const baseItem: InventoryTemplateShape = {
    id: 'inv-id-1',
    externalReferenceCode: 'ERC-INV-001',
    name: 'Inventory Template',
  };

  test('matches by id', () => {
    expect(matchesInventoryTemplate(baseItem, 'inv-id-1')).toBe(true);
  });

  test('matches by externalReferenceCode', () => {
    expect(matchesInventoryTemplate(baseItem, 'ERC-INV-001')).toBe(true);
  });

  test('matches by name', () => {
    expect(matchesInventoryTemplate(baseItem, 'Inventory Template')).toBe(true);
  });

  test('does not match unrelated identifier', () => {
    expect(matchesInventoryTemplate(baseItem, 'UNKNOWN')).toBe(false);
  });

  test('works when optional fields are absent', () => {
    const minimalItem: InventoryTemplateShape = {id: 'only-id'};
    expect(matchesInventoryTemplate(minimalItem, 'only-id')).toBe(true);
    expect(matchesInventoryTemplate(minimalItem, 'ERC-INV-001')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeAdtIdentifier
// ---------------------------------------------------------------------------

describe('normalizeAdtIdentifier', () => {
  test('returns trimmed id when provided', () => {
    expect(normalizeAdtIdentifier({id: '  101  ', displayStyle: 'ddmTemplate_202', key: 'KEY', name: 'Name'})).toBe(
      '101',
    );
  });

  test('strips ddmTemplate_ prefix from displayStyle', () => {
    expect(normalizeAdtIdentifier({displayStyle: 'ddmTemplate_202', key: 'KEY', name: 'Name'})).toBe('202');
  });

  test('returns displayStyle as-is when no ddmTemplate_ prefix', () => {
    expect(normalizeAdtIdentifier({displayStyle: 'plain-style', key: 'KEY', name: 'Name'})).toBe('plain-style');
  });

  test('trims whitespace from displayStyle before prefix check', () => {
    expect(normalizeAdtIdentifier({displayStyle: '  ddmTemplate_303  '})).toBe('303');
    expect(normalizeAdtIdentifier({displayStyle: 'ddmTemplate_303'})).toBe('303');
  });

  test('falls back to key when id and displayStyle are absent', () => {
    expect(normalizeAdtIdentifier({key: 'MY_KEY', name: 'Name'})).toBe('MY_KEY');
  });

  test('falls back to name when only name is provided', () => {
    expect(normalizeAdtIdentifier({name: 'My Name'})).toBe('My Name');
  });

  test('trims key and name', () => {
    expect(normalizeAdtIdentifier({key: '  PADDED  '})).toBe('PADDED');
    expect(normalizeAdtIdentifier({name: '  Name  '})).toBe('Name');
  });

  test('throws CliError when no field is provided', () => {
    expect(() => normalizeAdtIdentifier({})).toThrow(CliError);
  });

  test('throws CliError when all fields are empty strings', () => {
    expect(() => normalizeAdtIdentifier({id: '', displayStyle: '', key: '', name: ''})).toThrow(CliError);
  });

  test('throws CliError when all fields are whitespace only', () => {
    expect(() => normalizeAdtIdentifier({id: '   ', displayStyle: '   ', key: '   ', name: '   '})).toThrow(CliError);
  });

  test('id has higher precedence than displayStyle', () => {
    expect(normalizeAdtIdentifier({id: 'from-id', displayStyle: 'ddmTemplate_999'})).toBe('from-id');
  });

  test('displayStyle has higher precedence than key', () => {
    expect(normalizeAdtIdentifier({displayStyle: 'from-display', key: 'from-key'})).toBe('from-display');
  });

  test('key has higher precedence than name', () => {
    expect(normalizeAdtIdentifier({key: 'from-key', name: 'from-name'})).toBe('from-key');
  });
});
