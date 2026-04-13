import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {readEnvFile, upsertEnvFileValues} from '../../core/config/env-file.js';
import {parseComposeFiles} from './env-compose-helpers.js';
import {detectStoragePlatform} from './env-storage-config.js';
import {normalizeEnvDataPermissions, resolveDockerConfigSourceDirs, copyDirectoryContents} from './env-data-utils.js';
import {buildComposeFilesEnv, applyStorageModeOverrides, applyStorageVolumeEnvVars} from './env-compose-env.js';
import {ensureDoclibVolume} from './env-doclib-volume.js';

export {buildComposeFilesEnv, ensureDoclibVolume};

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

export type PostgresStorage = {
  mode: 'bind' | 'volume';
  bindPath: string;
  volumeName: string;
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

export async function ensureEnvFile(context: EnvContext): Promise<{created: boolean; mergedKeys: string[]}> {
  if (!(await fs.pathExists(context.dockerEnvFile))) {
    if (context.dockerEnvExampleFile) {
      await fs.copy(context.dockerEnvExampleFile, context.dockerEnvFile);
      return {created: true, mergedKeys: []};
    }

    await fs.writeFile(context.dockerEnvFile, '');
    return {created: true, mergedKeys: []};
  }

  if (!context.dockerEnvExampleFile) {
    return {created: false, mergedKeys: []};
  }

  const currentContent = await fs.readFile(context.dockerEnvFile, 'utf8');
  const exampleValues = readEnvFile(context.dockerEnvExampleFile);
  const currentValues = readEnvFile(context.dockerEnvFile);
  const missingEntries = Object.fromEntries(Object.entries(exampleValues).filter(([key]) => !(key in currentValues)));

  if (Object.keys(missingEntries).length === 0) {
    return {created: false, mergedKeys: []};
  }

  const updatedContent = upsertEnvFileValues(currentContent, missingEntries);
  await fs.writeFile(context.dockerEnvFile, `${updatedContent}\n`);
  return {created: false, mergedKeys: Object.keys(missingEntries)};
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

export async function seedBuildDockerConfigs(context: EnvContext): Promise<boolean> {
  const targetDir = path.join(context.liferayDir, 'build', 'docker', 'configs', 'dockerenv');
  const deployDir = path.join(context.liferayDir, 'build', 'docker', 'deploy');

  await fs.ensureDir(deployDir);
  await fs.chmod(deployDir, 0o775);

  const sourceDirs = await resolveDockerConfigSourceDirs(context.liferayDir);
  if (sourceDirs.length === 0) {
    return false;
  }

  const hasExplicitDockerenv = await fs.pathExists(path.join(context.liferayDir, 'configs', 'dockerenv'));
  if (!hasExplicitDockerenv) {
    await fs.emptyDir(targetDir);
  } else {
    await fs.ensureDir(targetDir);
  }

  for (const sourceDir of sourceDirs) {
    await copyDirectoryContents(sourceDir, targetDir);
  }

  return true;
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

export function resolveDataRoot(dockerDir: string, configured: string | undefined): string {
  const dataRoot = configured && configured !== '' ? configured : './data/default';
  return path.isAbsolute(dataRoot) ? dataRoot : path.resolve(dockerDir, dataRoot);
}
