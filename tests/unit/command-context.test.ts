import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, test} from 'vitest';

import {createCommandContext, resolveCommandRoot} from '../../src/cli/command-context.js';
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

  test('uses explicit repoRoot option before REPO_ROOT and cwd', () => {
    const explicitRepoRoot = createTempRepo();
    process.env.REPO_ROOT = createTempRepo();

    const context = createCommandContext({cwd: '/tmp/ignored-cwd', repoRoot: explicitRepoRoot});

    expect(context.cwd).toBe(explicitRepoRoot);
    expect(context.config.cwd).toBe(explicitRepoRoot);
    expect(context.config.repoRoot).toBe(explicitRepoRoot);
  });

  test('resolves top-level --repo-root from argv when command options do not include repoRoot', () => {
    const repoRoot = createTempRepo();
    process.argv = ['node', 'ldev', '--repo-root', repoRoot, 'doctor', '--json'];

    const resolved = resolveCommandRoot({cwd: '/tmp/fallback'});

    expect(resolved).toBe(repoRoot);
  });

  test('prefers repoRoot option over top-level --repo-root in argv', () => {
    const optionRepoRoot = createTempRepo();
    const argvRepoRoot = createTempRepo();
    process.argv = ['node', 'ldev', '--repo-root', argvRepoRoot, 'doctor', '--json'];

    const resolved = resolveCommandRoot({cwd: '/tmp/fallback', repoRoot: optionRepoRoot});

    expect(resolved).toBe(optionRepoRoot);
  });

  test('applies portal namespace liferay overrides from argv', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;

    process.argv = [
      'node',
      'ldev',
      'portal',
      '--liferay-url',
      'https://example.liferay.local',
      '--liferay-client-id=client-from-cli',
      '--liferay-client-secret',
      'secret-from-cli',
      '--liferay-scope-aliases',
      'scope.a,scope.b',
      '--liferay-timeout-seconds',
      '99',
      'check',
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

    process.argv = ['node', 'ldev', 'portal', '--liferay-client-secret-env', 'TEST_LIFERAY_SECRET', 'check'];

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
      'portal',
      '--liferay-client-secret',
      'secret-from-cli',
      '--liferay-client-secret-env',
      'TEST_LIFERAY_SECRET',
      'check',
    ];

    const context = createCommandContext();

    expect(context.config.liferay.oauth2ClientSecret).toBe('secret-from-cli');
  });

  test('throws when --liferay-timeout-seconds is negative', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', 'portal', '--liferay-timeout-seconds', '-1', 'check'];

    expect(() => createCommandContext()).toThrow('--liferay-timeout-seconds must be a positive integer.');
  });

  test('throws when --liferay-timeout-seconds is decimal', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', 'portal', '--liferay-timeout-seconds', '5.5', 'check'];

    expect(() => createCommandContext()).toThrow('--liferay-timeout-seconds must be a positive integer.');
  });

  test('throws when --liferay-url flag has no value', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', 'portal', '--liferay-url', '--json', 'check'];

    expect(() => createCommandContext()).toThrow('--liferay-url requires a value.');
  });

  test('throws when --liferay-url is not a valid http(s) URL', () => {
    const repoRoot = createTempRepo();
    process.env.REPO_ROOT = repoRoot;
    process.argv = ['node', 'ldev', 'portal', '--liferay-url', 'not-a-valid-url', 'check'];

    expect(() => createCommandContext()).toThrow('--liferay-url must be a valid http(s) URL.');
  });

  test('supports remote-only command context outside a detected repo', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-remote-only-'));
    process.env.TEST_LIFERAY_SECRET = 'secret-from-env-ref';
    process.argv = [
      'node',
      'ldev',
      'portal',
      '--liferay-url',
      'https://portal.example.com',
      '--liferay-client-id',
      'remote-client',
      '--liferay-client-secret-env',
      'TEST_LIFERAY_SECRET',
      'check',
    ];

    const context = createCommandContext({cwd: tempDir});

    expect(context.project.repo.inRepo).toBe(false);
    expect(context.project.projectType).toBe('unknown');
    expect(context.config.repoRoot).toBeNull();
    expect(context.config.liferay.url).toBe('https://portal.example.com');
    expect(context.config.liferay.oauth2ClientId).toBe('remote-client');
    expect(context.config.liferay.oauth2ClientSecret).toBe('secret-from-env-ref');
  });
});
