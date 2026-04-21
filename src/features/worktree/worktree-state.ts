import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import {runDockerCompose} from '../../core/platform/docker.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {runDocker} from '../../core/platform/docker.js';
import {formatProcessError, runProcess} from '../../core/platform/process.js';
import {
  resolveManagedStorages,
  resolveRuntimeStorage,
  type EnvContext,
  type RuntimeStorageKey,
} from '../../core/runtime/env-context.js';

export const WORKTREE_STATE_SUBDIRS = [
  'postgres-data',
  'liferay-data',
  'liferay-osgi-state',
  'elasticsearch-data',
] as const;

export const WORKTREE_DEPLOY_CACHE_SUBDIR = 'liferay-deploy-cache';

export type BtrfsConfig = {
  enabled: boolean;
  rootDir: string | null;
  baseDir: string | null;
  envsDir: string | null;
  useSnapshots: string | null;
};

export async function resolveBtrfsConfig(
  mainEnvContext: EnvContext,
  mainValues: Record<string, string>,
): Promise<BtrfsConfig> {
  if (process.platform !== 'linux') {
    return disabledBtrfsConfig();
  }

  const rootDir = resolveConfiguredPath(mainEnvContext.dockerDir, mainValues.BTRFS_ROOT);
  const snapshotsValue = mainValues.USE_BTRFS_SNAPSHOTS;
  const useSnapshots =
    typeof snapshotsValue === 'string' && snapshotsValue.trim() !== '' ? snapshotsValue.trim() : null;

  if (!rootDir || !useSnapshots || useSnapshots === 'false') {
    return disabledBtrfsConfig();
  }

  const baseDir = resolveConfiguredPath(mainEnvContext.dockerDir, mainValues.BTRFS_BASE || path.join(rootDir, 'base'));
  const envsDir = resolveConfiguredPath(mainEnvContext.dockerDir, mainValues.BTRFS_ENVS || path.join(rootDir, 'envs'));

  if (!baseDir || !envsDir) {
    return disabledBtrfsConfig();
  }

  if (!(await fs.pathExists(rootDir)) || !(await fs.pathExists(baseDir)) || !(await fs.pathExists(envsDir))) {
    return disabledBtrfsConfig();
  }

  return {
    enabled: true,
    rootDir,
    baseDir,
    envsDir,
    useSnapshots,
  };
}

export async function worktreeEnvHasState(dataRoot: string, envContext?: EnvContext): Promise<boolean> {
  for (const subdir of [...WORKTREE_STATE_SUBDIRS, WORKTREE_DEPLOY_CACHE_SUBDIR]) {
    if (await fs.pathExists(path.join(dataRoot, subdir))) {
      return true;
    }
  }

  if (envContext) {
    for (const storage of resolveManagedStorages(envContext)) {
      if (storage.mode !== 'volume') {
        continue;
      }
      const inspect = await runDocker(['volume', 'inspect', storage.volumeName], {reject: false});
      if (inspect.ok) {
        return true;
      }
    }
  }

  return false;
}

