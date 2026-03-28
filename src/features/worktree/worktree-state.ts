import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {runDocker} from '../../core/platform/docker.js';
import {runProcess} from '../../core/platform/process.js';
import type {EnvContext} from '../env/env-files.js';

export const WORKTREE_STATE_SUBDIRS = [
  'postgres-data',
  'liferay-data',
  'liferay-osgi-state',
  'liferay-deploy-cache',
  'elasticsearch-data',
] as const;

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
  const useSnapshots = mainValues.USE_BTRFS_SNAPSHOTS?.trim() || null;

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

export async function worktreeEnvHasState(dataRoot: string): Promise<boolean> {
  for (const subdir of WORKTREE_STATE_SUBDIRS) {
    if (await fs.pathExists(path.join(dataRoot, subdir))) {
      return true;
    }
  }

  return false;
}

export async function cloneInitialWorktreeState(options: {
  mainEnvContext: EnvContext;
  targetDataRoot: string;
  btrfs: BtrfsConfig;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const sourceDataRoot =
    options.btrfs.enabled && options.btrfs.baseDir ? options.btrfs.baseDir : options.mainEnvContext.dataRoot;

  if (!(await fs.pathExists(sourceDataRoot))) {
    return false;
  }

  let copiedAny = false;
  for (const subdir of WORKTREE_STATE_SUBDIRS) {
    const sourceDir = path.join(sourceDataRoot, subdir);
    if (!(await fs.pathExists(sourceDir))) {
      continue;
    }

    const targetDir = path.join(options.targetDataRoot, subdir);
    await cloneDataSubdir(sourceDir, targetDir, options.btrfs, options.processEnv);
    copiedAny = true;
  }

  return copiedAny;
}

export async function refreshBtrfsBaseFromMain(options: {
  mainEnvContext: EnvContext;
  btrfs: BtrfsConfig;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<string[]> {
  if (process.platform !== 'linux') {
    throw new CliError('worktree btrfs-refresh-base solo está soportado en Linux.', {
      code: 'WORKTREE_BTRFS_UNSUPPORTED_PLATFORM',
    });
  }

  if (!options.btrfs.enabled || !options.btrfs.baseDir) {
    throw new CliError('Btrfs no está configurado en docker/.env del entorno principal.', {
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
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `No se pudo vaciar ${targetDir}`, {
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
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `No se pudo clonar ${sourceDir}`, {
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
