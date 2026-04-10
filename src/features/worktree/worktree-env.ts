import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../core/config/load-config.js';
import {CliError} from '../../core/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import {readEnvFile, upsertEnvFileValues} from '../../core/config/env-file.js';
import type {Printer} from '../../core/output/printer.js';
import {resolveManagedStorages} from '../env/env-files.js';
import {resolveWorktreeContext, resolveWorktreeTarget, resolvePortSet, type WorktreeTarget} from './worktree-paths.js';
import {syncWorktreeLocalArtifacts} from './worktree-local-artifacts.js';
import {cloneInitialWorktreeState, resolveBtrfsConfig, worktreeEnvHasState} from './worktree-state.js';

export type WorktreeEnvResult = {
  ok: true;
  worktreeName: string;
  worktreeDir: string;
  dockerDir: string;
  envFile: string;
  composeProjectName: string;
  portalUrl: string;
  dataRoot: string;
  ports: {
    httpPort: string;
    debugPort: string;
    gogoPort: string;
    postgresPort: string;
    esHttpPort: string;
  };
  createdEnvFile: boolean;
  clonedState: boolean;
  btrfsEnabled: boolean;
};

export async function runWorktreeEnv(options: {
  cwd: string;
  name?: string;
  printer?: Printer;
}): Promise<WorktreeEnvResult> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot) {
    throw new CliError('No valid repository was detected for worktree env.', {
      code: 'WORKTREE_REPO_NOT_FOUND',
    });
  }

  const context = resolveWorktreeContext(config.repoRoot);
  const target = resolveTarget(context, options.name);
  const mainConfig = loadConfig({cwd: context.mainRepoRoot, env: process.env});
  const mainEnvContext = resolveLocalEnvContext(mainConfig);
  const sourceEnvFile = (await fs.pathExists(mainEnvContext.dockerEnvFile))
    ? mainEnvContext.dockerEnvFile
    : mainEnvContext.dockerEnvExampleFile;

  await fs.ensureDir(target.dockerDir);

  let createdEnvFile = false;
  if (sourceEnvFile && !(await fs.pathExists(target.envFile))) {
    await fs.copy(sourceEnvFile, target.envFile);
    createdEnvFile = true;
  } else if (!(await fs.pathExists(target.envFile))) {
    await fs.writeFile(target.envFile, '');
    createdEnvFile = true;
  }

  const currentContent = await fs.readFile(target.envFile, 'utf8');
  const currentValues = readEnvFile(target.envFile);
  const mainValues = readEnvFile(mainEnvContext.dockerEnvFile);
  const btrfs = await resolveBtrfsConfig(mainEnvContext, mainValues);
  const ports = resolvePortSet(target.name);
  const bindIp = currentValues.BIND_IP || mainValues.BIND_IP || '127.0.0.1';
  const mainComposeProject = mainValues.COMPOSE_PROJECT_NAME || 'liferay';
  const envDataRoot = btrfs.enabled
    ? path.join(btrfs.envsDir ?? path.join(mainEnvContext.dockerDir, 'btrfs', 'envs'), target.name)
    : path.join(target.dockerDir, 'data', 'envs', target.name);
  const nextValues = {
    ...mainValues,
    ...currentValues,
    BIND_IP: bindIp,
    LIFERAY_CLI_URL: `http://${bindIp}:${ports.httpPort}`,
    COMPOSE_PROJECT_NAME: `${mainComposeProject}-${target.name}`,
    VOLUME_PREFIX: `${mainComposeProject}-${target.name}`,
    DOCLIB_VOLUME_NAME: mainValues.DOCLIB_VOLUME_NAME || `${mainComposeProject}-doclib`,
    LIFERAY_HTTP_PORT: ports.httpPort,
    LIFERAY_DEBUG_PORT: ports.debugPort,
    GOGO_PORT: ports.gogoPort,
    POSTGRES_PORT: ports.postgresPort,
    ES_HTTP_PORT: ports.esHttpPort,
    ENV_DATA_ROOT: envDataRoot,
    ...(btrfs.enabled && btrfs.rootDir && btrfs.baseDir && btrfs.envsDir && btrfs.useSnapshots
      ? {
          BTRFS_ROOT: btrfs.rootDir,
          BTRFS_BASE: btrfs.baseDir,
          BTRFS_ENVS: btrfs.envsDir,
          USE_BTRFS_SNAPSHOTS: btrfs.useSnapshots,
        }
      : {}),
  };

  const updated = upsertEnvFileValues(currentContent, nextValues);
  await fs.writeFile(target.envFile, updated === '' ? '' : `${updated}\n`);

  const targetEnvContext = {
    ...mainEnvContext,
    repoRoot: target.worktreeDir,
    liferayDir: path.join(target.worktreeDir, 'liferay'),
    dockerDir: target.dockerDir,
    dockerComposeFile: path.join(target.dockerDir, 'docker-compose.yml'),
    dockerEnvFile: target.envFile,
    envValues: nextValues,
    dataRoot: resolveLocalDataRoot(target.dockerDir, envDataRoot),
    bindIp,
    httpPort: ports.httpPort,
    portalUrl: `http://${bindIp}:${ports.httpPort}`,
    composeProjectName: `${mainComposeProject}-${target.name}`,
  };

  const clonedState = !(await worktreeEnvHasState(envDataRoot, targetEnvContext))
    ? await cloneInitialWorktreeState({
        mainEnvContext,
        targetDataRoot: envDataRoot,
        targetEnvContext,
        btrfs,
      })
    : false;

  await syncWorktreeLocalArtifacts(context.mainRepoRoot, target.worktreeDir);

  const worktreeConfig = loadConfig({cwd: target.worktreeDir, env: process.env});
  const worktreeEnvContext = resolveLocalEnvContext(worktreeConfig);
  await ensureLocalEnvDataLayout(worktreeEnvContext.dataRoot);
  await seedLocalBuildDockerConfigs(worktreeEnvContext.liferayDir);
  if (worktreeConfig.repoRoot && worktreeConfig.liferayDir && worktreeConfig.dockerDir) {
    await restoreLocalArtifactsFromDeployCache(worktreeConfig);
  }
  await ensurePortalExtLocalOverride(target.worktreeDir, ports.httpPort);

  if (options.printer) {
    options.printer.info(`Worktree env preparado: ${target.name} (${ports.httpPort})`);
  }

  return {
    ok: true,
    worktreeName: target.name,
    worktreeDir: target.worktreeDir,
    dockerDir: target.dockerDir,
    envFile: target.envFile,
    composeProjectName: `${mainComposeProject}-${target.name}`,
    portalUrl: `http://${bindIp}:${ports.httpPort}`,
    dataRoot: resolveLocalDataRoot(target.dockerDir, envDataRoot),
    ports,
    createdEnvFile,
    clonedState,
    btrfsEnabled: btrfs.enabled,
  };
}

