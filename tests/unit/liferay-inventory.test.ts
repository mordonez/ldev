import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayInventoryStructures,
  runLiferayInventoryStructures,
} from '../../src/features/liferay/inventory/liferay-inventory-structures.js';
import {
  formatLiferayInventoryTemplates,
  runLiferayInventoryTemplates,
} from '../../src/features/liferay/inventory/liferay-inventory-templates.js';
import {normalizeLocalizedName, resolveSite} from '../../src/features/liferay/inventory/liferay-inventory-shared.js';

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

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('not-found', {status: 404});
        }

        if (url.includes('/o/headless-admin-user/v1.0/sites?pageSize=100&page=1')) {
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

  test('normalizes localized name values', () => {
    expect(normalizeLocalizedName('Guest')).toBe('Guest');
    expect(normalizeLocalizedName({es_ES: 'Invitado', en_US: 'Guest'})).toBe('Invitado');
  });
});

describe('liferay inventory structures and templates', () => {
  test('lists structures with paginated headless data', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
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

  test('lists templates for a site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-user/v1.0/sites/20121')) {
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

    expect(result).toEqual([{id: '40801', name: 'News Template', contentStructureId: 302}]);
    expect(formatLiferayInventoryTemplates(result)).toContain('key=40801 structureId=302 name=News Template');
  });

  test('surfaces 403 paged errors clearly', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        return new Response('forbidden', {status: 403});
      },
    });

    await expect(
      runLiferayInventoryStructures(CONFIG, {site: '/global'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('403 Forbidden');
  });
});
