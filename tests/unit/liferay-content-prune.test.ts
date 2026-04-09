import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatContentPrune,
  runContentPrune,
  type ContentPruneResult,
} from '../../src/features/liferay/content/liferay-content-prune.js';

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

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-abc',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

// Minimal fake site response
function siteResp(id: number, path: string) {
  return new Response(JSON.stringify({id, friendlyUrlPath: path, name: 'Test Site'}), {status: 200});
}

// Folder response with numberOfStructuredContents
function folderResp(id: number, siteId: number, articleCount = 0) {
  return new Response(JSON.stringify({id, name: `Folder ${id}`, siteId, numberOfStructuredContents: articleCount}), {
    status: 200,
  });
}

// Paged response helper
function paged<T>(items: T[], lastPage = 1) {
  return new Response(JSON.stringify({items, lastPage}), {status: 200});
}

const STRUCTURES = [
  {id: 301, dataDefinitionKey: 'FITXA', name: {ca_ES: 'Fitxa'}},
  {id: 302, dataDefinitionKey: 'GRAU', name: {ca_ES: 'Grau'}},
];

const ARTICLES_FITXA = [
  {id: 1001, title: 'Fitxa A', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 301},
  {id: 1002, title: 'Fitxa B', dateModified: '2024-02-01T10:00:00Z', contentStructureId: 301},
  {id: 1003, title: 'Fitxa C', dateModified: '2024-01-01T10:00:00Z', contentStructureId: 301},
];

function toJsonwsArticles(
  articles: Array<{id: number; title: string; dateModified: string; contentStructureId: number}>,
  folderId: number,
  groupId = 20200,
) {
  return articles.map((article) => ({
    resourcePrimKey: String(article.id),
    articleId: String(article.id),
    folderId: String(folderId),
    groupId: String(groupId),
    DDMStructureId: String(article.contentStructureId),
    modifiedDate: new Date(article.dateModified).getTime(),
    titleCurrentValue: article.title,
    status: 0,
  }));
}

function folderArticlesResp(
  url: string,
  articles: Array<{id: number; title: string; dateModified: string; contentStructureId: number}>,
  folderId: number,
  groupId = 20200,
) {
  const parsed = new URL(url);
  const start = Number(parsed.searchParams.get('start') ?? '0');
  const end = Number(parsed.searchParams.get('end') ?? String(articles.length));
  return new Response(JSON.stringify(toJsonwsArticles(articles.slice(start, end), folderId, groupId)), {status: 200});
}

