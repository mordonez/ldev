import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {runEnvSetup} from '../../src/features/env/env-setup.js';
import {createFakeDockerBin} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('env compose profiles (ldev setup --with)', () => {
  test('solo DXP: setup without --with does not write COMPOSE_FILE to .env', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runEnvSetup(loadConfig({cwd: repoRoot, env: process.env}), {
      skipPull: true,
      processEnv,
    });

    expect(result.composeFileWritten).toBeNull();
    const envContent = await fs.readFile(path.join(repoRoot, 'docker', '.env'), 'utf8');
    expect(envContent).not.toContain('COMPOSE_FILE=');
  }, 20_000);

  test('DXP + Elasticsearch: setup --with elasticsearch persists COMPOSE_FILE and copies ElasticsearchConfiguration.config to workspace', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runEnvSetup(loadConfig({cwd: repoRoot, env: process.env}), {
      with: ['elasticsearch'],
      skipPull: true,
      processEnv,
    });

    const esComposeFile = ['docker-compose.yml', 'docker-compose.elasticsearch.yml'].join(path.delimiter);
    expect(result.composeFileWritten).toBe(esComposeFile);
    const envContent = await fs.readFile(path.join(repoRoot, 'docker', '.env'), 'utf8');
    expect(envContent).toContain(`COMPOSE_FILE=${esComposeFile}`);
    expect(
      await fs.pathExists(
        path.join(
          repoRoot,
          'liferay',
          'configs',
          'dockerenv',
          'osgi',
          'configs',
          'com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration.config',
        ),
      ),
    ).toBe(true);
  }, 20_000);

  test('DXP + ES + PostgreSQL: setup --with elasticsearch --with postgres persists COMPOSE_FILE with full stack', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runEnvSetup(loadConfig({cwd: repoRoot, env: process.env}), {
      with: ['elasticsearch', 'postgres'],
      skipPull: true,
      processEnv,
    });

    const fullComposeFile = [
      'docker-compose.yml',
      'docker-compose.elasticsearch.yml',
      'docker-compose.postgres.yml',
    ].join(path.delimiter);
    expect(result.composeFileWritten).toBe(fullComposeFile);
    const envContent = await fs.readFile(path.join(repoRoot, 'docker', '.env'), 'utf8');
    expect(envContent).toContain(`COMPOSE_FILE=${fullComposeFile}`);
  }, 20_000);
});

async function createEnvRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-env-profiles-');
  await fs.ensureDir(path.join(repoRoot, 'docker', 'liferay-configs-full', 'osgi', 'configs'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'osgi', 'configs'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nENV_DATA_ROOT=./data/default\nBIND_IP=localhost\nLIFERAY_HTTP_PORT=8080\n',
  );
  await fs.writeFile(
    path.join(
      repoRoot,
      'docker',
      'liferay-configs-full',
      'osgi',
      'configs',
      'com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration.config',
    ),
    'operationMode="REMOTE"\nnetworkHostAddresses=["http://elasticsearch:9200"]\n',
  );
  await fs.writeFile(
    path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'),
    'virtual.hosts.valid.hosts=*\n',
  );
  return repoRoot;
}
