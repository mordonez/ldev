import fs from 'fs-extra';
import path from 'node:path';

import {readEnvFile} from '../config/env-file.js';
import type {AppConfig} from '../config/load-config.js';
import {CliError} from '../errors.js';

export type EnvContext = {
  repoRoot: string;
  liferayDir: string;
  dockerDir: string;
  dockerComposeFile: string;
  dockerEnvFile: string;
  dockerEnvExampleFile: string | null;
  envValues: Record<string, string>;
  dataRoot: string;
  bindIp: string;
  httpPort: string;
  portalUrl: string;
  composeProjectName: string;
};

export type RuntimeStorageKey =
  | 'postgres-data'
  | 'liferay-data'
  | 'liferay-osgi-state'
  | 'liferay-deploy-cache'
  | 'elasticsearch-data';

export type RuntimeStorage = {
  key: RuntimeStorageKey;
  mode: 'bind' | 'volume';
  bindPath: string;
  volumeName: string;
};

export type PostgresStorage = RuntimeStorage;

export function resolveEnvContext(config: AppConfig): EnvContext {
  if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
    throw new CliError('No valid project with docker/ and liferay/ was detected.', {code: 'ENV_REPO_NOT_FOUND'});
  }

  const dockerEnvFile = config.files.dockerEnv ?? path.join(config.dockerDir, '.env');
  const dockerEnvExampleFile = path.join(config.dockerDir, '.env.example');
  const envValues = readEnvFile(dockerEnvFile);
  const bindIp = envValues.BIND_IP || 'localhost';
  const httpPort = envValues.LIFERAY_HTTP_PORT || '8080';

  return {
    repoRoot: config.repoRoot,
    liferayDir: config.liferayDir,
    dockerDir: config.dockerDir,
    dockerComposeFile: path.join(config.dockerDir, 'docker-compose.yml'),
    dockerEnvFile,
    dockerEnvExampleFile: fs.existsSync(dockerEnvExampleFile) ? dockerEnvExampleFile : null,
    envValues,
    dataRoot: resolveDataRoot(config.dockerDir, envValues.ENV_DATA_ROOT),
    bindIp,
    httpPort,
    portalUrl: `http://${bindIp}:${httpPort}`,
    composeProjectName: envValues.COMPOSE_PROJECT_NAME || 'liferay',
  };
}

export async function ensureEnvDataLayout(context: EnvContext): Promise<string[]> {
  const managedStorages = resolveManagedStorages(context);
  const directories = [
    context.dataRoot,
    path.join(context.dataRoot, 'liferay-deploy-cache'),
    path.join(context.dataRoot, 'elasticsearch-data'),
    path.join(context.dataRoot, 'patching'),
    path.join(context.dataRoot, 'dumps'),
  ];

  for (const storage of managedStorages) {
    if (storage.mode === 'bind') {
      directories.push(storage.bindPath);
    }
  }

  for (const directory of directories) {
    await fs.ensureDir(directory);
  }

  await normalizeEnvDataPermissions(context.dataRoot);

  return directories;
}

export function buildComposeFilesEnv(withServices: string[], baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (withServices.length === 0) return baseEnv ?? process.env;
  const files = ['docker-compose.yml', ...withServices.map((service) => `docker-compose.${service}.yml`)];
  return {...(baseEnv ?? process.env), COMPOSE_FILE: files.join(path.delimiter)};
}

export function buildComposeEnv(
  context: EnvContext,
  options?: {withServices?: string[]; baseEnv?: NodeJS.ProcessEnv},
): NodeJS.ProcessEnv {
  const requestedFiles =
    options?.withServices && options.withServices.length > 0
      ? ['docker-compose.yml', ...options.withServices.map((service) => `docker-compose.${service}.yml`)].filter(
          (file) => file === 'docker-compose.yml' || fs.existsSync(path.join(context.dockerDir, file)),
        )
      : parseComposeFiles(context.envValues.COMPOSE_FILE);
  const files = [...requestedFiles];
  const postgresStorage = resolvePostgresStorage(context);
  const liferayDataStorage = resolveRuntimeStorage(context, 'liferay-data');
  const liferayOsgiStateStorage = resolveRuntimeStorage(context, 'liferay-osgi-state');
  const elasticsearchDataStorage = resolveRuntimeStorage(context, 'elasticsearch-data');

  applyStorageModeOverrides(
    context,
    files,
    postgresStorage,
    liferayDataStorage,
    liferayOsgiStateStorage,
    elasticsearchDataStorage,
  );

  const env: NodeJS.ProcessEnv = {...(options?.baseEnv ?? process.env), COMPOSE_FILE: files.join(path.delimiter)};
  applyStorageVolumeEnvVars(
    env,
    postgresStorage,
    liferayDataStorage,
    liferayOsgiStateStorage,
    elasticsearchDataStorage,
  );
  return env;
}

export function resolvePostgresStorage(context: EnvContext): RuntimeStorage {
  return resolveRuntimeStorage(context, 'postgres-data');
}

