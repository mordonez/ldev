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
        if (url.includes('/structured-content-folders/12345/structured-contents')) {
          return paged(ARTICLES_FITXA);
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
        if (url.includes('/structured-content-folders/12345/structured-contents')) {
          return paged(ARTICLES_FITXA);
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
        if (url.includes('/structured-content-folders/12345/structured-contents')) {
          return paged(mixedArticles);
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
  test('keep=2 with two structures keeps 2 per structure', async () => {
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
        if (url.includes('/structured-content-folders/12345/structured-contents')) {
          return paged(mixedArticles);
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

    expect(result.keptCount).toBe(4); // 2 FITXA + 2 GRAU
    expect(result.deletedCount).toBe(2); // 1 FITXA + 1 GRAU oldest

    const fitxa = result.structures.find((s) => s.key === 'FITXA');
    const grau = result.structures.find((s) => s.key === 'GRAU');
    expect(fitxa?.kept).toBe(2);
    expect(fitxa?.deleted).toBe(1);
    expect(grau?.kept).toBe(2);
    expect(grau?.deleted).toBe(1);
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
        if (url.includes('/structured-content-folders/12345/structured-contents')) {
          return paged(ARTICLES_FITXA);
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
        if (url.includes('/structured-content-folders/12345/structured-contents')) {
          return paged(ARTICLES_FITXA);
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
    const deletedArticles: number[] = [];
    const deletedFolders: number[] = [];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';

        if (method === 'DELETE') {
          const articleMatch = /structured-contents\/(\d+)$/.exec(url);
          const folderMatch = /structured-content-folders\/(\d+)$/.exec(url);
          if (articleMatch) deletedArticles.push(Number(articleMatch[1]));
          else if (folderMatch) deletedFolders.push(Number(folderMatch[1]));
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
        if (url.includes('/structured-content-folders/12345/structured-contents')) {
          return paged(ARTICLES_FITXA);
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
    expect(deletedArticles).toHaveLength(3);
    expect(deletedArticles).toContain(1001);
    expect(deletedArticles).toContain(1002);
    expect(deletedArticles).toContain(1003);
    expect(deletedFolders).toContain(12345);
    expect(result.removedFolders).toContain(12345);
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
