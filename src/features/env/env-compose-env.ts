import path from 'node:path';

import fs from 'fs-extra';

import type {EnvContext, RuntimeStorage} from './env-files.js';
import {hasComposeFile, addComposeFileIfMissing} from './env-compose-helpers.js';

export type ComposeEnvironmentOptions = {
  withServices?: string[];
  baseEnv?: NodeJS.ProcessEnv;
};

export function buildComposeFilesEnv(withServices: string[], baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (withServices.length === 0) return baseEnv ?? process.env;
  const files = ['docker-compose.yml', ...withServices.map((s) => `docker-compose.${s}.yml`)];
  return {...(baseEnv ?? process.env), COMPOSE_FILE: files.join(path.delimiter)};
}

export function applyStorageModeOverrides(
  context: EnvContext,
  files: string[],
  postgresStorage: RuntimeStorage,
  liferayDataStorage: RuntimeStorage,
  liferayOsgiStateStorage: RuntimeStorage,
  elasticsearchDataStorage: RuntimeStorage,
): void {
  if (
    postgresStorage.mode === 'volume' &&
    hasComposeFile(files, 'docker-compose.postgres.yml') &&
    fs.existsSync(path.join(context.dockerDir, 'docker-compose.postgres.volume.yml')) &&
    !hasComposeFile(files, 'docker-compose.postgres.volume.yml')
  ) {
    addComposeFileIfMissing(files, 'docker-compose.postgres.volume.yml');
  }

  if (
    (liferayDataStorage.mode === 'volume' || liferayOsgiStateStorage.mode === 'volume') &&
    fs.existsSync(path.join(context.dockerDir, 'docker-compose.liferay.volume.yml')) &&
    !hasComposeFile(files, 'docker-compose.liferay.volume.yml')
  ) {
    addComposeFileIfMissing(files, 'docker-compose.liferay.volume.yml');
  }

  if (
    elasticsearchDataStorage.mode === 'volume' &&
    hasComposeFile(files, 'docker-compose.elasticsearch.yml') &&
    fs.existsSync(path.join(context.dockerDir, 'docker-compose.elasticsearch.volume.yml')) &&
    !hasComposeFile(files, 'docker-compose.elasticsearch.volume.yml')
  ) {
    addComposeFileIfMissing(files, 'docker-compose.elasticsearch.volume.yml');
  }
}

export function applyStorageVolumeEnvVars(
  env: NodeJS.ProcessEnv,
  postgresStorage: RuntimeStorage,
  liferayDataStorage: RuntimeStorage,
  liferayOsgiStateStorage: RuntimeStorage,
  elasticsearchDataStorage: RuntimeStorage,
): void {
  if (postgresStorage.mode === 'volume') {
    env.POSTGRES_DATA_VOLUME_NAME = postgresStorage.volumeName;
  }
  if (liferayDataStorage.mode === 'volume') {
    env.LIFERAY_DATA_VOLUME_NAME = liferayDataStorage.volumeName;
  }
  if (liferayOsgiStateStorage.mode === 'volume') {
    env.LIFERAY_OSGI_STATE_VOLUME_NAME = liferayOsgiStateStorage.volumeName;
  }
  if (elasticsearchDataStorage.mode === 'volume') {
    env.ELASTICSEARCH_DATA_VOLUME_NAME = elasticsearchDataStorage.volumeName;
  }
}