export function formatWorktreeEnv(result: WorktreeEnvResult): string {
  return [
    `Worktree env OK: ${result.worktreeName}`,
    `Worktree: ${result.worktreeDir}`,
    `Portal URL: ${result.portalUrl}`,
    `Compose project: ${result.composeProjectName}`,
    `ENV_DATA_ROOT: ${result.dataRoot}`,
    `Initial state cloned: ${result.clonedState ? 'yes' : 'no'}`,
  ].join('\n');
}

function resolveTarget(context: ReturnType<typeof resolveWorktreeContext>, name?: string): WorktreeTarget {
  if (name && name.trim() !== '') {
    return resolveWorktreeTarget(context.mainRepoRoot, name);
  }

  if (!context.isWorktree || !context.currentWorktreeName) {
    throw new CliError('worktree env debe ejecutarse dentro de un worktree o recibir --name.', {
      code: 'WORKTREE_NAME_REQUIRED',
    });
  }

  return resolveWorktreeTarget(context.mainRepoRoot, context.currentWorktreeName);
}

async function ensurePortalExtLocalOverride(worktreeDir: string, httpPort: string): Promise<void> {
  const sourceDir = path.join(worktreeDir, 'liferay', 'configs', 'dockerenv');
  const buildDir = path.join(worktreeDir, 'liferay', 'build', 'docker', 'configs', 'dockerenv');
  const content = `web.server.http.port=${httpPort}\n`;

  await fs.ensureDir(sourceDir);
  await fs.ensureDir(buildDir);
  await fs.writeFile(path.join(sourceDir, 'portal-ext.local.properties'), content);
  await fs.writeFile(path.join(buildDir, 'portal-ext.local.properties'), content);
}

type LocalEnvContext = {
  repoRoot: string;
  liferayDir: string;
  dockerDir: string;
  dockerComposeFile: string;
  dockerEnvFile: string;
  dockerEnvExampleFile: string | null;
  envValues: Record<string, string>;
  bindIp: string;
  httpPort: string;
  portalUrl: string;
  composeProjectName: string;
  dataRoot: string;
};

