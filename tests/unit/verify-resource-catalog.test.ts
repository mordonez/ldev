import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {resolveProjectContext} from '../../src/core/config/project-context.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';
import {
  collectLocalResourceCatalog,
  diffEvidenceAgainstCatalog,
} from '../../src/features/verify/verify-resource-catalog.js';
import type {PageEvidence} from '../../src/features/liferay/inventory/liferay-inventory-evidence-contract.js';

function buildEvidence(overrides: Partial<PageEvidence>): PageEvidence {
  return {
    resourceType: 'fragment',
    key: 'hero-banner',
    kind: 'fragmentEntry',
    detail: 'fragment hero-banner',
    source: 'fragmentEntryLink',
    ...overrides,
  };
}

describe('collectLocalResourceCatalog', () => {
  test('returns an empty catalog when the repo has no resource directories', () => {
    const repoRoot = createTempRepo();
    const project = resolveProjectContext({cwd: repoRoot});

    const catalog = collectLocalResourceCatalog(project);

    expect(catalog).toEqual({});
  });

  test('collects file basenames per resource type when directories exist', () => {
    const repoRoot = createTempRepo();
    fs.mkdirSync(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'article.json'), '{}');

    const project = resolveProjectContext({cwd: repoRoot});
    const catalog = collectLocalResourceCatalog(project);

    expect(catalog.structure?.has('article')).toBe(true);
    expect(catalog.template).toBeUndefined();
  });

  test('collects fragment directory names, not the file basenames inside them', () => {
    const repoRoot = createTempRepo();
    const fragmentDir = path.join(
      repoRoot,
      'liferay',
      'fragments',
      'sites',
      'global',
      'src',
      'hero-collection',
      'fragments',
      'hero-banner',
    );
    fs.mkdirSync(fragmentDir, {recursive: true});
    fs.writeFileSync(path.join(fragmentDir, 'fragment.json'), '{}');
    fs.writeFileSync(path.join(fragmentDir, 'configuration.json'), '{}');
    fs.writeFileSync(path.join(fragmentDir, 'index.html'), '<div></div>');

    const project = resolveProjectContext({cwd: repoRoot});
    const catalog = collectLocalResourceCatalog(project);

    expect(catalog.fragment?.has('hero-banner')).toBe(true);
    expect(catalog.fragment?.has('index')).toBe(false);
    expect(catalog.fragment?.has('configuration')).toBe(false);
  });
});

describe('diffEvidenceAgainstCatalog', () => {
  test('marks the result as skipped when the project has no catalog for any evidence resource type', () => {
    const result = diffEvidenceAgainstCatalog([buildEvidence({})], {});

    expect(result.status).toBe('skipped');
    expect(result.diffs).toEqual([]);
  });

  test('passes when every evidence entry has a matching local resource', () => {
    const result = diffEvidenceAgainstCatalog([buildEvidence({resourceType: 'fragment', key: 'hero-banner'})], {
      fragment: new Set(['hero-banner']),
    });

    expect(result.status).toBe('pass');
    expect(result.diffs).toEqual([]);
  });

  test('reports a diff for evidence keys missing from the local catalog', () => {
    const result = diffEvidenceAgainstCatalog([buildEvidence({resourceType: 'fragment', key: 'missing-fragment'})], {
      fragment: new Set(['hero-banner']),
    });

    expect(result.status).toBe('fail');
    expect(result.diffs).toEqual([expect.objectContaining({resourceType: 'fragment', key: 'missing-fragment'})]);
  });

  test('ignores evidence resource types that have no tracked local catalog', () => {
    const result = diffEvidenceAgainstCatalog(
      [
        buildEvidence({resourceType: 'portlet', key: 'some-portlet'}),
        buildEvidence({resourceType: 'fragment', key: 'hero-banner'}),
      ],
      {fragment: new Set(['hero-banner'])},
    );

    expect(result.status).toBe('pass');
    expect(result.diffs).toEqual([]);
  });

  test('ignores fragments from Liferay out-of-the-box collections (e.g. Basic Components)', () => {
    const result = diffEvidenceAgainstCatalog(
      [buildEvidence({resourceType: 'fragment', key: 'BASIC_COMPONENT-image'})],
      {fragment: new Set(['hero-banner'])},
    );

    expect(result.status).toBe('pass');
    expect(result.diffs).toEqual([]);
  });

  test('strips the ddmTemplate_ prefix before matching adt evidence against the local catalog', () => {
    const result = diffEvidenceAgainstCatalog(
      [buildEvidence({resourceType: 'adt', key: 'ddmTemplate_UB_ADT_FOO', kind: 'widgetAdt'})],
      {adt: new Set(['UB_ADT_FOO'])},
    );

    expect(result.status).toBe('pass');
    expect(result.diffs).toEqual([]);
  });

  test('does not flag the numeric contentStructureId candidate when a sibling entry has the real key', () => {
    // buildContentStructureEvidence emits both forms so `where-used` can match on either;
    // for the catalog diff they're the same physical structure file.
    const result = diffEvidenceAgainstCatalog(
      [
        buildEvidence({
          resourceType: 'structure',
          key: 'UB_STR_FOO',
          kind: 'contentStructure',
          context: {contentStructureId: 301, contentStructureName: 'Foo'},
        }),
        buildEvidence({
          resourceType: 'structure',
          key: '301',
          kind: 'contentStructure',
          context: {contentStructureId: 301, contentStructureName: 'Foo'},
        }),
      ],
      {structure: new Set(['UB_STR_FOO'])},
    );

    expect(result.status).toBe('pass');
    expect(result.diffs).toEqual([]);
  });

  test('still flags a numeric-only contentStructureId candidate that has no keyed sibling', () => {
    const result = diffEvidenceAgainstCatalog(
      [
        buildEvidence({
          resourceType: 'structure',
          key: '301',
          kind: 'contentStructure',
          context: {contentStructureId: 301, contentStructureName: 'Foo'},
        }),
      ],
      {structure: new Set(['UB_STR_OTHER'])},
    );

    expect(result.status).toBe('fail');
    expect(result.diffs).toEqual([expect.objectContaining({resourceType: 'structure', key: '301'})]);
  });
});
