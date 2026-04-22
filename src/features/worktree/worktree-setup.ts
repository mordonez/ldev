import fs from 'fs-extra';

import {loadConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {readEnvFile} from '../../core/config/env-file.js';
import {resolveEnvContext} from '../../core/runtime/env-context.js';
import {addGitWorktree, isGitRepository, listGitWorktrees} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {WorktreeErrors} from './errors/index.js';
import {runWorktreeEnv} from './worktree-env.js';
import {resolveWorktreeContext, resolveWorktreeTarget} from './worktree-paths.js';
import {assertSafeMainEnvClone, resolveBtrfsConfig} from './worktree-state.js';

export type WorktreeSetupResult = {
  ok: true;
  worktreeName: string;
  worktreeDir: string;
  branch: string;
  reused: boolean;
  envPrepared: boolean;
};

export async function runWorktreeSetup(options: {
  cwd: string;
  name: string;
  baseRef?: string;
  withEnv?: boolean;
  printer?: Printer;
}): Promise<WorktreeSetupResult> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot || !(await isGitRepository(config.repoRoot))) {
    throw WorktreeErrors.repoNotFound('worktree setup must be run inside a valid git repository.');
  }

  const capabilities = await detectCapabilities(config.cwd);
  if (!capabilities.supportsWorktrees) {
    throw WorktreeErrors.capabilityMissing('Git worktrees are not available in this environment.');
  }

  const context = resolveWorktreeContext(config.repoRoot);

  if (options.withEnv ?? false) {
    const mainConfig = loadConfig({cwd: context.mainRepoRoot, env: process.env});
    const mainEnvContext = resolveEnvContext(mainConfig);
    const mainValues = readEnvFile(mainEnvContext.dockerEnvFile);
    const btrfs = await resolveBtrfsConfig(mainEnvContext, mainValues);
    await assertSafeMainEnvClone(mainEnvContext, btrfs, process.env);
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
  if (options.withEnv ?? false) {
    await runWorktreeEnv({
      cwd: target.worktreeDir,
      printer: options.printer,
    });
    envPrepared = true;
  }

  return {
    ok: true,
    worktreeName: target.name,
    worktreeDir: target.worktreeDir,
    branch: target.branch,
    reused,
    envPrepared,
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
  return lines.join('\n');
}
