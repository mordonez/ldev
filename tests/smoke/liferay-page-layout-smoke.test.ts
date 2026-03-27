import fs from 'fs-extra';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';
import {captureProcessOutput, createLiferayCliRepoFixture} from '../../src/testing/cli-test-helpers.js';

describe('liferay page-layout smoke', () => {
  let repoRoot: string;
  let output: ReturnType<typeof captureProcessOutput>;

  beforeEach(async () => {
    repoRoot = await createLiferayCliRepoFixture('dev-cli-liferay-page-layout-');
    output = captureProcessOutput();
  });

  afterEach(() => {
    output.restore();
    vi.unstubAllGlobals();
  });

  test('dev-cli liferay page-layout export prints json to stdout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {status: 200});
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
          return new Response(
            '{"id":5001,"uuid":"uuid-1","friendlyUrlPath":"home","pageType":"Content Layout","siteId":20121,"title":"Home","pageDefinition":{"widgets":[]}}',
            {status: 200},
          );
        }

        if (url.endsWith('/site-pages/home/experiences')) {
          return new Response('{"items":[{"id":9001,"name":"Default"}],"lastPage":1}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'page-layout', 'export', '--url', '/web/guest/home'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.kind).toBe('liferay-page-layout-export');
    expect(parsed.source.friendlyUrl).toBe('/home');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay page-layout export writes to file', async () => {
    const outputPath = path.join(repoRoot, 'exports', 'home.json');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {status: 200});
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
          return new Response(
            '{"id":5001,"uuid":"uuid-1","friendlyUrlPath":"home","pageType":"Content Layout","siteId":20121,"title":"Home","pageDefinition":{"widgets":[]}}',
            {status: 200},
          );
        }

        if (url.endsWith('/site-pages/home/experiences')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'page-layout', 'export', '--url', '/web/guest/home', '--output', outputPath], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    expect(JSON.parse(output.stdout())).toEqual({outputPath: path.resolve(outputPath)});
    const written = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(written.kind).toBe('liferay-page-layout-export');
    expect(output.stderr()).toBe('');
  });
});
