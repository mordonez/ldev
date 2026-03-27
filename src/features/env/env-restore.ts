import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import {loadConfig, type AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';
import {withProgress} from '../../core/output/print.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {runProcess} from '../../core/platform/process.js';
import {resolveBtrfsConfig} from '../worktree/worktree-state.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {resolveEnvContext} from './env-files.js';

const RESTORE_SUBDIRS = [
  'postgres-data',
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
      'env restore no tiene una fuente distinta para este entorno. Para main se requiere BTRFS_BASE configurado; en worktrees sin Btrfs se restaura desde el entorno principal.',
      {code: 'ENV_RESTORE_SOURCE_UNAVAILABLE'},
    );
  }

  const preservedDeployCache = await hasDeployCacheArtifacts(path.join(targetDataRoot, 'liferay-deploy-cache'));

  await runStep(options?.printer, 'Parando entorno Docker actual', async () => {
    await runDockerCompose(targetContext.dockerDir, ['down'], {env: options?.processEnv, reject: false});
  });

  const restoredSubdirs: string[] = [];
  for (const subdir of RESTORE_SUBDIRS) {
    if (subdir === 'liferay-deploy-cache' && preservedDeployCache) {
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

  return {
    ok: true,
    sourceDataRoot,
    targetDataRoot,
    restoredSubdirs,
    preservedDeployCache,
  };
}

export function formatEnvRestore(result: EnvRestoreResult): string {
  return [
    `Datos restaurados desde: ${result.sourceDataRoot}`,
    `Destino: ${result.targetDataRoot}`,
    `Subdirectorios restaurados: ${result.restoredSubdirs.join(', ') || 'ninguno'}`,
    `Deploy cache preservado: ${result.preservedDeployCache ? 'sí' : 'no'}`,
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
    ['run', '--rm', '-v', `${sourceDir}:/source:ro`, '-v', `${targetDir}:/target`, 'alpine', 'sh', '-lc', 'cp -a /source/. /target/'],
    {env: processEnv, reject: false},
  );
  if (!result.ok) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `No se pudo restaurar ${sourceDir}`);
  }
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
