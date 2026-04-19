import {afterEach, describe, expect, test} from 'vitest';

import {createCommandContext} from '../../src/cli/command-context.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';

describe('command-context', () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    delete process.env.REPO_ROOT;
    delete process.env.TEST_LIFERAY_SECRET;
    process.argv = [...originalArgv];
  });

  test('uses REPO_ROOT as effective cwd when present', () => {
    const repoRoot = createTempRepo();

    process.env.REPO_ROOT = repoRoot;

    const context = createCommandContext({cwd: '/tmp/ignored-by-repo-root'});

    expect(context.cwd).toBe(repoRoot);
    expect(context.config.cwd).toBe(repoRoot);
    expect(context.config.repoRoot).toBe(repoRoot);
  });

  test('applies global CLI liferay overrides from argv', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;

    process.argv = [
      'node',
      'ldev',
      '--liferay-url',
      'https://example.liferay.local',
      '--liferay-client-id=client-from-cli',
      '--liferay-client-secret',
      'secret-from-cli',
      '--liferay-scope-aliases',
      'scope.a,scope.b',
      '--liferay-timeout-seconds',
      '99',
    ];

    const context = createCommandContext();

    expect(context.config.liferay.url).toBe('https://example.liferay.local');
    expect(context.config.liferay.oauth2ClientId).toBe('client-from-cli');
    expect(context.config.liferay.oauth2ClientSecret).toBe('secret-from-cli');
    expect(context.config.liferay.scopeAliases).toBe('scope.a,scope.b');
    expect(context.config.liferay.timeoutSeconds).toBe(99);
  });

  test('resolves client secret from --liferay-client-secret-env', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.env.TEST_LIFERAY_SECRET = 'secret-from-env-ref';

    process.argv = ['node', 'ldev', '--liferay-client-secret-env', 'TEST_LIFERAY_SECRET'];

    const context = createCommandContext();

    expect(context.config.liferay.oauth2ClientSecret).toBe('secret-from-env-ref');
  });

  test('prefers --liferay-client-secret over --liferay-client-secret-env when both are present', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.env.TEST_LIFERAY_SECRET = 'secret-from-env-ref';

    process.argv = [
      'node',
      'ldev',
      '--liferay-client-secret',
      'secret-from-cli',
      '--liferay-client-secret-env',
      'TEST_LIFERAY_SECRET',
    ];

    const context = createCommandContext();

    expect(context.config.liferay.oauth2ClientSecret).toBe('secret-from-cli');
  });

  test('throws when --liferay-timeout-seconds is negative', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', '--liferay-timeout-seconds', '-1'];

    expect(() => createCommandContext()).toThrow('--liferay-timeout-seconds must be a positive integer.');
  });

  test('throws when --liferay-timeout-seconds is decimal', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', '--liferay-timeout-seconds', '5.5'];

    expect(() => createCommandContext()).toThrow('--liferay-timeout-seconds must be a positive integer.');
  });

  test('throws when --liferay-url flag has no value', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', '--liferay-url', '--json'];

    expect(() => createCommandContext()).toThrow('--liferay-url requires a value.');
  });

  test('throws when --liferay-url is not a valid http(s) URL', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', '--liferay-url', 'not-a-valid-url'];

    expect(() => createCommandContext()).toThrow('--liferay-url must be a valid http(s) URL.');
  });
});