function makeApiClient(overrides: Record<string, () => Response>) {
  return createLiferayApiClient({
    fetchImpl: async (input) => {
      const url = String(input);
      for (const [pattern, handler] of Object.entries(overrides)) {
        if (url.includes(pattern)) return handler();
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
}

describe('liferay-content-prune: argument validation', () => {
  test('throws when neither --site nor --group-id is given', async () => {
    const apiClient = makeApiClient({});
    await expect(
      runContentPrune(CONFIG, {rootFolders: [12345]}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow();
  });

  test('throws when both --site and --group-id are given', async () => {
    const apiClient = makeApiClient({});
    await expect(
      runContentPrune(
        CONFIG,
        {site: '/estudis', groupId: 20200, rootFolders: [12345]},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow();
  });
});

describe('liferay-content-prune: dry-run', () => {
  test('dry-run returns plan without deleting anything', async () => {
    const deletedUrls: string[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'DELETE') {
          deletedUrls.push(url);
          return new Response('', {status: 204});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('dry-run');
    expect(result.groupId).toBe(20200);
    expect(result.siteFriendlyUrl).toBe('/estudis');
    expect(result.articleCount).toBe(3);
    expect(result.deletedCount).toBe(3);
    expect(result.keptCount).toBe(0);
    expect(deletedUrls).toHaveLength(0); // nothing deleted
  });

  test('dry-run with --keep 1 keeps the most recent article per structure', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], keep: 1, dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.keptCount).toBe(1);
    expect(result.deletedCount).toBe(2);

    // The kept article should be the most recent (Fitxa A, 2024-03-01)
    const fitxaSummary = result.structures.find((s) => s.key === 'FITXA');
    expect(fitxaSummary?.kept).toBe(1);
    expect(fitxaSummary?.deleted).toBe(2);

    // Sample should not include the kept article
    expect(result.sampleArticles.every((a) => a.action === 'delete')).toBe(true);
  });

  test('keep defaults to per-folder across multiple folders', async () => {
    const folderOneArticles = [
      {id: 1001, title: 'Fitxa A1', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 301},
      {id: 1002, title: 'Fitxa A2', dateModified: '2024-02-01T10:00:00Z', contentStructureId: 301},
    ];
    const folderTwoArticles = [
      {id: 2001, title: 'Fitxa B1', dateModified: '2024-03-03T10:00:00Z', contentStructureId: 301},
      {id: 2002, title: 'Fitxa B2', dateModified: '2024-02-03T10:00:00Z', contentStructureId: 301},
    ];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, folderOneArticles.length);
        }
        if (url.includes('/structured-content-folders/67890') && !url.includes('structured-content-folders/67890/')) {
          return folderResp(67890, 20200, folderTwoArticles.length);
        }
        if (
          url.includes('/structured-content-folders/12345/structured-content-folders') ||
          url.includes('/structured-content-folders/67890/structured-content-folders')
        ) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') &&
          url.includes('folderId=12345')
        ) {
          return folderArticlesResp(url, folderOneArticles, 12345);
        }
        if (
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') &&
          url.includes('folderId=67890')
        ) {
          return folderArticlesResp(url, folderTwoArticles, 67890);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345, 67890], keep: 1, dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.keptCount).toBe(2);
    expect(result.deletedCount).toBe(2);
    expect(result.structures[0]?.kept).toBe(2);
    expect(result.structures[0]?.deleted).toBe(2);
  });

  test('dry-run aggregates JSONWS article pages beyond the first slice', async () => {
    const pagedArticles = Array.from({length: 205}, (_, index) => ({
      id: 5000 + index,
      title: `Fitxa ${index + 1}`,
      dateModified: `2024-03-${String((index % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      contentStructureId: 301,
    }));

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, pagedArticles.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, pagedArticles, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.articleCount).toBe(205);
    expect(result.deletedCount).toBe(205);
  });

  test('dry-run ignores folder rows returned by get-folders-and-articles', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, 1);
        }
        if (url.includes('/structured-content-folders/67890') && !url.includes('structured-content-folders/67890/')) {
          return folderResp(67890, 20200, 0);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([{id: 67890, name: 'Child', siteId: 20200, numberOfStructuredContents: 0}]);
        }
        if (url.includes('/structured-content-folders/67890/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') &&
          url.includes('folderId=12345')
        ) {
          return new Response(
            JSON.stringify([
              {folderId: '67890', name: 'Child Folder', description: ''},
              ...toJsonwsArticles(
                [{id: 1001, title: 'Root Article', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 301}],
                12345,
              ),
            ]),
            {status: 200},
          );
        }
        if (
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') &&
          url.includes('folderId=67890')
        ) {
          return new Response(JSON.stringify([{folderId: '99999', name: 'Nested Folder', description: ''}]), {
            status: 200,
          });
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.articleCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    expect(result.sampleArticles[0]?.id).toBe(1001);
  });

  test('dry-run deduplicates repeated article rows by resource primary key', async () => {
    const duplicateArticle = {
      id: 1001,
      title: 'Duplicated',
      dateModified: '2024-03-01T10:00:00Z',
      contentStructureId: 301,
    };

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, 1);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return new Response(
            JSON.stringify([
              ...toJsonwsArticles([duplicateArticle], 12345),
              ...toJsonwsArticles([duplicateArticle], 12345),
            ]),
            {
              status: 200,
            },
          );
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.articleCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    expect(result.sampleArticles).toHaveLength(1);
  });
});

describe('liferay-content-prune: structure filter', () => {
  test('filters by structure key, ignores other structures', async () => {
    const mixedArticles = [
      ...ARTICLES_FITXA,
      {id: 2001, title: 'Grau A', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 302},
    ];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, mixedArticles.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, mixedArticles, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    // Only FITXA articles are in scope
    expect(result.articleCount).toBe(3);
    expect(result.structures).toHaveLength(1);
    expect(result.structures[0]?.key).toBe('FITXA');
  });

  test('throws when structure key does not exist in site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, 0);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES); // only FITXA and GRAU
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    await expect(
      runContentPrune(
        CONFIG,
        {site: '/estudis', rootFolders: [12345], structures: ['NONEXISTENT'], dryRun: true},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow('Structure "NONEXISTENT" not found');
  });
});

describe('liferay-content-prune: folder validation', () => {
  test('throws when folder does not belong to the resolved site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        // Folder belongs to a different group
        if (url.includes('/structured-content-folders/99999') && !url.includes('structured-content-folders/99999/')) {
          return folderResp(99999, 99999, 0); // siteId=99999, not 20200
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    await expect(
      runContentPrune(
        CONFIG,
        {site: '/estudis', rootFolders: [99999], dryRun: true},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow('not 20200');
  });

  test('throws when folder does not exist', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/')) {
          return new Response('not found', {status: 404});
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    await expect(
      runContentPrune(
        CONFIG,
        {site: '/estudis', rootFolders: [12345], dryRun: true},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow('not found');
  });
});

describe('liferay-content-prune: keep logic', () => {
  test('keep=2 with two structures keeps 2 total in the folder by default', async () => {
    const mixedArticles = [
      {id: 1001, title: 'Fitxa A', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 301},
      {id: 1002, title: 'Fitxa B', dateModified: '2024-02-01T10:00:00Z', contentStructureId: 301},
      {id: 1003, title: 'Fitxa C', dateModified: '2024-01-01T10:00:00Z', contentStructureId: 301},
      {id: 2001, title: 'Grau A', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 302},
      {id: 2002, title: 'Grau B', dateModified: '2024-02-01T10:00:00Z', contentStructureId: 302},
      {id: 2003, title: 'Grau C', dateModified: '2024-01-01T10:00:00Z', contentStructureId: 302},
    ];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, mixedArticles.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, mixedArticles, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {
        site: '/estudis',
        rootFolders: [12345],
        structures: ['FITXA', 'GRAU'],
        keep: 2,
        dryRun: true,
      },
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.keptCount).toBe(2);
    expect(result.deletedCount).toBe(4);

    const fitxa = result.structures.find((s) => s.key === 'FITXA');
    const grau = result.structures.find((s) => s.key === 'GRAU');
    expect(fitxa?.kept).toBe(1);
    expect(fitxa?.deleted).toBe(2);
    expect(grau?.kept).toBe(1);
    expect(grau?.deleted).toBe(2);
  });

  test('keep-scope structure preserves the legacy keep-per-structure behavior', async () => {
    const folderOneArticles = [
      {id: 1001, title: 'Fitxa A1', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 301},
      {id: 1002, title: 'Fitxa A2', dateModified: '2024-02-01T10:00:00Z', contentStructureId: 301},
    ];
    const folderTwoArticles = [
      {id: 2001, title: 'Fitxa B1', dateModified: '2024-03-03T10:00:00Z', contentStructureId: 301},
      {id: 2002, title: 'Fitxa B2', dateModified: '2024-02-03T10:00:00Z', contentStructureId: 301},
    ];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, folderOneArticles.length);
        }
        if (url.includes('/structured-content-folders/67890') && !url.includes('structured-content-folders/67890/')) {
          return folderResp(67890, 20200, folderTwoArticles.length);
        }
        if (
          url.includes('/structured-content-folders/12345/structured-content-folders') ||
          url.includes('/structured-content-folders/67890/structured-content-folders')
        ) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') &&
          url.includes('folderId=12345')
        ) {
          return folderArticlesResp(url, folderOneArticles, 12345);
        }
        if (
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') &&
          url.includes('folderId=67890')
        ) {
          return folderArticlesResp(url, folderTwoArticles, 67890);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345, 67890], keep: 1, keepScope: 'structure', dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.keptCount).toBe(1);
    expect(result.deletedCount).toBe(3);
    expect(result.structures[0]?.kept).toBe(1);
    expect(result.structures[0]?.deleted).toBe(3);
  });

  test('missing site-level structure definitions are resolved by data definition id', async () => {
    const articleBatch = [
      {id: 1001, title: 'Legacy A', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 999},
      {id: 1002, title: 'Legacy B', dateModified: '2024-02-01T10:00:00Z', contentStructureId: 999},
    ];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, articleBatch.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.endsWith('/o/data-engine/v2.0/data-definitions/999')) {
          return new Response(JSON.stringify({id: 999, dataDefinitionKey: 'LEGACY', name: {ca_ES: 'Legacy'}}), {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, articleBatch, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], keep: 1, dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.structures[0]?.key).toBe('LEGACY');
    expect(result.structures[0]?.name).toBe('Legacy');
  });

  test('folders are not marked removable when articles are kept', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], keep: 1, dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    // 1 article kept → folder is not removable
    expect(result.removedFolders).toHaveLength(0);
  });

  test('folder is marked removable when all articles are deleted', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], keep: 0, dryRun: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.removedFolders).toContain(12345);
  });
});

describe('liferay-content-prune: apply mode', () => {
  test('apply mode deletes articles and empty folders', async () => {
    const deletedArticles: string[] = [];
    const deletedFolders: number[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalarticle/delete-article')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const articleId = new URLSearchParams(body).get('articleId');
          if (articleId) deletedArticles.push(articleId);
          return new Response('{}', {status: 200});
        }

        if (method === 'DELETE') {
          const folderMatch = /structured-content-folders\/(\d+)$/.exec(url);
          if (folderMatch) deletedFolders.push(Number(folderMatch[1]));
          return new Response(null, {status: 204});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], keep: 0, dryRun: false},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('apply');
    expect(deletedArticles).toHaveLength(3);
    expect(deletedArticles).toContain('1001');
    expect(deletedArticles).toContain('1002');
    expect(deletedArticles).toContain('1003');
    expect(deletedFolders).toContain(12345);
    expect(result.removedFolders).toContain(12345);
  });

  test('apply mode deletes articles concurrently', async () => {
    const articleBatch = Array.from({length: 8}, (_, index) => ({
      id: 9000 + index,
      title: `Fitxa ${index + 1}`,
      dateModified: `2024-03-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
      contentStructureId: 301,
    }));

    let inflightDeletes = 0;
    let maxInflightDeletes = 0;

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalarticle/delete-article')) {
          inflightDeletes++;
          maxInflightDeletes = Math.max(maxInflightDeletes, inflightDeletes);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inflightDeletes--;
          return new Response('{}', {status: 200});
        }

        if (method === 'DELETE' && url.includes('/structured-content-folders/12345')) {
          return new Response(null, {status: 204});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, articleBatch.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, articleBatch, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], keep: 0, dryRun: false},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(maxInflightDeletes).toBeGreaterThan(1);
  });

  test('apply mode refreshes token and retries article deletion on 401', async () => {
    let tokenFetches = 0;
    let firstDeleteAttempt = true;
    const deleteAuthHeaders: string[] = [];

    function getAuthorizationHeader(init: RequestInit | undefined): string {
      const headers = init?.headers;
      if (headers instanceof Headers) {
        return headers.get('Authorization') ?? '';
      }
      if (Array.isArray(headers)) {
        return headers.find(([key]) => key === 'Authorization')?.[1] ?? '';
      }
      if (headers && typeof headers === 'object') {
        return String((headers as Record<string, string>)['Authorization'] ?? '');
      }

      return '';
    }

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalarticle/delete-article')) {
          deleteAuthHeaders.push(getAuthorizationHeader(init as RequestInit | undefined));
          if (firstDeleteAttempt) {
            firstDeleteAttempt = false;
            return new Response('unauthorized', {status: 401});
          }

          return new Response('{}', {status: 200});
        }

        if (method === 'DELETE' && url.includes('/structured-content-folders/12345')) {
          return new Response(null, {status: 204});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, 1);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(
            url,
            [{id: 1001, title: 'Fitxa A', dateModified: '2024-03-01T10:00:00Z', contentStructureId: 301}],
            12345,
          );
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const tokenClient = {
      fetchClientCredentialsToken: async () => {
        tokenFetches += 1;
        return {
          accessToken: `token-${tokenFetches}`,
          tokenType: 'Bearer',
          expiresIn: 3600,
        };
      },
    };
    const config = {
      ...CONFIG,
      liferay: {
        ...CONFIG.liferay,
        oauth2ClientId: 'refresh-test-client',
      },
    };

    const result = await runContentPrune(
      config,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], keep: 0, dryRun: false},
      {apiClient, tokenClient},
    );

    expect(result.mode).toBe('apply');
    expect(firstDeleteAttempt).toBe(false);
    expect(tokenFetches).toBe(2);
    expect(deleteAuthHeaders).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  test('apply mode records failed deletes and keeps going when delete-article fails', async () => {
    const deletedArticles: string[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalarticle/delete-article')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const articleId = new URLSearchParams(body).get('articleId');
          if (articleId) deletedArticles.push(articleId);
          if (articleId === '1001') {
            return new Response('boom', {status: 500});
          }

          return new Response('{}', {status: 200});
        }

        if (method === 'DELETE' && url.includes('/structured-content-folders/12345')) {
          return new Response(null, {status: 204});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], structures: ['FITXA'], keep: 0, dryRun: false},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.failedArticles).toHaveLength(1);
    expect(result.failedArticles[0]).toMatchObject({
      articleId: '1001',
      operation: 'delete-article',
      status: 500,
    });
    expect(deletedArticles).toContain('1001');
    expect(deletedArticles).toContain('1002');
    expect(deletedArticles).toContain('1003');
  });

  test('apply mode deletes whole root folders directly when keep is zero and no structure filter is used', async () => {
    const deletedJournalFolders: string[] = [];
    const deletedArticles: string[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalfolder/delete-folder')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const folderId = new URLSearchParams(body).get('folderId');
          if (folderId) deletedJournalFolders.push(folderId);
          return new Response('{}', {status: 200});
        }

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalarticle/delete-article')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const articleId = new URLSearchParams(body).get('articleId');
          if (articleId) deletedArticles.push(articleId);
          return new Response('{}', {status: 200});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], keep: 0, dryRun: false},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('apply');
    expect(deletedJournalFolders).toEqual(['12345']);
    expect(deletedArticles).toHaveLength(0);
    expect(result.removedFolders).toContain(12345);
  });

  test('whole-folder deletion fast path skips structure resolution and article inventory', async () => {
    const deletedJournalFolders: string[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalfolder/delete-folder')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const folderId = new URLSearchParams(body).get('folderId');
          if (folderId) deletedJournalFolders.push(folderId);
          return new Response('{}', {status: 200});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (
          url.includes('/data-definitions/by-content-type/journal') ||
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') ||
          url.includes('/api/jsonws/journal.journalarticle/delete-article')
        ) {
          throw new Error(`Fast path should not reach: ${url}`);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], keep: 0, dryRun: false},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.articleCount).toBe(3);
    expect(result.deletedCount).toBe(3);
    expect(result.structures).toHaveLength(0);
    expect(deletedJournalFolders).toEqual(['12345']);
  });

  test('whole-folder deletion fast path ignores missing root folders', async () => {
    const deletedJournalFolders: string[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalfolder/delete-folder')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const folderId = new URLSearchParams(body).get('folderId');
          if (folderId) deletedJournalFolders.push(folderId);
          return new Response('{}', {status: 200});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/67890') && !url.includes('structured-content-folders/67890/')) {
          return new Response('not found', {status: 404});
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (
          url.includes('/data-definitions/by-content-type/journal') ||
          url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles') ||
          url.includes('/api/jsonws/journal.journalarticle/delete-article')
        ) {
          throw new Error(`Fast path should not reach: ${url}`);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    const result = await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345, 67890], keep: 0, dryRun: false},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.folderCount).toBe(1);
    expect(deletedJournalFolders).toEqual(['12345']);
    expect(result.removedFolders).toContain(12345);
    expect(result.missingFolders).toEqual([67890]);
    expect(result.failedFolders).toHaveLength(0);
  });

  test('apply mode does not use whole-folder deletion when keep is positive', async () => {
    const deletedJournalFolders: string[] = [];
    const deletedArticles: string[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalfolder/delete-folder')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const folderId = new URLSearchParams(body).get('folderId');
          if (folderId) deletedJournalFolders.push(folderId);
          return new Response('{}', {status: 200});
        }

        if (method === 'POST' && url.includes('/api/jsonws/journal.journalarticle/delete-article')) {
          const body = String((init as RequestInit | undefined)?.body ?? '');
          const articleId = new URLSearchParams(body).get('articleId');
          if (articleId) deletedArticles.push(articleId);
          return new Response('{}', {status: 200});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/estudis')) {
          return siteResp(20200, '/estudis');
        }
        if (url.includes('/structured-content-folders/12345') && !url.includes('structured-content-folders/12345/')) {
          return folderResp(12345, 20200, ARTICLES_FITXA.length);
        }
        if (url.includes('/structured-content-folders/12345/structured-content-folders')) {
          return paged([]);
        }
        if (url.includes('/data-definitions/by-content-type/journal')) {
          return paged(STRUCTURES);
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders-and-articles')) {
          return folderArticlesResp(url, ARTICLES_FITXA, 12345);
        }

        throw new Error(`Unexpected: ${url}`);
      },
    });

    await runContentPrune(
      CONFIG,
      {site: '/estudis', rootFolders: [12345], keep: 1, dryRun: false},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(deletedJournalFolders).toHaveLength(0);
    expect(deletedArticles).toHaveLength(2);
  });
});

