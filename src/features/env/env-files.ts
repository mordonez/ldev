import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import {runDocker} from '../../core/platform/docker.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {readEnvFile, upsertEnvFileValues} from '../../core/config/env-file.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';

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

export async function ensureDoclibVolume(
  context: EnvContext,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<{volumeName: string; devicePath: string; reused: boolean}> {
  const worktreeContext = resolveWorktreeContext(context.repoRoot);
  const mainDockerDir = worktreeContext.isWorktree
    ? path.join(worktreeContext.mainRepoRoot, 'docker')
    : context.dockerDir;
  const mainDockerEnvFile = path.join(mainDockerDir, '.env');
  const mainValues = readEnvFile(mainDockerEnvFile);
  const mainComposeProject = mainValues.COMPOSE_PROJECT_NAME || 'liferay';
  const mainDoclibVolume = mainValues.DOCLIB_VOLUME_NAME || `${mainComposeProject}-doclib`;
  const volumeName = context.envValues.DOCLIB_VOLUME_NAME || mainDoclibVolume;
  const devicePath = await resolveDesiredDoclibPath(
    context,
    worktreeContext.isWorktree ? mainDockerDir : context.dockerDir,
  );

  await fs.ensureDir(devicePath);

  const existingType = (
    await runDocker(['volume', 'inspect', volumeName, '--format', '{{index .Options "type"}}'], {
      env: options?.processEnv,
      reject: false,
    })
  ).stdout.trim();

  if (existingType === 'cifs') {
    return {
      volumeName,
      devicePath,
      reused: true,
    };
  }

  const existingDevice = (
    await runDocker(['volume', 'inspect', volumeName, '--format', '{{index .Options "device"}}'], {
      env: options?.processEnv,
      reject: false,
    })
  ).stdout.trim();

  if (existingDevice === devicePath) {
    return {
      volumeName,
      devicePath,
      reused: true,
    };
  }

  await runDocker(['volume', 'rm', volumeName], {env: options?.processEnv, reject: false});
  const createResult = await runDocker(
    [
      'volume',
      'create',
      '--driver',
      'local',
      '--opt',
      'type=none',
      '--opt',
      `device=${devicePath}`,
      '--opt',
      'o=bind',
      volumeName,
    ],
    {env: options?.processEnv, reject: false},
  );

  if (!createResult.ok) {
    throw new CliError(
      createResult.stderr.trim() || createResult.stdout.trim() || `Could not create volume ${volumeName}`,
      {
        code: 'ENV_DOCLIB_VOLUME_ERROR',
      },
    );
  }

  return {
    volumeName,
    devicePath,
    reused: false,
  };
}

export function buildComposeFilesEnv(withServices: string[], baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (withServices.length === 0) return baseEnv ?? process.env;
  const files = ['docker-compose.yml', ...withServices.map((s) => `docker-compose.${s}.yml`)];
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

  if (
    postgresStorage.mode === 'volume' &&
    files.includes('docker-compose.postgres.yml') &&
    fs.existsSync(path.join(context.dockerDir, 'docker-compose.postgres.volume.yml')) &&
    !files.includes('docker-compose.postgres.volume.yml')
  ) {
    files.push('docker-compose.postgres.volume.yml');
  }

  if (
    (liferayDataStorage.mode === 'volume' || liferayOsgiStateStorage.mode === 'volume') &&
    fs.existsSync(path.join(context.dockerDir, 'docker-compose.liferay.volume.yml')) &&
    !files.includes('docker-compose.liferay.volume.yml')
  ) {
    files.push('docker-compose.liferay.volume.yml');
  }

  if (
    elasticsearchDataStorage.mode === 'volume' &&
    files.includes('docker-compose.elasticsearch.yml') &&
    fs.existsSync(path.join(context.dockerDir, 'docker-compose.elasticsearch.volume.yml')) &&
    !files.includes('docker-compose.elasticsearch.volume.yml')
  ) {
    files.push('docker-compose.elasticsearch.volume.yml');
  }

  const env: NodeJS.ProcessEnv = {...(options?.baseEnv ?? process.env), COMPOSE_FILE: files.join(path.delimiter)};
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
  return env;
}

export function resolvePostgresStorage(context: EnvContext): PostgresStorage {
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

  return {
    mode: platform === 'windows' && settings.autoVolumeOnWindows ? 'volume' : 'bind',
    volumeName,
  };
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

function parseComposeFiles(configured: string | undefined): string[] {
  if (!configured || configured.trim() === '') {
    return ['docker-compose.yml'];
  }

  return configured
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter((value) => value !== '');
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

function resolveSharedDoclibPath(context: EnvContext, mainDockerDir: string): string {
  const mainEnvFile = path.join(mainDockerDir, '.env');
  const mainValues = readEnvFile(mainEnvFile);
  const mainDataRoot = resolveDataRoot(mainDockerDir, mainValues.ENV_DATA_ROOT);

  return path.join(mainDataRoot, 'liferay-doclib');
}

async function resolveDesiredDoclibPath(context: EnvContext, mainDockerDir: string): Promise<string> {
  const configuredPath = context.envValues.DOCLIB_PATH?.trim();
  if (configuredPath) {
    const resolvedConfiguredPath = path.resolve(configuredPath);
    if (await fs.pathExists(resolvedConfiguredPath)) {
      return resolvedConfiguredPath;
    }
  }

  return resolveSharedDoclibPath(context, mainDockerDir);
}

async function resolveDockerConfigSourceDirs(liferayDir: string): Promise<string[]> {
  const dockerenvDir = path.join(liferayDir, 'configs', 'dockerenv');
  if (await fs.pathExists(dockerenvDir)) {
    return [dockerenvDir];
  }

  const sourceDirs: string[] = [];
  const commonDir = path.join(liferayDir, 'configs', 'common');
  const localDir = path.join(liferayDir, 'configs', 'local');

  if (await fs.pathExists(commonDir)) {
    sourceDirs.push(commonDir);
  }

  if (await fs.pathExists(localDir)) {
    sourceDirs.push(localDir);
  }

  return sourceDirs;
}

async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  const entries = await fs.readdir(sourceDir);

  for (const entry of entries) {
    await fs.copy(path.join(sourceDir, entry), path.join(targetDir, entry), {overwrite: true});
  }
}
