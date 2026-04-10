import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {
  buildComposeEnv,
  buildComposeFilesEnv,
  ensureEnvDataLayout,
  resolveDataRoot,
  resolveEnvContext,
  resolvePostgresStorage,
  resolveRuntimeStorage,
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

  test('ensureEnvDataLayout skips postgres-data directory when postgres uses a Docker volume', async () => {
    const repoRoot = createTempDir('dev-cli-env-layout-volume-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      'ENV_DATA_ROOT=./data/custom\nPOSTGRES_DATA_MODE=volume\nPOSTGRES_DATA_VOLUME_NAME=demo-postgres\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));

    await ensureEnvDataLayout(context);

    expect(fs.existsSync(path.join(context.dataRoot, 'postgres-data'))).toBe(false);
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
      expect(result.COMPOSE_FILE).toBe(['docker-compose.yml', 'docker-compose.elasticsearch.yml'].join(path.delimiter));
    });

    test('with elasticsearch and postgres: injects COMPOSE_FILE with full stack', () => {
      const result = buildComposeFilesEnv(['elasticsearch', 'postgres'], {});
      expect(result.COMPOSE_FILE).toBe(
        ['docker-compose.yml', 'docker-compose.elasticsearch.yml', 'docker-compose.postgres.yml'].join(path.delimiter),
      );
    });
  });

  test('resolvePostgresStorage uses explicit Docker volume mode when configured', () => {
    const repoRoot = createTempDir('dev-cli-env-postgres-storage-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\nPOSTGRES_DATA_MODE=volume\nPOSTGRES_DATA_VOLUME_NAME=demo-postgres\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const storage = resolvePostgresStorage(context);

    expect(storage.mode).toBe('volume');
    expect(storage.volumeName).toBe('demo-postgres');
    expect(storage.bindPath).toBe(path.join(repoRoot, 'docker', 'data', 'default', 'postgres-data'));
  });

  test('buildComposeEnv adds postgres volume override when volume mode is enabled', () => {
    const repoRoot = createTempDir('dev-cli-env-compose-volume-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.yml'), 'services:\n  postgres:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.volume.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\nPOSTGRES_DATA_MODE=volume\nPOSTGRES_DATA_VOLUME_NAME=demo-postgres\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const composeEnv = buildComposeEnv(context, {withServices: ['postgres'], baseEnv: {FOO: 'bar'}});

    expect(composeEnv.FOO).toBe('bar');
    expect(composeEnv.POSTGRES_DATA_VOLUME_NAME).toBe('demo-postgres');
    expect(composeEnv.COMPOSE_FILE).toBe(
      ['docker-compose.yml', 'docker-compose.postgres.yml', 'docker-compose.postgres.volume.yml'].join(path.delimiter),
    );
  });

  test('buildComposeEnv adds liferay volume override when runtime state uses Docker volumes', () => {
    const repoRoot = createTempDir('dev-cli-env-compose-liferay-volume-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.liferay.volume.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=demo',
        'ENV_DATA_ROOT=./data/default',
        'LIFERAY_DATA_MODE=volume',
        'LIFERAY_DATA_VOLUME_NAME=demo-liferay-data',
        'LIFERAY_OSGI_STATE_MODE=volume',
        'LIFERAY_OSGI_STATE_VOLUME_NAME=demo-liferay-osgi-state',
      ].join('\n') + '\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const composeEnv = buildComposeEnv(context, {baseEnv: {FOO: 'bar'}});

    expect(composeEnv.FOO).toBe('bar');
    expect(composeEnv.LIFERAY_DATA_VOLUME_NAME).toBe('demo-liferay-data');
    expect(composeEnv.LIFERAY_OSGI_STATE_VOLUME_NAME).toBe('demo-liferay-osgi-state');
    expect(composeEnv.LIFERAY_DEPLOY_CACHE_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.COMPOSE_FILE).toBe(
      ['docker-compose.yml', 'docker-compose.liferay.volume.yml'].join(path.delimiter),
    );
  });

  test('buildComposeEnv does not add volume overrides when runtime storage is forced to bind', () => {
    const repoRoot = createTempDir('dev-cli-env-compose-bind-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.yml'), 'services:\n  postgres:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.volume.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.liferay.volume.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=demo',
        'ENV_DATA_ROOT=./data/default',
        'POSTGRES_DATA_MODE=bind',
        'LIFERAY_DATA_MODE=bind',
        'LIFERAY_OSGI_STATE_MODE=bind',
      ].join('\n') + '\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const composeEnv = buildComposeEnv(context, {withServices: ['postgres'], baseEnv: {FOO: 'bar'}});

    expect(composeEnv.FOO).toBe('bar');
    expect(composeEnv.POSTGRES_DATA_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.LIFERAY_DATA_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.LIFERAY_OSGI_STATE_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.LIFERAY_DEPLOY_CACHE_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.COMPOSE_FILE).toBe(['docker-compose.yml', 'docker-compose.postgres.yml'].join(path.delimiter));
  });

  test('buildComposeEnv does not add volume overrides for auto mode on non-Windows', () => {
    const repoRoot = createTempDir('dev-cli-env-compose-auto-other-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.yml'), 'services:\n  postgres:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.volume.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.liferay.volume.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=demo',
        'ENV_DATA_ROOT=./data/default',
        'LDEV_STORAGE_PLATFORM=linux',
        'POSTGRES_DATA_MODE=auto',
        'LIFERAY_DATA_MODE=auto',
        'LIFERAY_OSGI_STATE_MODE=auto',
      ].join('\n') + '\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const composeEnv = buildComposeEnv(context, {withServices: ['postgres'], baseEnv: {FOO: 'bar'}});

    expect(composeEnv.FOO).toBe('bar');
    expect(composeEnv.POSTGRES_DATA_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.LIFERAY_DATA_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.LIFERAY_OSGI_STATE_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.LIFERAY_DEPLOY_CACHE_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.COMPOSE_FILE).toBe(['docker-compose.yml', 'docker-compose.postgres.yml'].join(path.delimiter));
  });

  test('buildComposeEnv keeps deploy cache on bind in auto mode on Windows', () => {
    const repoRoot = createTempDir('dev-cli-env-compose-auto-windows-deploy-cache-bind-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.yml'), 'services:\n  postgres:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.volume.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.liferay.volume.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=demo',
        'ENV_DATA_ROOT=./data/default',
        'LDEV_STORAGE_PLATFORM=windows',
        'POSTGRES_DATA_MODE=auto',
        'LIFERAY_DATA_MODE=auto',
        'LIFERAY_OSGI_STATE_MODE=auto',
      ].join('\n') + '\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const composeEnv = buildComposeEnv(context, {withServices: ['postgres'], baseEnv: {FOO: 'bar'}});

    expect(composeEnv.FOO).toBe('bar');
    expect(composeEnv.POSTGRES_DATA_VOLUME_NAME).toBe('demo-postgres-data');
    expect(composeEnv.LIFERAY_DATA_VOLUME_NAME).toBe('demo-liferay-data');
    expect(composeEnv.LIFERAY_OSGI_STATE_VOLUME_NAME).toBe('demo-liferay-osgi-state');
    expect(composeEnv.LIFERAY_DEPLOY_CACHE_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.COMPOSE_FILE).toBe(
      [
        'docker-compose.yml',
        'docker-compose.postgres.yml',
        'docker-compose.postgres.volume.yml',
        'docker-compose.liferay.volume.yml',
      ].join(path.delimiter),
    );
  });

  test('buildComposeEnv adds volume overrides for explicit volume mode on non-Windows', () => {
    const repoRoot = createTempDir('dev-cli-env-compose-explicit-volume-other-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.yml'), 'services:\n  postgres:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.postgres.volume.yml'), 'services:\n');
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.liferay.volume.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=demo',
        'ENV_DATA_ROOT=./data/default',
        'LDEV_STORAGE_PLATFORM=linux',
        'POSTGRES_DATA_MODE=volume',
        'POSTGRES_DATA_VOLUME_NAME=demo-postgres',
        'LIFERAY_DATA_MODE=volume',
        'LIFERAY_DATA_VOLUME_NAME=demo-liferay-data',
        'LIFERAY_OSGI_STATE_MODE=volume',
        'LIFERAY_OSGI_STATE_VOLUME_NAME=demo-liferay-osgi-state',
      ].join('\n') + '\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const composeEnv = buildComposeEnv(context, {withServices: ['postgres'], baseEnv: {FOO: 'bar'}});

    expect(composeEnv.FOO).toBe('bar');
    expect(composeEnv.POSTGRES_DATA_VOLUME_NAME).toBe('demo-postgres');
    expect(composeEnv.LIFERAY_DATA_VOLUME_NAME).toBe('demo-liferay-data');
    expect(composeEnv.LIFERAY_OSGI_STATE_VOLUME_NAME).toBe('demo-liferay-osgi-state');
    expect(composeEnv.LIFERAY_DEPLOY_CACHE_VOLUME_NAME).toBeUndefined();
    expect(composeEnv.COMPOSE_FILE).toBe(
      [
        'docker-compose.yml',
        'docker-compose.postgres.yml',
        'docker-compose.postgres.volume.yml',
        'docker-compose.liferay.volume.yml',
      ].join(path.delimiter),
    );
  });

  test('resolveRuntimeStorage always keeps deploy cache on bind mounts', () => {
    const repoRoot = createTempDir('dev-cli-env-deploy-cache-bind-only-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=demo',
        'ENV_DATA_ROOT=./data/default',
        'LDEV_STORAGE_PLATFORM=windows',
        'LIFERAY_DEPLOY_CACHE_MODE=volume',
        'LIFERAY_DEPLOY_CACHE_VOLUME_NAME=demo-liferay-deploy-cache',
      ].join('\n') + '\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const storage = resolveRuntimeStorage(context, 'liferay-deploy-cache');
    const composeEnv = buildComposeEnv(context, {baseEnv: {FOO: 'bar'}});

    expect(storage.mode).toBe('bind');
    expect(storage.bindPath).toBe(path.join(context.dataRoot, 'liferay-deploy-cache'));
    expect(composeEnv.LIFERAY_DEPLOY_CACHE_VOLUME_NAME).toBeUndefined();
  });

  test('buildComposeEnv adds elasticsearch volume override when data storage uses Docker volumes', () => {
    const repoRoot = createTempDir('dev-cli-env-compose-es-volume-');
    fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', 'docker-compose.elasticsearch.yml'),
      'services:\n  elasticsearch:\n',
    );
    fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.elasticsearch.volume.yml'), 'services:\n');
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=demo',
        'ENV_DATA_ROOT=./data/default',
        'ELASTICSEARCH_DATA_MODE=volume',
        'ELASTICSEARCH_DATA_VOLUME_NAME=demo-elasticsearch-data',
      ].join('\n') + '\n',
    );

    const context = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
    const composeEnv = buildComposeEnv(context, {withServices: ['elasticsearch'], baseEnv: {FOO: 'bar'}});

    expect(composeEnv.FOO).toBe('bar');
    expect(composeEnv.ELASTICSEARCH_DATA_VOLUME_NAME).toBe('demo-elasticsearch-data');
    expect(composeEnv.COMPOSE_FILE).toBe(
      ['docker-compose.yml', 'docker-compose.elasticsearch.yml', 'docker-compose.elasticsearch.volume.yml'].join(
        path.delimiter,
      ),
    );
  });
});
