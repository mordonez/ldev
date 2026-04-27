import fs from 'fs-extra';

import {loadConfig} from '../../core/config/load-config.js';
import {readEnvFile} from '../../core/config/env-file.js';
import {resolveEnvContext} from '../../core/runtime/env-context.js';
import {addGitWorktree, listGitWorktrees} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {WorktreeErrors} from './errors/worktree-error-factory.js';
import {runWorktreeEnv} from './worktree-env.js';
import {prepareWorktreeFlow} from './worktree-flow.js';
import {resolveWorktreeTarget} from './worktree-paths.js';
import {assertSafeMainEnvClone, resolveBtrfsConfig} from './worktree-state.js';

type WorktreeEnvStopFn = (
  config: ReturnType<typeof loadConfig>,
  options?: {processEnv?: NodeJS.ProcessEnv; printer?: Printer},
) => Promise<unknown>;

type WorktreeEnvStartFn = (
  config: ReturnType<typeof loadConfig>,
  options?: {
    wait?: boolean;
    timeoutSeconds?: number;
    processEnv?: NodeJS.ProcessEnv;
    printer?: Printer;
    activationKeyFile?: string;
  },
) => Promise<unknown>;

export type WorktreeSetupResult = {
  ok: true;
  worktreeName: string;
  worktreeDir: string;
  branch: string;
  reused: boolean;
  envPrepared: boolean;
  mainEnvStoppedForClone: boolean;
  mainEnvRestartedAfterClone: boolean;
  mainRestartError?: string;
};

export async function runWorktreeSetup(options: {
  cwd: string;
  name: string;
  baseRef?: string;
  withEnv?: boolean;
  stopMainForClone?: boolean;
  restartMainAfterClone?: boolean;
  printer?: Printer;
  stopEnv?: WorktreeEnvStopFn;
  startEnv?: WorktreeEnvStartFn;
  prepareWorktreeEnv?: typeof runWorktreeEnv;
}): Promise<WorktreeSetupResult> {
  const {context} = await prepareWorktreeFlow({cwd: options.cwd, commandName: 'setup'});
  const stopMainForClone = Boolean(options.stopMainForClone);
  const restartMainAfterClone = Boolean(options.restartMainAfterClone);
  const withEnv = Boolean(options.withEnv);
  const prepareWorktreeEnv = options.prepareWorktreeEnv ?? runWorktreeEnv;

  if ((stopMainForClone || restartMainAfterClone) && !withEnv) {
    throw WorktreeErrors.capabilityMissing(
      '--stop-main-for-clone and --restart-main-after-clone require --with-env because they only apply to state cloning.',
    );
  }

  if (restartMainAfterClone && !stopMainForClone) {
    throw WorktreeErrors.capabilityMissing('--restart-main-after-clone requires --stop-main-for-clone.');
  }

  if ((stopMainForClone && !options.stopEnv) || (restartMainAfterClone && !options.startEnv)) {
    throw WorktreeErrors.capabilityMissing(
      'worktree setup handoff requires injected env start/stop actions from the command layer.',
    );
  }

  let mainConfig = null as ReturnType<typeof loadConfig> | null;
  let mainEnvStoppedForClone = false;
  let mainEnvRestartedAfterClone = false;
  let mainRestartError: string | undefined;

  if (withEnv) {
    mainConfig = loadConfig({cwd: context.mainRepoRoot, env: process.env});
    const mainEnvContext = resolveEnvContext(mainConfig);
    const mainValues = readEnvFile(mainEnvContext.dockerEnvFile);
    const btrfs = await resolveBtrfsConfig(mainEnvContext, mainValues);

    try {
      await assertSafeMainEnvClone(mainEnvContext, btrfs, process.env);
    } catch (error) {
      if (!stopMainForClone) {
        throw error;
      }

      await options.stopEnv?.(mainConfig, {processEnv: process.env, printer: options.printer});
      mainEnvStoppedForClone = true;
    }
  }

  const target = resolveWorktreeTarget(context.mainRepoRoot, options.name);
  const existing = await listGitWorktrees(context.mainRepoRoot);

  let reused = false;
  if (await fs.pathExists(target.worktreeDir)) {
    if (existing.includes(target.worktreeDir)) {
      reused = true;
    } else {
      throw WorktreeErrors.pathConflict(`The path exists but is not a registered git worktree: ${target.worktreeDir}`);
    }
  } else {
    const createWorktree = async () => {
      await addGitWorktree({
        cwd: context.mainRepoRoot,
        path: target.worktreeDir,
        branch: target.branch,
        startRef: options.baseRef ?? 'HEAD',
      });
    };

    if (options.printer) {
      await withProgress(options.printer, `Creating worktree ${target.name}`, createWorktree);
    } else {
      await createWorktree();
    }
  }

  let envPrepared = false;

  try {
    if (withEnv) {
      await prepareWorktreeEnv({
        cwd: target.worktreeDir,
        printer: options.printer,
      });
      envPrepared = true;
    }
  } finally {
    if (mainEnvStoppedForClone && restartMainAfterClone && mainConfig) {
      try {
        await options.startEnv?.(mainConfig, {
          wait: false,
          processEnv: process.env,
          printer: options.printer,
        });
        mainEnvRestartedAfterClone = true;
      } catch (error) {
        mainRestartError = error instanceof Error ? error.message : 'Failed to restart the main environment.';
      }
    }
  }

  return {
    ok: true,
    worktreeName: target.name,
    worktreeDir: target.worktreeDir,
    branch: target.branch,
    reused,
    envPrepared,
    mainEnvStoppedForClone,
    mainEnvRestartedAfterClone,
    ...(mainRestartError ? {mainRestartError} : {}),
  };
}

export function formatWorktreeSetup(result: WorktreeSetupResult): string {
  const lines = [`Worktree ready: ${result.worktreeDir}`, `Branch: ${result.branch}`];
  if (result.reused) {
    lines.push('Status: reused');
  }
  if (result.envPrepared) {
    lines.push('Local environment: prepared');
  } else {
    lines.push(`Next step: cd ${result.worktreeDir} && ldev start`);
  }
  if (result.mainEnvStoppedForClone) {
    lines.push('Main environment: stopped for clone');
  }
  if (result.mainEnvRestartedAfterClone) {
    lines.push('Main environment: restarted');
  }
  if (result.mainRestartError) {
    lines.push(`Main environment restart warning: ${result.mainRestartError}`);
  }
  return lines.join('\n');
}
