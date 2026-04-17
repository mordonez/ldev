import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import {loadConfig, type AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {formatProcessError, runProcess} from '../../core/platform/process.js';
import {resolveDeployContext, restoreArtifactsFromDeployCache} from '../deploy/deploy-shared.js';
import {buildComposeEnv, resolvePostgresStorage} from './env-files.js';
import {resolveBtrfsConfig} from '../worktree/worktree-state.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {resolveEnvContext} from './env-files.js';

const RESTORE_SUBDIRS = [
  'liferay-data',
  'liferay-osgi-state',
  'liferay-deploy-cache',
  'elasticsearch-data',
  'liferay-doclib',
] as const;

export type EnvRestoreResult = {
  ok: true;
  sourceDataRoot: string;
  targetDataRoot: string;
  restoredSubdirs: string[];
  preservedDeployCache: boolean;
  restoredDeployArtifacts: number;
};

export async function runEnvRestore(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvRestoreResult> {
  const targetContext = resolveEnvContext(config);
  const worktreeContext = resolveWorktreeContext(targetContext.repoRoot);
  const mainRepoRoot = worktreeContext.mainRepoRoot;
  const mainConfig = loadConfig({cwd: mainRepoRoot, env: process.env});
  const mainEnvContext = resolveEnvContext(mainConfig);
  const btrfs = await resolveBtrfsConfig(mainEnvContext, mainEnvContext.envValues);
  const targetDataRoot = targetContext.dataRoot;
  const sourceDataRoot = btrfs.enabled && btrfs.baseDir ? btrfs.baseDir : mainEnvContext.dataRoot;

  if (path.resolve(sourceDataRoot) === path.resolve(targetDataRoot)) {
    throw new CliError(
      'env restore does not have a distinct source for this environment. Main requires BTRFS_BASE to be configured; worktrees without Btrfs restore from the main environment.',
      {code: 'ENV_RESTORE_SOURCE_UNAVAILABLE'},
    );
  }

  const preservedDeployCache = await hasDeployCacheArtifacts(path.join(targetDataRoot, 'liferay-deploy-cache'));

  await runStep(options?.printer, 'Stopping current Docker environment', async () => {
    await runDockerCompose(targetContext.dockerDir, ['down'], {
      env: buildComposeEnv(targetContext, {baseEnv: options?.processEnv}),
      reject: false,
    });
  });

  const restoredSubdirs: string[] = [];
  if (await restorePostgresStorage(mainEnvContext, targetContext, options?.processEnv)) {
    restoredSubdirs.push('postgres-data');
  }
  for (const subdir of RESTORE_SUBDIRS) {
    if (subdir === 'liferay-deploy-cache' && preservedDeployCache) {
      const sourceDir = path.join(sourceDataRoot, subdir);
      const targetDir = path.join(targetDataRoot, subdir);
      if (await fs.pathExists(sourceDir)) {
        await mergeDeployCache(sourceDir, targetDir);
        restoredSubdirs.push(subdir);
      }
      continue;
    }

    const sourceDir = path.join(sourceDataRoot, subdir);
    if (!(await fs.pathExists(sourceDir))) {
      continue;
    }

    const targetDir = path.join(targetDataRoot, subdir);
    await restoreDataSubdir(sourceDir, targetDir, options?.processEnv);
    restoredSubdirs.push(subdir);
  }

  const elasticsearchDataDir = path.join(targetDataRoot, 'elasticsearch-data');
  if (await fs.pathExists(elasticsearchDataDir)) {
    await fs.chmod(elasticsearchDataDir, 0o777).catch(() => undefined);
  }

  let restoredDeployArtifacts = 0;
  if (config.repoRoot && config.liferayDir && config.dockerDir) {
    const deployContext = resolveDeployContext(config);
    const restoreResult = await restoreArtifactsFromDeployCache(config, deployContext);
    restoredDeployArtifacts = restoreResult.copied;
  }

  return {
    ok: true,
    sourceDataRoot,
    targetDataRoot,
    restoredSubdirs,
    preservedDeployCache,
    restoredDeployArtifacts,
  };
}

export function formatEnvRestore(result: EnvRestoreResult): string {
  return [
    `Data restored from: ${result.sourceDataRoot}`,
    `Target: ${result.targetDataRoot}`,
    `Restored subdirectories: ${result.restoredSubdirs.join(', ') || 'none'}`,
    `Deploy cache preserved: ${result.preservedDeployCache ? 'yes' : 'no'}`,
    `Artifacts restored into build/docker/deploy: ${result.restoredDeployArtifacts}`,
  ].join('\n');
}

async function restoreDataSubdir(sourceDir: string, targetDir: string, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  if (await fs.pathExists(targetDir)) {
    await removePathRobust(targetDir, {processEnv});
  }

  await fs.ensureDir(path.dirname(targetDir));
  if (await tryCloneBtrfsSnapshot(sourceDir, targetDir)) {
    return;
  }

  try {
    await fs.copy(sourceDir, targetDir, {overwrite: true});
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
    throw new Error(formatProcessError(result, `Could not restore ${sourceDir}`));
  }
}

async function restorePostgresStorage(
  sourceContext: ReturnType<typeof resolveEnvContext>,
  targetContext: ReturnType<typeof resolveEnvContext>,
  processEnv?: NodeJS.ProcessEnv,
): Promise<boolean> {
  const sourceStorage = resolvePostgresStorage(sourceContext);
  const targetStorage = resolvePostgresStorage(targetContext);

  if (sourceStorage.mode === 'bind' && targetStorage.mode === 'bind') {
    const sourceDir = sourceStorage.bindPath;
    if (!(await fs.pathExists(sourceDir))) {
      return false;
    }
    await restoreDataSubdir(sourceDir, targetStorage.bindPath, processEnv);
    return true;
  }

  if (targetStorage.mode === 'bind') {
    return false;
  }

  await runDocker(['volume', 'rm', targetStorage.volumeName], {env: processEnv, reject: false});
  await runDocker(['volume', 'create', targetStorage.volumeName], {env: processEnv, reject: false});

  const sourceExists =
    sourceStorage.mode === 'volume'
      ? (await runDocker(['volume', 'inspect', sourceStorage.volumeName], {env: processEnv, reject: false})).ok
      : await fs.pathExists(sourceStorage.bindPath);
  if (!sourceExists) {
    return false;
  }

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
    throw new Error(formatProcessError(result, 'Could not restore PostgreSQL storage'));
  }

  return true;
}

async function mergeDeployCache(sourceDir: string, targetDir: string): Promise<void> {
  await fs.ensureDir(targetDir);
  await fs.copy(sourceDir, targetDir, {
    overwrite: false,
    errorOnExist: false,
  });
}

async function tryCloneBtrfsSnapshot(sourceDir: string, targetDir: string): Promise<boolean> {
  const show = await runProcess('btrfs', ['subvolume', 'show', sourceDir], {reject: false});
  if (!show.ok) {
    return false;
  }
  const snapshot = await runProcess('btrfs', ['subvolume', 'snapshot', sourceDir, targetDir], {reject: false});
  return snapshot.ok;
}

async function hasDeployCacheArtifacts(cacheDir: string): Promise<boolean> {
  if (!(await fs.pathExists(cacheDir))) {
    return false;
  }

  const entries = await fs.readdir(cacheDir).catch(() => []);
  return entries.some((entry) => /\.(jar|war|xml)$/i.test(entry));
}

async function runStep<T>(printer: Printer | undefined, label: string, run: () => Promise<T>): Promise<T> {
  if (!printer) {
    return run();
  }

  return withProgress(printer, label, run);
}