export async function cloneInitialWorktreeState(options: {
  mainEnvContext: EnvContext;
  targetDataRoot: string;
  btrfs: BtrfsConfig;
  targetEnvContext?: EnvContext;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const sourceDataRoot =
    options.btrfs.enabled && options.btrfs.baseDir ? options.btrfs.baseDir : options.mainEnvContext.dataRoot;

  if (!(await fs.pathExists(sourceDataRoot))) {
    return false;
  }

  await assertSafeMainEnvClone(options.mainEnvContext, options.btrfs, options.processEnv);

  let copiedAny = false;
  for (const subdir of WORKTREE_STATE_SUBDIRS) {
    if (subdir === 'postgres-data' && options.targetEnvContext) {
      if (
        await cloneManagedRuntimeStorage(subdir, options.mainEnvContext, options.targetEnvContext, options.processEnv)
      ) {
        copiedAny = true;
        continue;
      }
    }

    if (
      (subdir === 'liferay-data' || subdir === 'liferay-osgi-state' || subdir === 'elasticsearch-data') &&
      options.targetEnvContext
    ) {
      if (
        await cloneManagedRuntimeStorage(subdir, options.mainEnvContext, options.targetEnvContext, options.processEnv)
      ) {
        copiedAny = true;
        continue;
      }
    }

    const sourceDir = path.join(sourceDataRoot, subdir);
    if (!(await fs.pathExists(sourceDir))) {
      continue;
    }

    const targetDir = path.join(options.targetDataRoot, subdir);
    await cloneDataSubdir(sourceDir, targetDir, options.btrfs, options.processEnv);
    copiedAny = true;
  }

  const deployCacheSourceDir = path.join(sourceDataRoot, WORKTREE_DEPLOY_CACHE_SUBDIR);
  if (options.targetEnvContext) {
    if (
      await cloneManagedRuntimeStorage(
        WORKTREE_DEPLOY_CACHE_SUBDIR,
        options.mainEnvContext,
        options.targetEnvContext,
        options.processEnv,
      )
    ) {
      copiedAny = true;
    } else if (await fs.pathExists(deployCacheSourceDir)) {
      const deployCacheTargetDir = path.join(options.targetDataRoot, WORKTREE_DEPLOY_CACHE_SUBDIR);
      await cloneDataSubdir(deployCacheSourceDir, deployCacheTargetDir, options.btrfs, options.processEnv);
      copiedAny = true;
    }
  } else if (await fs.pathExists(deployCacheSourceDir)) {
    const deployCacheTargetDir = path.join(options.targetDataRoot, WORKTREE_DEPLOY_CACHE_SUBDIR);
    await cloneDataSubdir(deployCacheSourceDir, deployCacheTargetDir, options.btrfs, options.processEnv);
    copiedAny = true;
  }

  return copiedAny;
}

export async function assertSafeMainEnvClone(
  mainEnvContext: EnvContext,
  btrfs: BtrfsConfig,
  processEnv?: NodeJS.ProcessEnv,
): Promise<void> {
  if (!btrfs.enabled && (await isMainEnvRunning(mainEnvContext, processEnv))) {
    throw new CliError(
      'Cannot clone the initial worktree state while the main environment is running without Btrfs. Run `ldev stop` in the main checkout first, or use `ldev worktree setup --name <name>` without `--with-env` if you only want the git worktree for now.',
      {code: 'WORKTREE_MAIN_ENV_RUNNING'},
    );
  }
}

export async function refreshBtrfsBaseFromMain(options: {
  mainEnvContext: EnvContext;
  btrfs: BtrfsConfig;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<string[]> {
  if (process.platform !== 'linux') {
    throw new CliError('worktree btrfs-refresh-base is only supported on Linux.', {
      code: 'WORKTREE_BTRFS_UNSUPPORTED_PLATFORM',
    });
  }

  if (!options.btrfs.enabled || !options.btrfs.baseDir) {
    throw new CliError('Btrfs is not configured in the main environment docker/.env.', {
      code: 'WORKTREE_BTRFS_NOT_CONFIGURED',
    });
  }

  const refreshed: string[] = [];
  for (const subdir of [...WORKTREE_STATE_SUBDIRS, 'liferay-doclib']) {
    const sourceDir = path.join(options.mainEnvContext.dataRoot, subdir);
    const targetDir = path.join(options.btrfs.baseDir, subdir);
    await syncDataSubdir(sourceDir, targetDir, options.processEnv);
    refreshed.push(subdir);
  }

  return refreshed;
}

function disabledBtrfsConfig(): BtrfsConfig {
  return {
    enabled: false,
    rootDir: null,
    baseDir: null,
    envsDir: null,
    useSnapshots: null,
  };
}

function resolveConfiguredPath(baseDir: string, configured: string | undefined): string | null {
  const value = configured?.trim();
  if (!value) {
    return null;
  }

  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

async function cloneDataSubdir(
  sourceDir: string,
  targetDir: string,
  btrfs: BtrfsConfig,
  processEnv?: NodeJS.ProcessEnv,
): Promise<void> {
  if (await fs.pathExists(targetDir)) {
    await removePathRobust(targetDir, {processEnv});
  }

  await fs.ensureDir(path.dirname(targetDir));

  if (btrfs.enabled && (await tryCloneBtrfsSnapshot(sourceDir, targetDir))) {
    return;
  }

  await copyDirContents(sourceDir, targetDir, processEnv);
}

async function syncDataSubdir(sourceDir: string, targetDir: string, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  await fs.ensureDir(targetDir);
  await emptyDirRobust(targetDir, processEnv);

  if (!(await fs.pathExists(sourceDir))) {
    return;
  }

  await copyDirContents(sourceDir, targetDir, processEnv);
}

async function emptyDirRobust(targetDir: string, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  try {
    await fs.emptyDir(targetDir);
    return;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'EACCES' && error.code !== 'EPERM')) {
      throw error;
    }
  }

  const result = await runDocker(
    ['run', '--rm', '-v', `${targetDir}:/target`, 'alpine', 'sh', '-lc', 'find /target -mindepth 1 -delete || true'],
    {env: processEnv, reject: false},
  );

  if (!result.ok) {
    throw new CliError(formatProcessError(result, `Could not empty ${targetDir}`), {
      code: 'WORKTREE_STATE_CLEAR_FAILED',
    });
  }
}

async function copyDirContents(sourceDir: string, targetDir: string, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  try {
    const entries = await fs.readdir(sourceDir);
    for (const entry of entries) {
      await fs.copy(path.join(sourceDir, entry), path.join(targetDir, entry), {overwrite: true});
    }
    return;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'EACCES' && error.code !== 'EPERM')) {
      throw error;
    }
  }

  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      `${sourceDir}:/source:ro`,
      '-v',
      `${targetDir}:/target`,
      'alpine',
      'sh',
      '-lc',
      'cp -a /source/. /target/',
    ],
    {env: processEnv, reject: false},
  );

  if (!result.ok) {
    throw new CliError(formatProcessError(result, `Could not clone ${sourceDir}`), {
      code: 'WORKTREE_CLONE_FAILED',
    });
  }
}

