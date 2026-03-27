import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/liferay/client.js';
import {
  formatLiferayInventoryPages,
  runLiferayInventoryPages,
} from '../../src/features/liferay/liferay-inventory-pages.js';

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

describe('liferay inventory pages', () => {
  test('lists a hierarchical tree for a resolved site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false},{"layoutId":12,"plid":1012,"type":"link_to_layout","nameCurrentValue":"Redirect","friendlyURL":"/redirect","hidden":true,"typeSettings":"url=https://example.test"}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response(
            '[{"layoutId":21,"plid":2021,"type":"content","nameCurrentValue":"Child","friendlyURL":"/child","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=12') || url.includes('parentLayoutId=21')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryPages(
      CONFIG,
      {site: '/guest'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toMatchObject({
      inventoryType: 'pages',
      groupId: 20121,
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      privateLayout: false,
      sitePathPrefix: '/web/guest',
      inspectCommandTemplate: 'inventory page --url <fullUrl>',
      pageCount: 3,
    });
    expect(result.pages[0]).toMatchObject({
      name: 'Home',
      pageSubtype: 'content',
      fullUrl: '/web/guest/home',
      pageCommand: 'inventory page --url /web/guest/home',
    });
    expect(result.pages[0]?.children[0]).toMatchObject({
      name: 'Child',
      fullUrl: '/web/guest/child',
    });
    expect(result.pages[1]).toMatchObject({
      name: 'Redirect',
      hidden: true,
      targetUrl: 'https://example.test',
    });
  });

  test('limits recursion with max-depth', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryPages(
      CONFIG,
      {site: '/global', maxDepth: 0},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.children).toEqual([]);
  });

  test('formats text output as a readable tree', () => {
    const text = formatLiferayInventoryPages({
      inventoryType: 'pages',
      groupId: 20121,
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      privateLayout: false,
      sitePathPrefix: '/web/guest',
      inspectCommandTemplate: 'inventory page --url <fullUrl>',
      pageCount: 2,
      pages: [
        {
          pageType: 'regularPage',
          pageSubtype: 'content',
          name: 'Home',
          friendlyUrl: '/home',
          fullUrl: '/web/guest/home',
          pageCommand: 'inventory page --url /web/guest/home',
          layoutId: 11,
          plid: 1011,
          hidden: false,
          children: [
            {
              pageType: 'regularPage',
              pageSubtype: 'content',
              name: 'Child',
              friendlyUrl: '/child',
              fullUrl: '/web/guest/child',
              pageCommand: 'inventory page --url /web/guest/child',
              layoutId: 21,
              plid: 2021,
              hidden: true,
              targetUrl: 'https://example.test',
              children: [],
            },
          ],
        },
      ],
    });

    expect(text).toContain('SITE PAGES');
    expect(text).toContain('pageCount=2');
    expect(text).toContain('- Home [content] /web/guest/home');
    expect(text).toContain('  - Child [content] /web/guest/child (hidden) -> https://example.test');
  });

  test('surfaces layout listing errors clearly', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        return new Response('boom', {status: 500});
      },
    });

    await expect(
      runLiferayInventoryPages(CONFIG, {site: '/global'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('layout/get-layouts failed');
  });
});
