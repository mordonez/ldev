import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {resolveDeployContext} from '../../src/features/deploy/deploy-gradle.js';
import {syncArtifactsToDeployCache} from '../../src/features/deploy/deploy-cache.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('syncArtifactsToDeployCache lock handling', () => {
  test('a real failure inside the locked operation is reported as-is, not as a lock timeout', async () => {
    const repoRoot = createTempDir('dev-cli-deploy-cache-lock-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\nLDEV_STORAGE_PLATFORM=other\n',
    );

    const config = loadConfig({cwd: repoRoot, env: process.env});
    const context = resolveDeployContext(config);

    const startedAt = Date.now();
    await expect(syncArtifactsToDeployCache(config, context, [])).rejects.toThrow('No deployable artifacts were found');
    await expect(syncArtifactsToDeployCache(config, context, [])).rejects.toMatchObject({
      code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
    });
    // Regression guard: this used to be swallowed by the lock-retry loop
    // (50 attempts * 100ms) and resurface ~5s later as a misleading
    // "Timed out waiting for deploy cache lock" instead.
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});
