import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {
  buildComposeFilesEnv,
  ensureEnvDataLayout,
  resolveDataRoot,
  resolveEnvContext,
  seedBuildDockerConfigs,
} from '../../src/features/env/env-files.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('env-files', () => {
  test('resolveDataRoot keeps absolute paths and resolves relative ones from docker dir', () => {
    expect(resolveDataRoot('/repo/docker', './data/default')).toBe('/repo/docker/data/default');
    expect(resolveDataRoot('/repo/docker', '/var/lib/liferay')).toBe('/var/lib/liferay');
    expect(resolveDataRoot('/repo/docker', undefined)).toBe('/repo/docker/data/default');
  });

  test('resolveEnvContext reads compose project and portal url from docker env', () => {
    const repoRoot = createTempDir('dev-cli-env-context-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      'COMPOSE_PROJECT_NAME=acme\nBIND_IP=127.0.0.1\nLIFERAY_HTTP_PORT=9080\nENV_DATA_ROOT=./data/custom\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));

    expect(context.composeProjectName).toBe('acme');
    expect(context.portalUrl).toBe('http://127.0.0.1:9080');
    expect(context.dataRoot).toBe(path.join(repoRoot, 'docker', 'data', 'custom'));
  });

  test('ensureEnvDataLayout makes elasticsearch data writable for bind mounts', async () => {
    const repoRoot = createTempDir('dev-cli-env-layout-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', '.env'), 'ENV_DATA_ROOT=./data/custom\n');

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));

    await ensureEnvDataLayout(context);

    const mode = fs.statSync(path.join(context.dataRoot, 'elasticsearch-data')).mode & 0o777;
    expect(mode).toBe(0o777);
  });

  test('seedBuildDockerConfigs precreates build docker deploy with writable permissions', async () => {
    const repoRoot = createTempDir('dev-cli-env-build-docker-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', '.env'), 'ENV_DATA_ROOT=./data/custom\n');
    fs.writeFileSync(path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'), 'foo=bar\n');

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));

    await seedBuildDockerConfigs(context);

    const deployDir = path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy');
    const mode = fs.statSync(deployDir).mode & 0o777;
    expect(
      fs.existsSync(path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-ext.properties')),
    ).toBe(true);
    expect(mode).toBe(0o775);
  });

  test('seedBuildDockerConfigs merges configs/common and configs/local into dockerenv when no explicit dockerenv exists', async () => {
    const repoRoot = createTempDir('dev-cli-env-common-local-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay', 'configs', 'common', 'osgi', 'configs'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay', 'configs', 'local', 'osgi', 'modules'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', '.env'), 'ENV_DATA_ROOT=./data/custom\n');
    fs.writeFileSync(
      path.join(repoRoot, 'liferay', 'configs', 'common', 'portal-ext.properties'),
      'include-and-override=portal-developer.properties\n',
    );
    fs.writeFileSync(
      path.join(repoRoot, 'liferay', 'configs', 'local', 'portal-setup-wizard.properties'),
      'setup.wizard.enabled=false\n',
    );
    fs.writeFileSync(path.join(repoRoot, 'liferay', 'configs', 'common', 'osgi', 'configs', 'common.config'), 'x=1\n');
    fs.writeFileSync(
      path.join(repoRoot, 'liferay', 'configs', 'local', 'osgi', 'modules', 'activation-key.xml'),
      '<xml />\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));

    await seedBuildDockerConfigs(context);

    expect(
      fs.existsSync(path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-ext.properties')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-setup-wizard.properties'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'osgi', 'configs', 'common.config'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          'liferay',
          'build',
          'docker',
          'configs',
          'dockerenv',
          'osgi',
          'modules',
          'activation-key.xml',
        ),
      ),
    ).toBe(true);
  });

  describe('buildComposeFilesEnv', () => {
    test('no services: returns base env unchanged', () => {
      const base = {FOO: 'bar'};
      const result = buildComposeFilesEnv([], base);
      expect(result).toEqual(base);
      expect(result.COMPOSE_FILE).toBeUndefined();
    });

    test('with elasticsearch: injects COMPOSE_FILE with ES add-on', () => {
      const result = buildComposeFilesEnv(['elasticsearch'], {});
      expect(result.COMPOSE_FILE).toBe('docker-compose.yml:docker-compose.elasticsearch.yml');
    });

    test('with elasticsearch and postgres: injects COMPOSE_FILE with full stack', () => {
      const result = buildComposeFilesEnv(['elasticsearch', 'postgres'], {});
      expect(result.COMPOSE_FILE).toBe(
        'docker-compose.yml:docker-compose.elasticsearch.yml:docker-compose.postgres.yml',
      );
    });
  });
});
