import fs from 'fs-extra';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';
import {captureProcessOutput, createLiferayCliRepoFixture} from '../../src/testing/cli-test-helpers.js';

describe('liferay page-layout diff smoke', () => {
  let repoRoot: string;
  let output: ReturnType<typeof captureProcessOutput>;

  beforeEach(async () => {
    repoRoot = await createLiferayCliRepoFixture('dev-cli-liferay-page-layout-diff-');
    output = captureProcessOutput();
  });

  afterEach(() => {
    output.restore();
    vi.unstubAllGlobals();
    process.exitCode = 0;
  });

  test('dev-cli liferay page-layout diff supports live vs file', async () => {
    const filePath = path.join(repoRoot, 'reference.json');
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

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }
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
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'page-layout', 'diff', '--url', '/web/guest/home', '--file', filePath], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.equal).toBe(false);
    expect(parsed.diffCount).toBe(1);
    expect(process.exitCode).toBe(1);
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay page-layout diff supports live vs live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20122,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (
          url.includes('/api/jsonws/layout/get-layouts?') &&
          url.includes('groupId=20121') &&
          url.includes('parentLayoutId=0')
        ) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }
        if (
          url.includes('/api/jsonws/layout/get-layouts?') &&
          url.includes('groupId=20122') &&
          url.includes('parentLayoutId=0')
        ) {
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
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(
        ['liferay', 'page-layout', 'diff', '--url', '/web/guest/home', '--reference-url', '/web/global/home'],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.equal).toBe(true);
    expect(parsed.diffCount).toBe(0);
    expect(process.exitCode).toBe(0);
    expect(output.stderr()).toBe('');
  });
});
