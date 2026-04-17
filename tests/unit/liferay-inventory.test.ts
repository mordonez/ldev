import {describe, expect, test, beforeEach} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayInventoryStructures,
  runLiferayInventoryStructures,
} from '../../src/features/liferay/inventory/liferay-inventory-structures.js';
import {
  formatLiferayInventoryTemplates,
  runLiferayInventoryTemplates,
} from '../../src/features/liferay/inventory/liferay-inventory-templates.js';
import {
  normalizeLocalizedName,
  resolveSite,
  resolvedSiteCache,
} from '../../src/features/liferay/inventory/liferay-inventory-shared.js';

beforeEach(() => {
  resolvedSiteCache.clear();
});

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
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

describe('liferay inventory shared', () => {
  test('resolves site by friendly url and fuzzy list fallback', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global Site"}', {status: 200});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites?pageSize=100&page=1')) {
          return new Response(
            '{"items":[{"id":20121,"friendlyUrlPath":"/global","name":{"en_US":"Global Site"}}],"lastPage":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(resolveSite(CONFIG, '/global', {apiClient, tokenClient: TOKEN_CLIENT})).resolves.toEqual({
      id: 20121,
      friendlyUrlPath: '/global',
      name: 'Global Site',
    });
  });

  test('falls back to JSONWS when headless admin user lookup is denied', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/guest')) {
          return new Response('forbidden', {status: 403});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites?pageSize=100&page=1')) {
          return new Response('forbidden', {status: 403});
        }

        if (url.includes('/o/headless-admin-user/v1.0/sites/by-friendly-url-path/guest')) {
          return new Response('forbidden', {status: 403});
        }

        if (url.endsWith('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":20116}]', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search-count')) {
          return new Response('"1"', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search')) {
          return new Response('[{"groupId":101,"friendlyURL":"/guest","nameCurrentValue":"Guest","site":true}]', {
            status: 200,
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(resolveSite(CONFIG, '/guest', {apiClient, tokenClient: TOKEN_CLIENT})).resolves.toEqual({
      id: 101,
      friendlyUrlPath: '/guest',
      name: 'Guest',
    });
  });

  test('does not fuzzy-match a slash-prefixed site against unrelated site names', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/global')) {
          return new Response('not found', {status: 404});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites?pageSize=100&page=1')) {
          return new Response(
            '{"items":[{"id":14310740,"friendlyUrlPath":"/hub-medicina-social","name":{"ca_ES":"Hub en Medicina Social Global"}}],"lastPage":1}',
            {status: 200},
          );
        }

        if (url.includes('/o/headless-admin-user/v1.0/sites/by-friendly-url-path/global')) {
          return new Response('not found', {status: 404});
        }

        if (url.endsWith('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":20116}]', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search-count')) {
          return new Response('"1"', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search')) {
          return new Response(
            '[{"groupId":14310740,"friendlyURL":"/hub-medicina-social","nameCurrentValue":"Hub en Medicina Social Global","site":true}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(resolveSite(CONFIG, '/global', {apiClient, tokenClient: TOKEN_CLIENT})).rejects.toThrow(
      'Could not resolve site "/global".',
    );
  });

  test('normalizes localized name values', () => {
    expect(normalizeLocalizedName('Guest')).toBe('Guest');
    expect(normalizeLocalizedName({es_ES: 'Invitado', en_US: 'Guest'})).toBe('Invitado');
  });

  test('resolveSite cache is segmented by oauth client/scope context', async () => {
    let lookupCalls = 0;
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/global')) {
          lookupCalls += 1;
          return new Response(
            JSON.stringify({id: 20_000 + lookupCalls, friendlyUrlPath: '/global', name: `Global ${lookupCalls}`}),
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const configA = {...CONFIG};
    const configB = {
      ...CONFIG,
      liferay: {
        ...CONFIG.liferay,
        oauth2ClientId: 'another-client',
        scopeAliases: 'scope-b',
      },
    };

    const resultA = await resolveSite(configA, '/global', {apiClient, tokenClient: TOKEN_CLIENT});
    const resultB = await resolveSite(configB, '/global', {apiClient, tokenClient: TOKEN_CLIENT});

    expect(resultA.id).toBe(20_001);
    expect(resultB.id).toBe(20_002);
    expect(lookupCalls).toBe(2);
  });

  test('resolveSite forceRefresh bypasses cached site lookup', async () => {
    let lookupCalls = 0;
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/global')) {
          lookupCalls += 1;
          return new Response(
            JSON.stringify({id: 30_000 + lookupCalls, friendlyUrlPath: '/global', name: `Global ${lookupCalls}`}),
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const first = await resolveSite(CONFIG, '/global', {apiClient, tokenClient: TOKEN_CLIENT});
    const second = await resolveSite(CONFIG, '/global', {
      apiClient,
      tokenClient: TOKEN_CLIENT,
      forceRefresh: true,
    });

    expect(first.id).toBe(30_001);
    expect(second.id).toBe(30_002);
    expect(lookupCalls).toBe(2);
  });
});

describe('liferay inventory structures and templates', () => {
  test('lists structures with paginated headless data', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites?pageSize=100&page=1')) {
          return new Response('{"items":[{"id":20121,"friendlyUrlPath":"/global","name":"Global"}],"lastPage":1}', {
            status: 200,
          });
        }

        if (url.includes('/data-definitions/by-content-type/journal?page=1&pageSize=2')) {
          return new Response(
            '{"items":[{"id":301,"dataDefinitionKey":"BASIC","name":{"en_US":"Basic Web Content"}},{"id":302,"dataDefinitionKey":"NEWS","name":{"en_US":"News"}}],"lastPage":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryStructures(
      CONFIG,
      {site: '/global', pageSize: 2},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toEqual([
      {id: 301, key: 'BASIC', name: 'Basic Web Content'},
      {id: 302, key: 'NEWS', name: 'News'},
    ]);
    expect(formatLiferayInventoryStructures(result)).toContain('id=301 key=BASIC name=Basic Web Content');
  });

  test('lists structures with associated templates when requested', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites?pageSize=100&page=1')) {
          return new Response('{"items":[{"id":20121,"friendlyUrlPath":"/global","name":"Global"}],"lastPage":1}', {
            status: 200,
          });
        }

        if (url.includes('/data-definitions/by-content-type/journal?page=1&pageSize=2')) {
          return new Response(
            '{"items":[{"id":301,"dataDefinitionKey":"BASIC","name":{"en_US":"Basic Web Content"}},{"id":302,"dataDefinitionKey":"NEWS","name":{"en_US":"News"}}],"lastPage":1}',
            {status: 200},
          );
        }

        if (url.includes('/sites/20121/content-templates?page=1&pageSize=2')) {
          return new Response(
            '{"items":[{"id":"40801","name":"News Template","contentStructureId":302,"externalReferenceCode":"news-template"}],"lastPage":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryStructures(
      CONFIG,
      {site: '/global', pageSize: 2, withTemplates: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toEqual([
      {id: 301, key: 'BASIC', name: 'Basic Web Content', templates: []},
      {
        id: 302,
        key: 'NEWS',
        name: 'News',
        templates: [{id: '40801', name: 'News Template', externalReferenceCode: 'news-template'}],
      },
    ]);

    expect(formatLiferayInventoryStructures(result)).toContain('id=302 key=NEWS name=News templates=1');
  });

  test('lists templates for a site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/20121')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (url.includes('/sites/20121/content-templates?page=1&pageSize=2')) {
          return new Response(
            '{"items":[{"id":"40801","name":"News Template","contentStructureId":302}],"lastPage":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryTemplates(
      CONFIG,
      {site: '20121', pageSize: 2},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toEqual([
      {
        id: '40801',
        name: 'News Template',
        contentStructureId: 302,
        externalReferenceCode: '40801',
        templateScript: undefined,
      },
    ]);
    expect(formatLiferayInventoryTemplates(result)).toContain('key=40801 structureId=302 name=News Template');
  });

  test('falls back to DDM templates when headless content templates are empty', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites/20121')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (url.includes('/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }

        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }

        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure',
          )
        ) {
          return new Response('{"classNameId":3001}', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":2001}', {status: 200});
        }

        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3001&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"40802","templateKey":"LEGACY_NEWS","externalReferenceCode":"legacy-news","nameCurrentValue":"Legacy News","classPK":302,"script":"<#-- legacy -->"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryTemplates(CONFIG, {site: '20121'}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result).toEqual([
      {
        id: '',
        name: 'Legacy News',
        contentStructureId: 302,
        externalReferenceCode: 'legacy-news',
        templateScript: '<#-- legacy -->',
      },
    ]);
  });

  test('surfaces 403 paged errors clearly', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites?pageSize=100&page=1')) {
          return new Response('{"items":[{"id":20121,"friendlyUrlPath":"/global","name":"Global"}],"lastPage":1}', {
            status: 200,
          });
        }

        return new Response('forbidden', {status: 403});
      },
    });

    await expect(
      runLiferayInventoryStructures(CONFIG, {site: '/global'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('403 Forbidden');
  });
});
