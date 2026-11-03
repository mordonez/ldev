import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  runLiferayInventoryClientExtensions,
  runLiferayInventoryObjects,
  runLiferayInventoryPicklists,
  runLiferayInventorySpaces,
  runLiferayInventoryVocabularies,
} from '../../src/features/liferay/inventory/liferay-inventory-resource-types.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CONFIG = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: null,
  liferayDir: null,
  files: {dockerEnv: null, liferayProfile: null},
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'id',
    oauth2ClientSecret: 's',
    scopeAliases: '',
    timeoutSeconds: 5,
  },
};

// Shapes captured from DXP 2026.q3.9.
const ROUTES: Record<string, unknown> = {
  '/o/object-admin/v1.0/object-definitions': {
    items: [
      {
        id: 2,
        externalReferenceCode: 'TEACHER',
        name: 'Teacher',
        scope: 'company',
        status: {code: 0, label: 'approved'},
        restContextPath: '/o/c/teachers',
        objectFields: [
          {name: 'fullName', businessType: 'Text', system: false},
          {name: 'r_courseTeacher_c_courseId', businessType: 'Relationship', system: false},
          {name: 'createDate', system: true},
        ],
      },
      {
        id: 1,
        externalReferenceCode: 'COURSE',
        name: 'Course',
        scope: 'company',
        status: {code: 0, label: 'approved'},
        restContextPath: '/o/c/courses',
        objectFields: [{name: 'level', businessType: 'Picklist', listTypeDefinitionExternalReferenceCode: 'LEVELS'}],
      },
    ],
    lastPage: 1,
  },
  '/o/object-admin/v1.0/object-definitions/1/object-relationships': {
    items: [
      {name: 'courseTeacher', type: 'oneToMany', objectDefinitionExternalReferenceCode2: 'TEACHER'},
      {name: 'enrollmentCourse', reverse: true},
    ],
    lastPage: 1,
  },
  '/o/object-admin/v1.0/object-definitions/2/object-relationships': {items: [], lastPage: 1},
  '/o/headless-admin-list-type/v1.0/list-type-definitions': {
    items: [{id: 5, externalReferenceCode: 'LEVELS', name: 'Levels'}],
    lastPage: 1,
  },
  '/o/headless-admin-list-type/v1.0/list-type-definitions/5/list-type-entries': {
    items: [{key: 'master'}, {key: 'degree'}],
    lastPage: 1,
  },
  '/o/headless-admin-taxonomy/v1.0/sites/20/taxonomy-vocabularies': {
    items: [
      {
        id: 9,
        externalReferenceCode: 'TOPICS',
        name: 'Topics',
        numberOfTaxonomyCategories: 3,
        assetTypes: [{type: 'AllAssetTypes'}],
      },
    ],
    lastPage: 1,
  },
  '/o/headless-asset-library/v1.0/asset-libraries': {
    items: [{id: 4, externalReferenceCode: 'SPACE', name: 'Space', type: 'AssetLibrary'}],
    lastPage: 1,
  },
};

const dependencies = {
  apiClient: createLiferayApiClient({
    fetchImpl: createTestFetchImpl((url) => {
      const {pathname} = new URL(url);
      if (pathname.includes('/sites/by-friendly-url-path/') || pathname.includes('/group/get-group')) {
        return new Response(JSON.stringify({id: 20, friendlyUrlPath: '/global', name: 'Global', companyId: 1}));
      }
      if (pathname in ROUTES) {
        return new Response(JSON.stringify(ROUTES[pathname]));
      }
      throw new Error(`Unexpected ${url}`);
    }),
  }),
  tokenClient: createStaticTokenClient(),
};

describe('inventory for client-extension-first resource types', () => {
  test('objects: custom fields only, forward relationships and referenced picklists, sorted by ERC', async () => {
    const result = await runLiferayInventoryObjects(CONFIG, dependencies);

    expect(result.objects).toEqual([
      expect.objectContaining({
        externalReferenceCode: 'COURSE',
        fields: ['level'],
        relationships: [{name: 'courseTeacher', type: 'oneToMany', target: 'TEACHER'}],
        picklists: ['LEVELS'],
        status: 'approved',
      }),
      expect.objectContaining({externalReferenceCode: 'TEACHER', fields: ['fullName'], relationships: []}),
    ]);
  });

  test('picklists, vocabularies and spaces by ERC', async () => {
    expect((await runLiferayInventoryPicklists(CONFIG, dependencies)).picklists).toEqual([
      {id: 5, externalReferenceCode: 'LEVELS', name: 'Levels', entryKeys: ['degree', 'master']},
    ]);
    expect(await runLiferayInventoryVocabularies(CONFIG, {}, dependencies)).toMatchObject({
      siteFriendlyUrl: '/global',
      vocabularies: [{externalReferenceCode: 'TOPICS', categories: 3, assetTypes: ['AllAssetTypes']}],
    });
    expect((await runLiferayInventorySpaces(CONFIG, dependencies)).spaces).toEqual([
      {id: 4, externalReferenceCode: 'SPACE', name: 'Space', type: 'AssetLibrary'},
    ]);
  });

  test('client extensions come from the workspace even without a running portal', async () => {
    const liferayDir = path.join(createTempDir('ldev-inv-cx-'), 'liferay');
    await fs.outputFile(
      path.join(liferayDir, 'client-extensions', 'ub-theme-css', 'client-extension.yaml'),
      'ub-theme-css:\n    type: globalCSS\n',
    );

    const result = await runLiferayInventoryClientExtensions({...CONFIG, liferayDir});

    expect(result.clientExtensions).toEqual([
      {name: 'ub-theme-css', types: ['globalCSS'], bundle: 'ubthemecss', state: 'NOT_DEPLOYED', batchFiles: []},
    ]);
  });
});