describe('liferay-content-prune: formatContentPrune', () => {
  const BASE_RESULT: ContentPruneResult = {
    ok: true,
    mode: 'dry-run',
    groupId: 20200,
    siteFriendlyUrl: '/estudis',
    rootFolders: [12345],
    folderCount: 1,
    articleCount: 3,
    keptCount: 1,
    deletedCount: 2,
    structures: [{key: 'FITXA', name: 'Fitxa', found: 3, kept: 1, deleted: 2}],
    sampleArticles: [
      {id: 1002, title: 'Fitxa B', structureKey: 'FITXA', modifiedDate: '2024-02-01T10:00:00Z', action: 'delete'},
    ],
    removedFolders: [],
    missingFolders: [],
    failedArticles: [],
    failedFolders: [],
  };

  test('includes mode, groupId and site in text output', () => {
    const text = formatContentPrune(BASE_RESULT);
    expect(text).toContain('CONTENT_PRUNE_DRY_RUN');
    expect(text).toContain('groupId=20200');
    expect(text).toContain('site=/estudis');
    expect(text).toContain('(dry-run: no changes applied)');
  });

  test('includes structure breakdown', () => {
    const text = formatContentPrune(BASE_RESULT);
    expect(text).toContain('FITXA');
    expect(text).toContain('found=3');
    expect(text).toContain('kept=1');
    expect(text).toContain('deleted=2');
  });

  test('apply mode does not print dry-run notice', () => {
    const text = formatContentPrune({...BASE_RESULT, mode: 'apply'});
    expect(text).toContain('CONTENT_PRUNE_APPLY');
    expect(text).not.toContain('dry-run: no changes applied');
  });
});