function resolveLocalEnvContext(config: AppConfig): LocalEnvContext {
  if (!config.repoRoot || !config.liferayDir || !config.dockerDir) {
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
    dockerEnvExampleFile: awaitableExistsSync(dockerEnvExampleFile) ? dockerEnvExampleFile : null,
    envValues,
    bindIp,
    httpPort,
    portalUrl: `http://${bindIp}:${httpPort}`,
    composeProjectName: envValues.COMPOSE_PROJECT_NAME || 'liferay',
    dataRoot: resolveLocalDataRoot(config.dockerDir, envValues.ENV_DATA_ROOT),
  };
}

function resolveLocalDataRoot(dockerDir: string, configured: string | undefined): string {
  const dataRoot = configured && configured !== '' ? configured : './data/default';
  return path.isAbsolute(dataRoot) ? dataRoot : path.resolve(dockerDir, dataRoot);
}

async function ensureLocalEnvDataLayout(dataRoot: string): Promise<void> {
  const storages = resolveManagedStorages({
    repoRoot: '',
    liferayDir: '',
    dockerDir: path.dirname(dataRoot),
    dockerComposeFile: '',
    dockerEnvFile: '',
    dockerEnvExampleFile: null,
    envValues: {},
    dataRoot,
    bindIp: '',
    httpPort: '',
    portalUrl: '',
    composeProjectName: 'liferay',
  });
  const managedBindPaths = storages.filter((storage) => storage.mode === 'bind').map((storage) => storage.bindPath);

  for (const directory of [
    dataRoot,
    path.join(dataRoot, 'liferay-deploy-cache'),
    path.join(dataRoot, 'elasticsearch-data'),
    path.join(dataRoot, 'patching'),
    path.join(dataRoot, 'dumps'),
    ...managedBindPaths,
  ]) {
    await fs.ensureDir(directory);
  }

  const elasticsearchDataDir = path.join(dataRoot, 'elasticsearch-data');
  if (await fs.pathExists(elasticsearchDataDir)) {
    await fs.chmod(elasticsearchDataDir, 0o777);
  }
}

async function seedLocalBuildDockerConfigs(liferayDir: string): Promise<boolean> {
  const targetDir = path.join(liferayDir, 'build', 'docker', 'configs', 'dockerenv');
  const deployDir = path.join(liferayDir, 'build', 'docker', 'deploy');

  await fs.ensureDir(deployDir);
  await fs.chmod(deployDir, 0o775);

  const sourceDirs = await resolveDockerConfigSourceDirs(liferayDir);
  if (sourceDirs.length === 0) {
    return false;
  }

  const hasExplicitDockerenv = await fs.pathExists(path.join(liferayDir, 'configs', 'dockerenv'));
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

async function restoreLocalArtifactsFromDeployCache(config: AppConfig): Promise<void> {
  if (!config.repoRoot || !config.liferayDir || !config.dockerDir) {
    return;
  }

  const dockerEnvFile = config.files.dockerEnv ?? path.join(config.dockerDir, '.env');
  const envValues = readEnvFile(dockerEnvFile);
  const cacheDir = path.join(resolveLocalDataRoot(config.dockerDir, envValues.ENV_DATA_ROOT), 'liferay-deploy-cache');
  const buildDir = path.join(config.liferayDir, 'build', 'docker');
  const buildDeployDir = path.join(buildDir, 'deploy');
  const artifacts = await listLocalDeployArtifacts(cacheDir);

  if (artifacts.length > 0) {
    await fs.ensureDir(buildDeployDir);
    for (const artifact of artifacts) {
      await fs.copy(artifact, path.join(buildDeployDir, path.basename(artifact)), {overwrite: true});
    }
  }

  const commit = await readLocalPrepareCommit(cacheDir);
  if (commit) {
    await fs.ensureDir(buildDir);
    await fs.writeFile(path.join(buildDir, '.prepare-commit'), `${commit}\n`);
  }
}

async function listLocalDeployArtifacts(directory: string): Promise<string[]> {
  if (!(await fs.pathExists(directory))) {
    return [];
  }

  const entries = await fs.readdir(directory, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name))
    .filter((entryPath) => /\.(jar|war|xml)$/i.test(entryPath));
}

async function readLocalPrepareCommit(directory: string): Promise<string | null> {
  const markerPath = path.join(directory, '.prepare-commit');
  if (!(await fs.pathExists(markerPath))) {
    return null;
  }

  return (await fs.readFile(markerPath, 'utf8')).trim() || null;
}

function awaitableExistsSync(filePath: string): boolean {
  return fs.existsSync(filePath);
}
