import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';

const FIXTURE_YAML = `
paths:
  structures: liferay/resources/journal/structures
`;

describe('load-config', () => {
  test('prefers process env over docker env over yaml over defaults', () => {
    const repoRoot = createTempRepo();
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'LIFERAY_CLI_URL=http://docker-env:8081',
        'LIFERAY_CLI_OAUTH2_CLIENT_ID=docker-id',
        'LIFERAY_CLI_OAUTH2_CLIENT_SECRET=docker-secret',
        'LIFERAY_CLI_HTTP_TIMEOUT_SECONDS=45',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(repoRoot, '.liferay-cli.yml'), FIXTURE_YAML);
    fs.writeFileSync(
      path.join(repoRoot, '.liferay-cli.local.yml'),
      'liferay:\n  url: http://local-profile:8080\n  oauth2:\n    clientId: local-id\n    clientSecret: local-secret\n    timeoutSeconds: 50\n',
    );

    const config = loadConfig({
      cwd: repoRoot,
      env: {
        LIFERAY_CLI_URL: 'http://process-env:9090',
        LIFERAY_CLI_OAUTH2_CLIENT_ID: 'env-id',
        LIFERAY_CLI_OAUTH2_CLIENT_SECRET: 'env-secret',
        LIFERAY_CLI_HTTP_TIMEOUT_SECONDS: '60',
      },
    });

    expect(config.liferay.url).toBe('http://process-env:9090');
    expect(config.liferay.oauth2ClientId).toBe('env-id');
    expect(config.liferay.oauth2ClientSecret).toBe('env-secret');
    expect(config.liferay.timeoutSeconds).toBe(60);
  });

  test('does not resolve runtime liferay auth/url from shared yaml', () => {
    const repoRoot = createTempRepo();
    fs.writeFileSync(path.join(repoRoot, '.liferay-cli.yml'), FIXTURE_YAML);

    const config = loadConfig({cwd: repoRoot, env: {}});

    expect(config.liferay.url).toBe('http://localhost:8080');
    expect(config.liferay.oauth2ClientId).toBe('');
    expect(config.liferay.oauth2ClientSecret).toBe('');
    expect(config.liferay.timeoutSeconds).toBe(30);
  });

  test('resolves runtime liferay auth/url from local profile before docker env', () => {
    const repoRoot = createTempRepo();
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'LIFERAY_CLI_URL=http://docker-env:8081',
        'LIFERAY_CLI_OAUTH2_CLIENT_ID=docker-id',
        'LIFERAY_CLI_OAUTH2_CLIENT_SECRET=docker-secret',
        'LIFERAY_CLI_HTTP_TIMEOUT_SECONDS=45',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(repoRoot, '.liferay-cli.local.yml'),
      'liferay:\n  url: http://local-profile:8080\n  oauth2:\n    clientId: local-id\n    clientSecret: local-secret\n    timeoutSeconds: 50\n',
    );

    const config = loadConfig({cwd: repoRoot, env: {}});

    expect(config.liferay.url).toBe('http://local-profile:8080');
    expect(config.liferay.oauth2ClientId).toBe('local-id');
    expect(config.liferay.oauth2ClientSecret).toBe('local-secret');
    expect(config.liferay.timeoutSeconds).toBe(50);
  });

  test('uses REPO_ROOT when cwd is not provided', () => {
    const repoRoot = createTempRepo();
    const unrelatedDir = path.join(repoRoot, 'vendor', 'liferay-tooling', 'tools', 'cli');

    fs.mkdirSync(unrelatedDir, {recursive: true});

    const config = loadConfig({
      env: {
        REPO_ROOT: repoRoot,
      },
    });

    expect(config.cwd).toBe(repoRoot);
    expect(config.repoRoot).toBe(repoRoot);
    expect(config.dockerDir).toBe(path.join(repoRoot, 'docker'));
  });
});