async function tryCloneBtrfsSnapshot(sourceDir: string, targetDir: string): Promise<boolean> {
  const probe = await runProcess('btrfs', ['subvolume', 'show', sourceDir], {reject: false});
  if (!probe.ok) {
    return false;
  }

  const snapshot = await runProcess('btrfs', ['subvolume', 'snapshot', sourceDir, targetDir], {reject: false});
  return snapshot.ok;
}

async function cloneManagedRuntimeStorage(
  key: RuntimeStorageKey,
  sourceEnvContext: EnvContext,
  targetEnvContext: EnvContext,
  processEnv?: NodeJS.ProcessEnv,
): Promise<boolean> {
  const sourceStorage = resolveRuntimeStorage(sourceEnvContext, key);
  const targetStorage = resolveRuntimeStorage(targetEnvContext, key);

  if (sourceStorage.mode === 'bind' && targetStorage.mode === 'bind') {
    return false;
  }

  if (targetStorage.mode === 'bind') {
    const sourceDir = sourceStorage.mode === 'bind' ? sourceStorage.bindPath : null;
    if (!sourceDir || !(await fs.pathExists(sourceDir))) {
      return false;
    }

    await cloneDataSubdir(sourceDir, targetStorage.bindPath, disabledBtrfsConfig(), processEnv);
    return true;
  }

  const sourceExists =
    sourceStorage.mode === 'volume'
      ? (await runDocker(['volume', 'inspect', sourceStorage.volumeName], {env: processEnv, reject: false})).ok
      : await fs.pathExists(sourceStorage.bindPath);

  if (!sourceExists) {
    return false;
  }

  await runDocker(['volume', 'create', targetStorage.volumeName], {env: processEnv, reject: false});
  const sourceMount =
    sourceStorage.mode === 'volume' ? `${sourceStorage.volumeName}:/source:ro` : `${sourceStorage.bindPath}:/source:ro`;
  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      sourceMount,
      '-v',
      `${targetStorage.volumeName}:/target`,
      'alpine',
      'sh',
      '-lc',
      'cp -a /source/. /target/',
    ],
    {env: processEnv, reject: false},
  );

  if (!result.ok) {
    throw new CliError(formatProcessError(result, `Could not clone ${key} storage`), {
      code: 'WORKTREE_CLONE_FAILED',
    });
  }

  return true;
}

async function isMainEnvRunning(mainEnvContext: EnvContext, processEnv?: NodeJS.ProcessEnv): Promise<boolean> {
  for (const service of ['postgres', 'liferay']) {
    const psResult = await runDockerCompose(mainEnvContext.dockerDir, ['ps', '-q', service], {
      env: processEnv,
      reject: false,
    });
    if (!psResult.ok) {
      continue;
    }

    const containerIds = psResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const containerId of containerIds) {
      const inspectResult = await runDocker(['inspect', '-f', '{{.State.Status}}', containerId], {
        env: processEnv,
        reject: false,
      });
      if (inspectResult.ok && inspectResult.stdout.trim() === 'running') {
        return true;
      }
    }
  }

  return false;
}
