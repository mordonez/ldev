import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  runLiferayPageLayoutExport,
  writeLiferayPageLayoutExport,
} from '../../src/features/liferay/page-layout/liferay-page-layout-export.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

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

describe('liferay page-layout export', () => {
  test('builds a stable export shape for a content page', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('/api/jsonws/layout/get-layouts?') && url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('/api/jsonws/layout/get-layouts?') && url.includes('parentLayoutId=11')) {
          return new Response('[]', {status: 200});
        }

        if (url.includes('/site-pages/home?fields=')) {
          return new Response(
            '{"id":5001,"uuid":"uuid-1","friendlyUrlPath":"home","pageType":"Content Layout","siteId":20121,"title":"Home","pageDefinition":{"widgets":[]}}',
            {status: 200},
          );
        }

        if (url.endsWith('/site-pages/home/experiences')) {
          return new Response('{"items":[{"id":9001,"name":"Default"}],"lastPage":1}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayPageLayoutExport(
      CONFIG,
      {url: '/web/guest/home'},
      {
        apiClient,
        tokenClient: TOKEN_CLIENT,
        now: () => new Date('2026-03-26T12:00:00.000Z'),
      },
    );

    expect(result).toMatchObject({
      kind: 'liferay-page-layout-export',
      schemaVersion: 1,
      generatedAt: '2026-03-26T12:00:00.000Z',
      source: {
        url: '/web/guest/home',
        siteFriendlyUrl: '/guest',
        siteId: 20121,
        friendlyUrl: '/home',
        layoutType: 'content',
      },
      headlessSitePage: {
        id: 5001,
        pageType: 'Content Layout',
      },
      layoutStructure: {
        available: false,
        storage: 'api-only',
      },
    });
  });

  test('writes export to a file and creates parent directories', async () => {
    const dir = createTempDir('dev-cli-page-layout-export-');
    const filePath = path.join(dir, 'nested', 'page-layout.json');

    const outputPath = await writeLiferayPageLayoutExport(
      {
        kind: 'liferay-page-layout-export',
        schemaVersion: 1,
        generatedAt: '2026-03-26T12:00:00.000Z',
        source: {
          baseUrl: 'http://localhost:8080',
          url: '/web/guest/home',
          siteFriendlyUrl: '/guest',
          siteName: 'Guest',
          siteId: 20121,
          friendlyUrl: '/home',
          privateLayout: false,
          layoutId: 11,
          plid: 1011,
          layoutType: 'content',
          pageName: 'Home',
        },
        adminUrls: {
          edit: 'edit',
          translate: 'translate',
          configureGeneral: 'general',
          configureDesign: 'design',
          configureSeo: 'seo',
        },
        headlessSitePage: {id: 5001},
        layoutStructure: {
          available: false,
          storage: 'api-only',
          warning: 'warning',
        },
      },
      filePath,
    );

    expect(outputPath).toBe(path.resolve(filePath));
    const written = await fs.readFile(filePath, 'utf8');
    expect(JSON.parse(written)).toMatchObject({
      kind: 'liferay-page-layout-export',
      source: {friendlyUrl: '/home'},
    });
  });

  test('fails clearly when the resolved page is not a content page', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        return new Response(
          '[{"layoutId":11,"plid":1011,"type":"portlet","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
          {status: 200},
        );
      },
    });

    await expect(
      runLiferayPageLayoutExport(CONFIG, {url: '/web/guest/home'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('layoutType=content');
  });
});
