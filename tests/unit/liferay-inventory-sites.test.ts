import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/liferay/client.js';
import {formatLiferayInventorySites, runLiferayInventorySites} from '../../src/features/liferay/liferay-inventory-sites.js';

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

describe('liferay inventory sites', () => {
  test('lists accessible sites with paginated JSONWS search', async () => {
    const calls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.endsWith('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":20116}]', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search-count')) {
          return new Response('"3"', {status: 200});
        }

        if (url.includes('start=0&end=2')) {
          return new Response(
            '[{"groupId":101,"friendlyURL":"/guest","nameCurrentValue":"Guest","site":true},{"groupId":102,"friendlyURL":"/asset-library","nameCurrentValue":"Asset Library","site":false}]',
            {status: 200},
          );
        }

        if (url.includes('start=2&end=4')) {
          return new Response('[{"groupId":103,"friendlyURL":"/global","nameCurrentValue":"Global","site":true}]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventorySites(CONFIG, {pageSize: 2}, {
      apiClient,
      tokenClient: {
        fetchClientCredentialsToken: async () => ({
          accessToken: 'token-123',
          tokenType: 'Bearer',
          expiresIn: 3600,
        }),
      },
    });

    expect(result).toEqual([
      {
        groupId: 101,
        siteFriendlyUrl: '/guest',
        name: 'Guest',
        pagesCommand: 'inventory pages --site /guest',
      },
      {
        groupId: 103,
        siteFriendlyUrl: '/global',
        name: 'Global',
        pagesCommand: 'inventory pages --site /global',
      },
    ]);
    expect(calls).toHaveLength(4);
  });

  test('formats text output and empty output', () => {
    expect(
      formatLiferayInventorySites([
        {
          groupId: 101,
          siteFriendlyUrl: '/guest',
          name: 'Guest',
          pagesCommand: 'inventory pages --site /guest',
        },
      ]),
    ).toContain('id=101 site=/guest name=Guest pages=inventory pages --site /guest');

    expect(formatLiferayInventorySites([])).toBe('Sin datos de sites');
  });

  test('surfaces JSONWS errors clearly', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":20116}]', {status: 200});
        }

        return new Response('boom', {status: 500});
      },
    });

    await expect(
      runLiferayInventorySites(CONFIG, undefined, {
        apiClient,
        tokenClient: {
          fetchClientCredentialsToken: async () => ({
            accessToken: 'token-123',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        },
      }),
    ).rejects.toThrow('group/search-count failed');
  });
});
