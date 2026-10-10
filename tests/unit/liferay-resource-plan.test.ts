import {describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {WhereUsedRunResult} from '../../src/core/contracts/inventory.schema.js';
import {LiferayErrorCode} from '../../src/features/liferay/errors/liferay-error-codes.js';
import type {LiferayInventoryStructuresResult} from '../../src/features/liferay/inventory/liferay-inventory-structures.js';
import type {LiferayInventoryTemplate} from '../../src/features/liferay/inventory/liferay-inventory-templates.js';
import type {LiferayResourceAdtRow} from '../../src/features/liferay/resource/liferay-resource-list-adts.js';
import type {LiferayResourceFragmentRow} from '../../src/features/liferay/resource/liferay-resource-list-fragments.js';
import {
  formatLiferayResourcePlan,
  runLiferayResourcePlan,
  type ResourcePlanPrimitives,
} from '../../src/features/liferay/resource/liferay-resource-plan.js';

const CONFIG = {} as AppConfig;

const SITE_GLOBAL = {groupId: 20121, siteFriendlyUrl: '/global', name: 'Global', pagesCommand: ''};
const SITE_UB = {groupId: 30000, siteFriendlyUrl: '/ub', name: 'Universitat de Barcelona', pagesCommand: ''};

function structuresResult(rows: Array<{id: number; key: string; name: string}>): LiferayInventoryStructuresResult {
  return {
    sites: [
      {
        siteGroupId: SITE_GLOBAL.groupId,
        siteFriendlyUrl: SITE_GLOBAL.siteFriendlyUrl,
        siteName: 'Global',
        structures: rows,
      },
    ],
    summary: {totalSites: 1, totalStructures: rows.length},
  };
}

function emptyStructures(site: {
  groupId: number;
  siteFriendlyUrl: string;
  name: string;
}): LiferayInventoryStructuresResult {
  return {
    sites: [{siteGroupId: site.groupId, siteFriendlyUrl: site.siteFriendlyUrl, siteName: site.name, structures: []}],
    summary: {totalSites: 1, totalStructures: 0},
  };
}

function whereUsedFound(): WhereUsedRunResult {
  return {
    inventoryType: 'whereUsed',
    query: {type: 'structure', keys: ['BASIC']},
    scope: {
      sites: ['/global'],
      includePrivate: false,
      concurrency: 4,
      maxDepth: 12,
      siteOrder: 'site',
      excludedSites: [],
      plan: false,
    },
    summary: {totalSites: 1, totalScannedPages: 3, totalMatchedPages: 1, totalFailedPages: 0, totalMatches: 1},
    sites: [
      {
        siteFriendlyUrl: '/global',
        siteName: 'Global',
        groupId: 20121,
        scannedPages: 3,
        failedPages: 0,
        matchedPages: [
          {
            pageType: 'regularPage',
            pageName: 'Home',
            friendlyUrl: '/home',
            fullUrl: 'http://localhost:8080/web/guest/home',
            privateLayout: false,
            matches: [
              {
                resourceType: 'structure',
                matchedKey: 'BASIC',
                matchKind: 'journalArticleStructure',
                label: 'BASIC',
                detail: 'structure',
                source: 'journalArticle',
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildPrimitives(overrides: Partial<ResourcePlanPrimitives> = {}): ResourcePlanPrimitives {
  return {
    listSites: vi.fn(() => Promise.resolve([SITE_GLOBAL])),
    listStructures: vi.fn(() => Promise.resolve(emptyStructures(SITE_GLOBAL))),
    listTemplates: vi.fn(() => Promise.resolve<LiferayInventoryTemplate[]>([])),
    listAdts: vi.fn(() => Promise.resolve<LiferayResourceAdtRow[]>([])),
    listFragments: vi.fn(() => Promise.resolve<LiferayResourceFragmentRow[]>([])),
    whereUsed: vi.fn(() => Promise.resolve(whereUsedFound())),
    ...overrides,
  };
}

describe('runLiferayResourcePlan', () => {
  test('rejects an empty resource id', async () => {
    await expect(runLiferayResourcePlan(CONFIG, {resource: '  '}, {primitives: buildPrimitives()})).rejects.toThrow(
      /non-empty resource/,
    );
  });

  test('rejects an invalid --type', async () => {
    await expect(
      runLiferayResourcePlan(CONFIG, {resource: 'BASIC', type: 'bogus'}, {primitives: buildPrimitives()}),
    ).rejects.toThrow(/--type must be one of/);
  });

  test('throws when the resource is not found in any type', async () => {
    await expect(
      runLiferayResourcePlan(CONFIG, {resource: 'MISSING'}, {primitives: buildPrimitives()}),
    ).rejects.toMatchObject({code: LiferayErrorCode.RESOURCE_ERROR});
  });

  test('throws an ambiguous-type error when the key matches more than one resource type', async () => {
    const primitives = buildPrimitives({
      listStructures: vi.fn(() => Promise.resolve(structuresResult([{id: 1, key: 'DUP', name: 'Dup structure'}]))),
      listTemplates: vi.fn(() =>
        Promise.resolve<LiferayInventoryTemplate[]>([
          {id: '2', name: 'Dup template', contentStructureId: 1, externalReferenceCode: 'DUP'},
        ]),
      ),
    });

    await expect(runLiferayResourcePlan(CONFIG, {resource: 'DUP'}, {primitives})).rejects.toThrow(
      /is ambiguous.*--type/,
    );
  });

  test('resolves owner, reports no duplicates, and scans usage for a single match', async () => {
    const primitives = buildPrimitives({
      listStructures: vi.fn(() => Promise.resolve(structuresResult([{id: 1, key: 'BASIC', name: 'Basic structure'}]))),
    });

    const result = await runLiferayResourcePlan(CONFIG, {resource: 'BASIC'}, {primitives});

    expect(result.resolved).toEqual({type: 'structure', key: 'BASIC', matchedBy: 'key'});
    expect(result.owner).toMatchObject({siteFriendlyUrl: '/global', id: '1', name: 'Basic structure'});
    expect(result.ownerAmbiguous).toBe(false);
    expect(result.duplicates).toEqual({duplicated: false, count: 1, occurrences: result.duplicates.occurrences});
    expect(result.usage.scanned).toBe(true);
    if (result.usage.scanned) {
      expect(result.usage.totalMatchedPages).toBe(1);
      expect(result.usage.pages).toHaveLength(1);
    }
    expect(result.suggestedImport).toEqual({
      command: 'ldev resource import-structure --site /global --structure BASIC --check-only',
      checkOnly: true,
      notes: [],
    });
    expect(result.validation.steps.length).toBeGreaterThan(0);
    expect(primitives.whereUsed).toHaveBeenCalledWith(
      CONFIG,
      expect.objectContaining({type: 'structure', keys: ['BASIC']}),
      {primitives},
    );
  });

  test('flags duplicates across sites and defaults the owner to /global', async () => {
    const primitives = buildPrimitives({
      listSites: vi.fn(() => Promise.resolve([SITE_GLOBAL, SITE_UB])),
      listStructures: vi.fn((_config: AppConfig, options?: {site?: string}) => {
        if (options?.site === '/ub') {
          return Promise.resolve(structuresResult([{id: 99, key: 'BASIC', name: 'UB basic'}]));
        }
        return Promise.resolve(structuresResult([{id: 1, key: 'BASIC', name: 'Basic structure'}]));
      }),
    });

    const result = await runLiferayResourcePlan(CONFIG, {resource: 'BASIC', skipUsage: true}, {primitives});

    expect(result.duplicates.duplicated).toBe(true);
    expect(result.duplicates.count).toBe(2);
    expect(result.owner.siteFriendlyUrl).toBe('/global');
    expect(result.suggestedImport.notes[0]).toMatch(/exists in 2 sites/);
    expect(result.usage).toEqual({
      scanned: false,
      reason: 'Usage scan skipped (--skip-usage).',
      suggestedCommand: 'ldev portal inventory where-used --type structure --key BASIC',
    });
  });

  test('suggests a non-check-only import for fragments with a note about export baseline', async () => {
    const primitives = buildPrimitives({
      listFragments: vi.fn(() =>
        Promise.resolve<LiferayResourceFragmentRow[]>([
          {
            fragmentId: 5,
            fragmentKey: 'card-hero',
            fragmentName: 'Card Hero',
            collectionId: 1,
            collectionName: 'Marketing',
            collectionKey: 'marketing',
            collectionDescription: '',
            icon: '',
            type: 1,
          },
        ]),
      ),
    });

    const result = await runLiferayResourcePlan(CONFIG, {resource: 'card-hero', type: 'fragment'}, {primitives});

    expect(result.resolved.type).toBe('fragment');
    expect(result.suggestedImport.checkOnly).toBe(false);
    expect(result.suggestedImport.command).toBe('ldev resource import-fragment --site /global --fragment card-hero');
    expect(result.suggestedImport.notes.some((note) => note.includes('no --check-only preview'))).toBe(true);
  });

  test('rejects an unknown --site filter', async () => {
    await expect(
      runLiferayResourcePlan(CONFIG, {resource: 'BASIC', sites: ['/nope']}, {primitives: buildPrimitives()}),
    ).rejects.toMatchObject({code: LiferayErrorCode.INVENTORY_SITE_NOT_FOUND});
  });

  test('reports a scan failure without throwing when where-used fails', async () => {
    const primitives = buildPrimitives({
      listStructures: vi.fn(() => Promise.resolve(structuresResult([{id: 1, key: 'BASIC', name: 'Basic structure'}]))),
      whereUsed: vi.fn(() => Promise.reject(new Error('boom'))),
    });

    const result = await runLiferayResourcePlan(CONFIG, {resource: 'BASIC'}, {primitives});

    expect(result.usage).toEqual({
      scanned: false,
      reason: 'Usage scan failed: boom',
      suggestedCommand: 'ldev portal inventory where-used --type structure --key BASIC',
    });
  });
});

describe('formatLiferayResourcePlan', () => {
  test('renders a readable text report', async () => {
    const primitives = buildPrimitives({
      listStructures: vi.fn(() => Promise.resolve(structuresResult([{id: 1, key: 'BASIC', name: 'Basic structure'}]))),
    });

    const result = await runLiferayResourcePlan(CONFIG, {resource: 'BASIC'}, {primitives});
    const text = formatLiferayResourcePlan(result);

    expect(text).toContain('plan resource=BASIC type=structure key=BASIC');
    expect(text).toContain('Owner:');
    expect(text).toContain('Duplicates: none');
    expect(text).toContain('Usage: 1 matched pages');
    expect(text).toContain('Suggested import:');
    expect(text).toContain('ldev resource import-structure --site /global --structure BASIC --check-only');
    expect(text).toContain('Validation steps:');
  });
});
