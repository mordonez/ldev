import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {formatContentStats, runContentStats} from '../../src/features/liferay/content/liferay-content-stats.js';
import {
  createStaticTokenClient,
  createTestFetchImpl,
  createTestJsonResponse,
  createTestPageResponse,
} from '../../src/testing/cli-test-helpers.js';

const CONFIG = {
  cwd: '/tmp/repo',
  repoRoot: '/tmp/repo',
  dockerDir: '/tmp/repo/docker',
  liferayDir: '/tmp/repo/liferay',
  files: {
    dockerEnv: '/tmp/repo/docker/.env',
    liferayProfile: '/tmp/repo/.liferay-cli.yml',
  },
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'scope-a',
    timeoutSeconds: 30,
  },
};

const TOKEN_CLIENT = createStaticTokenClient({accessToken: 'token-abc'});

describe('liferay-content-stats', () => {
  test('lists top sites by recursive folder volume', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=200')) {
          return createTestPageResponse([
            {id: 100, friendlyUrlPath: '/site-a', nameCurrentValue: 'Site A'},
            {id: 200, friendlyUrlPath: '/site-b', nameCurrentValue: 'Site B'},
          ]);
        }

        if (url.includes('/o/headless-delivery/v1.0/sites/100/structured-content-folders')) {
          return createTestPageResponse([{id: 11, name: 'Folder A', siteId: 100, numberOfStructuredContents: 10}]);
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/200/structured-content-folders')) {
          return createTestPageResponse([{id: 21, name: 'Folder B', siteId: 200, numberOfStructuredContents: 25}]);
        }
        if (url.includes('/structured-content-folders/11/structured-content-folders')) {
          return createTestPageResponse([{id: 12, name: 'Child A', siteId: 100, numberOfStructuredContents: 5}]);
        }
        if (url.includes('/structured-content-folders/12/structured-content-folders')) {
          return createTestPageResponse([]);
        }
        if (url.includes('/structured-content-folders/21/structured-content-folders')) {
          return createTestPageResponse([]);
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await runContentStats(CONFIG, {limit: 10}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.mode).toBe('sites');
    if (result.mode !== 'sites') return;
    expect(result.sites).toHaveLength(2);
    expect(result.skippedSites).toHaveLength(0);
    expect(result.sites[0]?.groupId).toBe(200);
    expect(result.sites[0]?.structuredContents).toBe(25);
    expect(result.sites[1]?.structuredContents).toBe(15);
  });

  test('lists top root folders for one site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return createTestJsonResponse({id: 300, friendlyUrlPath: '/estudis', name: 'Estudis'});
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=0')) {
          return createTestJsonResponse([
            {folderId: 31, name: 'Master'},
            {folderId: 32, name: 'Doctorat'},
          ]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=31')) {
          return createTestJsonResponse([{folderId: 33, name: 'Child'}]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=32')) {
          return createTestJsonResponse([]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=33')) {
          return createTestJsonResponse([]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=300&folderId=31')) {
          return createTestJsonResponse(
            new Array(50).fill(0).map((_, i) => ({
              resourcePrimKey: String(i + 1),
              articleId: `A${i + 1}`,
              folderId: '31',
            })),
          );
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=300&folderId=32')) {
          return createTestJsonResponse(
            new Array(10).fill(0).map((_, i) => ({
              resourcePrimKey: String(i + 101),
              articleId: `B${i + 1}`,
              folderId: '32',
            })),
          );
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=300&folderId=33')) {
          return createTestJsonResponse(
            new Array(20).fill(0).map((_, i) => ({
              resourcePrimKey: String(i + 201),
              articleId: `C${i + 1}`,
              folderId: '33',
            })),
          );
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await runContentStats(CONFIG, {site: '/estudis', limit: 10}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.mode).toBe('folders');
    if (result.mode !== 'folders') return;
    expect(result.groupId).toBe(300);
    expect(result.folders[0]).toMatchObject({
      folderId: 31,
      subtreeStructuredContents: 70,
      childFolderCount: 1,
      directListItems: 51,
      subtreeListItems: 71,
    });
  });

  test('scoped folder stats count descendant folders, not only direct children', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=0')) {
          return createTestJsonResponse([{folderId: 31, name: 'Root'}]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=31')) {
          return createTestJsonResponse([{folderId: 32, name: 'Child'}]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=32')) {
          return createTestJsonResponse([{folderId: 33, name: 'Grandchild'}]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=33')) {
          return createTestJsonResponse([]);
        }
        if (url.includes('folderId=31')) {
          return createTestJsonResponse([]);
        }
        if (url.includes('folderId=32')) {
          return createTestJsonResponse([]);
        }
        if (url.includes('folderId=33')) {
          return createTestJsonResponse([]);
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await runContentStats(CONFIG, {groupId: 300, limit: 10}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.mode).toBe('folders');
    if (result.mode !== 'folders') return;
    expect(result.folders[0]?.childFolderCount).toBe(2);
    expect(result.folders[0]?.subtreeListItems).toBe(2);
  });

  test('includes structure breakdowns in scoped mode when requested', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=0')) {
          return createTestJsonResponse([{folderId: 31, name: 'Master'}]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=31')) {
          return createTestJsonResponse([]);
        }
        if (url.includes('/o/data-engine/v2.0/sites/300/data-definitions/by-content-type/journal')) {
          return createTestPageResponse([
            {id: 501, dataDefinitionKey: 'FITXA', name: 'Fitxa'},
            {id: 502, dataDefinitionKey: 'GRAU', name: 'Grau'},
          ]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=300&folderId=31')) {
          return createTestJsonResponse([
            {resourcePrimKey: '1', articleId: 'A1', folderId: '31', DDMStructureId: '501'},
            {resourcePrimKey: '2', articleId: 'A2', folderId: '31', DDMStructureId: '502'},
          ]);
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await runContentStats(
      CONFIG,
      {groupId: 300, limit: 10, withStructures: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('folders');
    if (result.mode !== 'folders') return;
    expect(result.folders[0]?.structures).toEqual([
      {key: 'FITXA', name: 'Fitxa', count: 1},
      {key: 'GRAU', name: 'Grau', count: 1},
    ]);
  });

  test('scoped folder stats continue pagination when the first page mixes a child folder and articles', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=0')) {
          return createTestJsonResponse([{folderId: 31, name: 'Master'}]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=31')) {
          return createTestJsonResponse([{folderId: 33, name: 'Child'}]);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=300&parentFolderId=33')) {
          return createTestJsonResponse([]);
        }

        if (
          url.includes(
            '/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=300&folderId=31&start=0&end=200',
          )
        ) {
          const items = [
            {folderId: '33', name: 'Child'},
            ...new Array(199).fill(0).map((_, i) => ({
              resourcePrimKey: String(i + 1),
              articleId: `A${i + 1}`,
              folderId: '31',
            })),
          ];
          return createTestJsonResponse(items);
        }

        if (
          url.includes(
            '/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=300&folderId=31&start=200&end=400',
          )
        ) {
          const items = new Array(4).fill(0).map((_, i) => ({
            resourcePrimKey: String(i + 200),
            articleId: `A${i + 200}`,
            folderId: '31',
          }));
          return createTestJsonResponse(items);
        }

        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=300&folderId=33')) {
          const items = new Array(21).fill(0).map((_, i) => ({
            resourcePrimKey: String(i + 500),
            articleId: `C${i + 1}`,
            folderId: '33',
          }));
          return createTestJsonResponse(items);
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await runContentStats(CONFIG, {groupId: 300, limit: 10}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.mode).toBe('folders');
    if (result.mode !== 'folders') return;
    expect(result.folders[0]).toMatchObject({
      folderId: 31,
      directStructuredContents: 203,
      directListItems: 204,
      subtreeStructuredContents: 224,
      subtreeListItems: 225,
    });
  });

  test('excludes sites from global content metrics', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=200')) {
          return createTestPageResponse([
            {id: 100, friendlyUrlPath: '/site-a', nameCurrentValue: 'Site A'},
            {id: 200, friendlyUrlPath: '/site-b', nameCurrentValue: 'Site B'},
          ]);
        }

        if (url.includes('/o/headless-delivery/v1.0/sites/100/structured-content-folders')) {
          return createTestPageResponse([{id: 11, name: 'Folder A', siteId: 100, numberOfStructuredContents: 10}]);
        }
        if (url.includes('/structured-content-folders/11/structured-content-folders')) {
          return createTestPageResponse([]);
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await runContentStats(
      CONFIG,
      {limit: 10, excludeSites: ['/site-b']},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('sites');
    if (result.mode !== 'sites') return;
    expect(result.excludedSites).toEqual(['/site-b']);
    expect(result.sites).toHaveLength(1);
    expect(result.sites[0]?.siteFriendlyUrl).toBe('/site-a');
  });

  test('applies sort-by name in global content metrics', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=200')) {
          return createTestPageResponse([
            {id: 100, friendlyUrlPath: '/z-site', nameCurrentValue: 'Zulu'},
            {id: 200, friendlyUrlPath: '/a-site', nameCurrentValue: 'Alpha'},
          ]);
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/100/structured-content-folders')) {
          return createTestPageResponse([{id: 11, name: 'Folder Z', siteId: 100, numberOfStructuredContents: 50}]);
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/200/structured-content-folders')) {
          return createTestPageResponse([{id: 21, name: 'Folder A', siteId: 200, numberOfStructuredContents: 10}]);
        }
        if (url.includes('/structured-content-folders/11/structured-content-folders')) {
          return createTestPageResponse([]);
        }
        if (url.includes('/structured-content-folders/21/structured-content-folders')) {
          return createTestPageResponse([]);
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await runContentStats(CONFIG, {limit: 10, sortBy: 'name'}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.mode).toBe('sites');
    if (result.mode !== 'sites') return;
    expect(result.sites.map((site) => site.name)).toEqual(['Alpha', 'Zulu']);
  });

  test('formats site stats in text mode', () => {
    const text = formatContentStats({
      ok: true,
      mode: 'sites',
      limit: 10,
      excludedSites: ['/departaments'],
      sites: [
        {
          groupId: 100,
          siteFriendlyUrl: '/site-a',
          name: 'Site A',
          rootFolderCount: 2,
          folderCount: 4,
          structuredContents: 123,
          topFolders: [
            {
              folderId: 11,
              name: 'Folder A',
              directStructuredContents: 10,
              subtreeStructuredContents: 100,
              childFolderCount: 2,
              directListItems: 12,
              subtreeListItems: 102,
            },
          ],
        },
      ],
      skippedSites: [],
    });

    expect(text).toContain('CONTENT_STATS_SITES');
    expect(text).toContain('excludedSites=/departaments');
    expect(text).toContain('groupId=100');
    expect(text).toContain('topFolder=11');
  });

  test('formats folder structure breakdowns in text mode', () => {
    const text = formatContentStats({
      ok: true,
      mode: 'folders',
      limit: 10,
      groupId: 300,
      siteFriendlyUrl: '/estudis',
      excludedSites: [],
      skippedSites: [],
      folders: [
        {
          folderId: 31,
          name: 'Master',
          subtreeStructuredContents: 2,
          directStructuredContents: 2,
          childFolderCount: 0,
          directListItems: 2,
          subtreeListItems: 2,
          structures: [
            {key: 'FITXA', name: 'Fitxa', count: 1},
            {key: 'GRAU', name: 'Grau', count: 1},
          ],
        },
      ],
    });

    expect(text).toContain('CONTENT_STATS_FOLDERS');
    expect(text).toContain('directListItems=2');
    expect(text).toContain('subtreeListItems=2');
    expect(text).toContain('structure=FITXA (Fitxa) count=1');
    expect(text).toContain('structure=GRAU (Grau) count=1');
  });
});
