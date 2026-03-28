import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
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

export function resolveEnvContext(config: AppConfig): EnvContext {
  if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
    throw new CliError('No se ha detectado un proyecto válido con docker/ y liferay/.', {code: 'ENV_REPO_NOT_FOUND'});
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
  const directories = [
    context.dataRoot,
    path.join(context.dataRoot, 'liferay-data'),
    path.join(context.dataRoot, 'liferay-osgi-state'),
    path.join(context.dataRoot, 'liferay-deploy-cache'),
    path.join(context.dataRoot, 'elasticsearch-data'),
    path.join(context.dataRoot, 'patching'),
    path.join(context.dataRoot, 'dumps'),
    path.join(context.dataRoot, 'postgres-data'),
  ];

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
    await fs.copy(sourceDir, targetDir, {overwrite: true});
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
      createResult.stderr.trim() || createResult.stdout.trim() || `No se pudo crear el volumen ${volumeName}`,
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