export function resolveRuntimeStorage(context: EnvContext, key: RuntimeStorageKey): RuntimeStorage {
  if (key === 'liferay-deploy-cache') {
    return {
      key,
      mode: 'bind',
      bindPath: path.join(context.dataRoot, key),
      volumeName: `${context.composeProjectName}-liferay-deploy-cache`,
    };
  }

  const config = resolveRuntimeStorageConfig(context, key, detectStoragePlatform(context.envValues));
  return {
    key,
    mode: config.mode,
    bindPath: path.join(context.dataRoot, key),
    volumeName: config.volumeName,
  };
}

export function resolveManagedStorages(context: EnvContext): RuntimeStorage[] {
  return [
    resolveRuntimeStorage(context, 'postgres-data'),
    resolveRuntimeStorage(context, 'liferay-data'),
    resolveRuntimeStorage(context, 'liferay-osgi-state'),
    resolveRuntimeStorage(context, 'liferay-deploy-cache'),
    resolveRuntimeStorage(context, 'elasticsearch-data'),
  ];
}

export function resolveDataRoot(dockerDir: string, configured: string | undefined): string {
  const dataRoot = configured && configured !== '' ? configured : './data/default';
  return path.isAbsolute(dataRoot) ? dataRoot : path.resolve(dockerDir, dataRoot);
}

async function normalizeEnvDataPermissions(dataRoot: string): Promise<void> {
  const elasticsearchDataDir = path.join(dataRoot, 'elasticsearch-data');

  if (await fs.pathExists(elasticsearchDataDir)) {
    await fs.chmod(elasticsearchDataDir, 0o777);
  }
}

function parseComposeFiles(configured: string | undefined): string[] {
  if (!configured || configured.trim() === '') {
    return ['docker-compose.yml'];
  }

  const files = configured
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter((value) => value !== '');

  return [...new Set(files)];
}

function hasComposeFile(files: string[], expectedName: string): boolean {
  return files.some((file) => path.basename(file) === expectedName);
}

function addComposeFileIfMissing(files: string[], composeFile: string): void {
  if (!hasComposeFile(files, composeFile)) {
    files.push(composeFile);
  }
}

function applyStorageModeOverrides(
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

function applyStorageVolumeEnvVars(
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

function detectStoragePlatform(envValues: Record<string, string>): 'windows' | 'other' {
  const override = envValues.LDEV_STORAGE_PLATFORM?.trim().toLowerCase();
  if (override === 'windows') {
    return 'windows';
  }
  if (override === 'linux' || override === 'macos' || override === 'other') {
    return 'other';
  }

  return process.platform === 'win32' ? 'windows' : 'other';
}

function resolveRuntimeStorageConfig(
  context: EnvContext,
  key: Exclude<RuntimeStorageKey, 'liferay-deploy-cache'>,
  platform: 'windows' | 'other',
): {mode: 'bind' | 'volume'; volumeName: string} {
  const settings = {
    'postgres-data': {
      modeKey: 'POSTGRES_DATA_MODE',
      volumeKey: 'POSTGRES_DATA_VOLUME_NAME',
      defaultVolumeName: `${context.composeProjectName}-postgres-data`,
      autoVolumeOnWindows: true,
    },
    'liferay-data': {
      modeKey: 'LIFERAY_DATA_MODE',
      volumeKey: 'LIFERAY_DATA_VOLUME_NAME',
      defaultVolumeName: `${context.composeProjectName}-liferay-data`,
      autoVolumeOnWindows: true,
    },
    'liferay-osgi-state': {
      modeKey: 'LIFERAY_OSGI_STATE_MODE',
      volumeKey: 'LIFERAY_OSGI_STATE_VOLUME_NAME',
      defaultVolumeName: `${context.composeProjectName}-liferay-osgi-state`,
      autoVolumeOnWindows: true,
    },
    'elasticsearch-data': {
      modeKey: 'ELASTICSEARCH_DATA_MODE',
      volumeKey: 'ELASTICSEARCH_DATA_VOLUME_NAME',
      defaultVolumeName: `${context.composeProjectName}-elasticsearch-data`,
      autoVolumeOnWindows: true,
    },
  }[key];

  const requestedMode = context.envValues[settings.modeKey]?.trim().toLowerCase();
  const volumeName = context.envValues[settings.volumeKey]?.trim() || settings.defaultVolumeName;
  if (requestedMode === 'bind') {
    return {mode: 'bind', volumeName};
  }

  if (requestedMode === 'volume') {
    return {mode: 'volume', volumeName};
  }

  if (requestedMode !== undefined && requestedMode !== '' && requestedMode !== 'auto') {
    throw new CliError(`Invalid ${settings.modeKey} value "${requestedMode}". Use bind, volume, or auto.`, {
      code: 'ENV_INVALID_STORAGE_MODE',
    });
  }

  return {
    mode: platform === 'windows' && settings.autoVolumeOnWindows ? 'volume' : 'bind',
    volumeName,
  };
}
