import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  collectPageLayoutDiffs,
  formatLiferayPageLayoutDiff,
  runLiferayPageLayoutDiff,
} from '../../src/features/liferay/page-layout/liferay-page-layout-diff.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';
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

const TOKEN_CLIENT = createStaticTokenClient();

describe('liferay page-layout diff', () => {
  test('collects no diffs for equivalent exports', () => {
    const left = {
      kind: 'liferay-page-layout-export',
      schemaVersion: 1,
      generatedAt: '2026-03-26T12:00:00.000Z',
      source: {url: '/web/guest/home'},
      adminUrls: {},
      headlessSitePage: {
        pageDefinition: {
          widgets: [{id: 'w1'}],
        },
      },
      layoutStructure: {available: false, storage: 'api-only', warning: 'x'},
    };

    expect(collectPageLayoutDiffs(left as never, left as never)).toEqual([]);
  });

  test('detects a simple structural difference', () => {
    const left = {
      kind: 'liferay-page-layout-export',
      schemaVersion: 1,
      generatedAt: '2026-03-26T12:00:00.000Z',
      source: {url: '/web/guest/home'},
      adminUrls: {},
      headlessSitePage: {
        pageDefinition: {
          widgets: [{id: 'w1'}],
        },
      },
      layoutStructure: {available: false, storage: 'api-only', warning: 'x'},
    };
    const right = {
      ...left,
      headlessSitePage: {
        pageDefinition: {
          widgets: [{id: 'w2'}],
        },
      },
    };

    const diffs = collectPageLayoutDiffs(left as never, right as never);
    expect(diffs).toEqual([
      {
        compareMode: 'pageDefinition',
        path: '$.widgets[0].id',
        left: '"w1"',
        right: '"w2"',
      },
    ]);
  });

  test('supports live vs file diff', async () => {
    const dir = createTempDir('dev-cli-page-layout-diff-');
    const filePath = path.join(dir, 'reference.json');
    await fs.writeFile(
      filePath,
      `${JSON.stringify({
        kind: 'liferay-page-layout-export',
        schemaVersion: 1,
        generatedAt: '2026-03-26T12:00:00.000Z',
        source: {url: '/web/guest/home'},
        adminUrls: {},
        headlessSitePage: {pageDefinition: {widgets: [{id: 'w1'}]}},
        layoutStructure: {available: false, storage: 'api-only', warning: 'x'},
      })}\n`,
    );

    const fetchImpl = createTestFetchImpl((url) => {
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
        return new Response('{"id":5001,"pageDefinition":{"widgets":[{"id":"w2"}]}}', {status: 200});
      }
      if (url.endsWith('/site-pages/home/experiences')) {
        return new Response('{"items":[]}', {status: 200});
      }
      if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
        return new Response('{"classNameId":20006}', {status: 200});
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await runLiferayPageLayoutDiff(
      CONFIG,
      {url: '/web/guest/home', file: filePath},
      {
        apiClient: createLiferayApiClient({fetchImpl}),
        tokenClient: TOKEN_CLIENT,
        now: () => new Date('2026-03-26T12:00:00.000Z'),
      },
    );

    expect(result.equal).toBe(false);
    expect(result.referenceFile).toBe(path.resolve(filePath));
    expect(result.diffCount).toBe(1);
  });

  test('supports live vs live diff and text formatting', async () => {
    const fetchImpl = createTestFetchImpl((url) => {
      if (url.includes('/by-friendly-url-path/guest')) {
        return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
      }
      if (url.includes('/by-friendly-url-path/global')) {
        return new Response('{"id":20122,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
      }
      if (url.includes('/api/jsonws/layout/get-layouts?') && url.includes('parentLayoutId=0')) {
        if (url.includes('groupId=20121')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }
        return new Response(
          '[{"layoutId":21,"plid":2021,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
          {status: 200},
        );
      }
      if (
        url.includes('/api/jsonws/layout/get-layouts?') &&
        (url.includes('parentLayoutId=11') || url.includes('parentLayoutId=21'))
      ) {
        return new Response('[]', {status: 200});
      }
      if (url.includes('/sites/20121/site-pages/home?fields=')) {
        return new Response('{"id":5001,"pageDefinition":{"widgets":[{"id":"w1"}]}}', {status: 200});
      }
      if (url.includes('/sites/20122/site-pages/home?fields=')) {
        return new Response('{"id":5002,"pageDefinition":{"widgets":[{"id":"w1"}]}}', {status: 200});
      }
      if (url.endsWith('/site-pages/home/experiences')) {
        return new Response('{"items":[]}', {status: 200});
      }
      if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
        return new Response('{"classNameId":20006}', {status: 200});
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    const apiClient = createLiferayApiClient({fetchImpl});

    const result = await runLiferayPageLayoutDiff(
      CONFIG,
      {url: '/web/guest/home', referenceUrl: '/web/global/home'},
      {apiClient, tokenClient: TOKEN_CLIENT, now: () => new Date('2026-03-26T12:00:00.000Z')},
    );

    expect(result.equal).toBe(true);
    expect(result.rightUrl).toBe('/web/global/home');
    expect(formatLiferayPageLayoutDiff(result)).toContain('equal=true');
  });
});
