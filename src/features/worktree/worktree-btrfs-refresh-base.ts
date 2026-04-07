import {CliError} from '../../core/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {resolveEnvContext} from '../env/env-files.js';
import {resolveWorktreeContext} from './worktree-paths.js';
import {refreshBtrfsBaseFromMain, resolveBtrfsConfig} from './worktree-state.js';

export type WorktreeBtrfsRefreshBaseResult = {
  ok: true;
  mainRepoRoot: string;
  sourceDataRoot: string;
  baseDataRoot: string;
  refreshedSubdirs: string[];
};

export async function runWorktreeBtrfsRefreshBase(options: {
  cwd: string;
  processEnv?: NodeJS.ProcessEnv;
  printer?: Printer;
}): Promise<WorktreeBtrfsRefreshBaseResult> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot) {
    throw new CliError('worktree btrfs-refresh-base must be run inside a valid repository.', {
      code: 'WORKTREE_REPO_NOT_FOUND',
    });
  }

  const context = resolveWorktreeContext(config.repoRoot);
  const mainConfig = loadConfig({cwd: context.mainRepoRoot, env: process.env});
  const mainEnvContext = resolveEnvContext(mainConfig);
  const mainValues = mainEnvContext.envValues;
  const btrfs = await resolveBtrfsConfig(mainEnvContext, mainValues);

  const refresh = async () =>
    refreshBtrfsBaseFromMain({
      mainEnvContext,
      btrfs,
      processEnv: options.processEnv,
    });

  const refreshedSubdirs = options.printer
    ? await withProgress(options.printer, 'Actualizando BTRFS_BASE desde el entorno principal', refresh)
    : await refresh();

  if (!btrfs.baseDir) {
    throw new CliError('BTRFS_BASE could not be resolved after configuration validation.', {
      code: 'WORKTREE_BTRFS_NOT_CONFIGURED',
    });
  }

  return {
    ok: true,
    mainRepoRoot: context.mainRepoRoot,
    sourceDataRoot: mainEnvContext.dataRoot,
    baseDataRoot: btrfs.baseDir,
    refreshedSubdirs,
  };
}

export function formatWorktreeBtrfsRefreshBase(result: WorktreeBtrfsRefreshBaseResult): string {
  return [
    `BTRFS_BASE actualizada: ${result.baseDataRoot}`,
    `Origen: ${result.sourceDataRoot}`,
    `Subdirectorios refrescados: ${result.refreshedSubdirs.join(', ')}`,
  ].join('\n');
}
