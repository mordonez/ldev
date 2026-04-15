import {describe, expect, test} from 'vitest';

import {
  toDdmTemplatePayload,
  toFragmentCollectionPayload,
  toFragmentEntryPayload,
} from '../../src/features/liferay/resource/liferay-resource-payloads.js';

// ---------------------------------------------------------------------------
// toDdmTemplatePayload
// ---------------------------------------------------------------------------

describe('toDdmTemplatePayload', () => {
  test('full payload', () => {
    const raw = {
      templateId: '40801',
      templateKey: 'NEWS_TEMPLATE',
      externalReferenceCode: 'erc-news',
      nameCurrentValue: 'News Template',
      name: 'News',
      classPK: '301',
      classNameId: 1001,
      script: '<#-- ftl -->',
      language: 'ftl',
      type: 'display',
      mode: '',
    };
    const result = toDdmTemplatePayload(raw);
    expect(result.templateId).toBe('40801');
    expect(result.templateKey).toBe('NEWS_TEMPLATE');
    expect(result.externalReferenceCode).toBe('erc-news');
    expect(result.nameCurrentValue).toBe('News Template');
    expect(result.classPK).toBe('301');
    expect(result.classNameId).toBe(1001);
    expect(result.script).toBe('<#-- ftl -->');
    expect(result.language).toBe('ftl');
    expect(result.type).toBe('display');
  });

  test('minimal payload — only templateKey', () => {
    const result = toDdmTemplatePayload({templateKey: 'MY_TEMPLATE'});
    expect(result.templateKey).toBe('MY_TEMPLATE');
    expect(result.templateId).toBeUndefined();
    expect(result.externalReferenceCode).toBeUndefined();
    expect(result.nameCurrentValue).toBeUndefined();
    expect(result.script).toBeUndefined();
  });

  test('empty object — all fields undefined', () => {
    const result = toDdmTemplatePayload({});
    expect(result.templateId).toBeUndefined();
    expect(result.templateKey).toBeUndefined();
    expect(result.script).toBeUndefined();
  });

  test('null input returns empty object', () => {
    expect(toDdmTemplatePayload(null)).toEqual({});
    expect(toDdmTemplatePayload(undefined)).toEqual({});
  });

  test('numeric templateId coerced to string', () => {
    const result = toDdmTemplatePayload({templateId: 40801, classPK: 301});
    expect(result.templateId).toBe('40801');
    expect(result.classPK).toBe('301');
  });

  test('empty string fields return undefined (trimmed)', () => {
    const result = toDdmTemplatePayload({templateKey: '   ', nameCurrentValue: ''});
    expect(result.templateKey).toBeUndefined();
    expect(result.nameCurrentValue).toBeUndefined();
  });

  test('empty script preserved as-is (valid empty template)', () => {
    const result = toDdmTemplatePayload({script: ''});
    // script uses String coercion without asStr (preserves empty)
    expect(result.script).toBe('');
  });
});

// ---------------------------------------------------------------------------
// toFragmentCollectionPayload
// ---------------------------------------------------------------------------

describe('toFragmentCollectionPayload', () => {
  test('full payload', () => {
    const raw = {fragmentCollectionId: 10, fragmentCollectionKey: 'marketing', name: 'Marketing', description: 'Mkt'};
    const result = toFragmentCollectionPayload(raw);
    expect(result.fragmentCollectionId).toBe(10);
    expect(result.fragmentCollectionKey).toBe('marketing');
    expect(result.name).toBe('Marketing');
    expect(result.description).toBe('Mkt');
  });

  test('minimal payload — only name', () => {
    const result = toFragmentCollectionPayload({name: 'My Collection'});
    expect(result.name).toBe('My Collection');
    expect(result.fragmentCollectionId).toBeUndefined();
    expect(result.fragmentCollectionKey).toBeUndefined();
  });

  test('null input returns empty object', () => {
    expect(toFragmentCollectionPayload(null)).toEqual({});
    expect(toFragmentCollectionPayload(undefined)).toEqual({});
  });

  test('string fragmentCollectionId coerced to number', () => {
    const result = toFragmentCollectionPayload({fragmentCollectionId: '42'});
    expect(result.fragmentCollectionId).toBe(42);
  });

  test('empty description preserved as empty string', () => {
    const result = toFragmentCollectionPayload({description: ''});
    // description uses String coercion, empty string preserved
    expect(result.description).toBe('');
  });

  test('empty fragmentCollectionKey trimmed to undefined', () => {
    const result = toFragmentCollectionPayload({fragmentCollectionKey: '  '});
    expect(result.fragmentCollectionKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toFragmentEntryPayload
// ---------------------------------------------------------------------------

describe('toFragmentEntryPayload', () => {
  test('full payload', () => {
    const raw = {
      fragmentEntryId: 5,
      fragmentEntryKey: 'hero-banner',
      name: 'Hero Banner',
      html: '<div>hero</div>',
      css: '.hero{}',
      js: 'console.log("hero");',
      configuration: '{}',
      icon: 'square',
      type: 1,
    };
    const result = toFragmentEntryPayload(raw);
    expect(result.fragmentEntryId).toBe(5);
    expect(result.fragmentEntryKey).toBe('hero-banner');
    expect(result.name).toBe('Hero Banner');
    expect(result.html).toBe('<div>hero</div>');
    expect(result.css).toBe('.hero{}');
    expect(result.js).toBe('console.log("hero");');
    expect(result.configuration).toBe('{}');
    expect(result.icon).toBe('square');
    expect(result.type).toBe(1);
  });

  test('empty html/css/js preserved as empty strings', () => {
    const result = toFragmentEntryPayload({html: '', css: '', js: ''});
    expect(result.html).toBe('');
    expect(result.css).toBe('');
    expect(result.js).toBe('');
  });

  test('missing html/css/js return undefined', () => {
    const result = toFragmentEntryPayload({name: 'Fragment'});
    expect(result.html).toBeUndefined();
    expect(result.css).toBeUndefined();
    expect(result.js).toBeUndefined();
    expect(result.configuration).toBeUndefined();
  });

  test('null input returns empty object', () => {
    expect(toFragmentEntryPayload(null)).toEqual({});
    expect(toFragmentEntryPayload(undefined)).toEqual({});
  });

  test('string fragmentEntryId coerced to number', () => {
    const result = toFragmentEntryPayload({fragmentEntryId: '99'});
    expect(result.fragmentEntryId).toBe(99);
  });

  test('non-numeric fragmentEntryId returns undefined', () => {
    const result = toFragmentEntryPayload({fragmentEntryId: 'invalid'});
    expect(result.fragmentEntryId).toBeUndefined();
  });

  test('type coerced from string', () => {
    const result = toFragmentEntryPayload({type: '1'});
    expect(result.type).toBe(1);
  });

  test('empty key trimmed to undefined', () => {
    const result = toFragmentEntryPayload({fragmentEntryKey: '  ', name: ''});
    expect(result.fragmentEntryKey).toBeUndefined();
    expect(result.name).toBeUndefined();
  });

  test('all fields undefined on completely unknown payload', () => {
    const result = toFragmentEntryPayload({unknownField: 'value'});
    expect(result.fragmentEntryId).toBeUndefined();
    expect(result.fragmentEntryKey).toBeUndefined();
    expect(result.name).toBeUndefined();
    expect(result.html).toBeUndefined();
  });
});
