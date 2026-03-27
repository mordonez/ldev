import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {FIXTURE_YAML} from '../../src/testing/fixtures.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';

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

  test('uses yaml when env values are missing', () => {
    const repoRoot = createTempRepo();
    fs.writeFileSync(path.join(repoRoot, '.liferay-cli.yml'), FIXTURE_YAML);

    const config = loadConfig({cwd: repoRoot, env: {}});

    expect(config.liferay.url).toBe('http://profile:7070');
    expect(config.liferay.oauth2ClientId).toBe('profile-client-id');
    expect(config.liferay.oauth2ClientSecret).toBe('profile-client-secret');
    expect(config.liferay.timeoutSeconds).toBe(55);
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
