import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';
import {captureProcessOutput, createLiferayCliRepoFixture} from '../../src/testing/cli-test-helpers.js';

describe('liferay auth smoke', () => {
  let repoRoot: string;
  let output: ReturnType<typeof captureProcessOutput>;

  beforeEach(async () => {
    repoRoot = await createLiferayCliRepoFixture('dev-cli-liferay-auth-');
    output = captureProcessOutput();
  });

  afterEach(() => {
    output.restore();
    vi.unstubAllGlobals();
  });

  test('dev-cli liferay --help works', async () => {
    const cli = createCli();
    cli.exitOverride();

    await expect(cli.parseAsync(['liferay', '--help'], {from: 'user'})).rejects.toThrow(
      'process.exit unexpectedly called with "0"',
    );

    expect(output.stdout()).toContain('auth');
    expect(output.stdout()).toContain('check');
  });

  test('dev-cli liferay auth --help works', async () => {
    const cli = createCli();
    cli.exitOverride();

    await expect(cli.parseAsync(['liferay', 'auth', '--help'], {from: 'user'})).rejects.toThrow(
      'process.exit unexpectedly called with "0"',
    );

    expect(output.stdout()).toContain('token');
  });

  test('dev-cli liferay check works with fake fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'check'], {from: 'user'});
      expect(output.stdout()).toContain('HEALTH_OK');
      expect(output.stdout()).toContain('clientId=client-id');
      expect(output.stderr()).toBe('');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('dev-cli liferay auth token --raw works with fake fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {status: 200}),
      ),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'auth', 'token', '--raw'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    expect(output.stdout().trim()).toBe('token-12345678');
  });
});
