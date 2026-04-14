import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayInventorySites,
  runLiferayInventorySites,
} from '../../src/features/liferay/inventory/liferay-inventory-sites.js';

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
  test('lists accessible sites with paginated Headless Admin Site data', async () => {
    const calls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=2')) {
          return new Response(
            '{"items":[{"id":101,"friendlyUrlPath":"/guest","name":{"en_US":"Guest"}},{"id":103,"friendlyUrlPath":"/global","name":{"en_US":"Global"}}],"lastPage":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventorySites(
      CONFIG,
      {pageSize: 2},
      {
        apiClient,
        tokenClient: {
          fetchClientCredentialsToken: async () => ({
            accessToken: 'token-123',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        },
      },
    );

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
    expect(calls).toHaveLength(1);
  });

  test('falls back to JSONWS when Headless Admin Site returns no sites', async () => {
    const calls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=2')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }

        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":201}]', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search-count?companyId=201')) {
          return new Response('1', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search?companyId=201')) {
          return new Response(
            '[{"site":true,"groupId":301,"friendlyURL":"/jsonws-site","nameCurrentValue":"JSONWS Site"}]',
            {
              status: 200,
            },
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventorySites(
      CONFIG,
      {pageSize: 2},
      {
        apiClient,
        tokenClient: {
          fetchClientCredentialsToken: async () => ({
            accessToken: 'token-123',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        },
      },
    );

    expect(result).toEqual([
      {
        groupId: 301,
        siteFriendlyUrl: '/jsonws-site',
        name: 'JSONWS Site',
        pagesCommand: 'inventory pages --site /jsonws-site',
      },
    ]);
    expect(calls).toContainEqual(expect.stringContaining('/o/headless-admin-site/v1.0/sites?page=1&pageSize=2'));
    expect(calls).toContainEqual(expect.stringContaining('/api/jsonws/company/get-companies'));
    expect(calls).toContainEqual(expect.stringContaining('/api/jsonws/group/search-count?companyId=201'));
    expect(calls).toContainEqual(expect.stringContaining('/api/jsonws/group/search?companyId=201'));
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

    expect(formatLiferayInventorySites([])).toBe('No site data');
  });

  test('surfaces headless site inventory errors clearly', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async () => new Response('boom', {status: 500}),
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
    ).rejects.toThrow('paged request /o/headless-admin-site/v1.0/sites failed');
  });
});
