import fs from 'fs-extra';

import {loadConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {isGitRepository, listGitWorktrees} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {runEnvSetup} from '../env/env-setup.js';
import {runEnvStart} from '../env/env-start.js';
import {WorktreeErrors} from './errors/index.js';
import {assertPrimaryCheckoutGuardrail} from './worktree-guardrails.js';
import {runWorktreeEnv} from './worktree-env.js';
import {resolveWorktreeContext, resolveWorktreeTarget} from './worktree-paths.js';

export type WorktreeStartResult = {
  ok: true;
  worktreeName: string;
  worktreeDir: string;
  portalUrl: string;
};

export async function runWorktreeStart(options: {
  cwd: string;
  name?: string;
  wait?: boolean;
  timeoutSeconds?: number;
  printer?: Printer;
}): Promise<WorktreeStartResult> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot || !(await isGitRepository(config.repoRoot))) {
    throw WorktreeErrors.repoNotFound('worktree start must be run inside a valid git repository.');
  }

  const capabilities = await detectCapabilities(config.cwd);
  if (!capabilities.supportsWorktrees) {
    throw WorktreeErrors.capabilityMissing('Git worktrees are not available in this environment.');
  }

  const context = resolveWorktreeContext(config.repoRoot);
  await assertPrimaryCheckoutGuardrail(context, 'start a worktree from the wrong checkout root');

  const target = options.name
    ? resolveWorktreeTarget(context.mainRepoRoot, options.name)
    : context.isWorktree && context.currentWorktreeName
      ? resolveWorktreeTarget(context.mainRepoRoot, context.currentWorktreeName)
      : null;

  if (!target) {
    throw WorktreeErrors.nameRequired('worktree start requires a NAME or execution inside the target worktree.');
  }

  if (!(await fs.pathExists(target.worktreeDir)) || !(await fs.pathExists(target.dockerDir))) {
    throw WorktreeErrors.notFound(
      `Worktree not found: ${target.worktreeDir}\nCreate it first with 'ldev worktree setup --name ${target.name}'.`,
    );
  }

  const existing = await listGitWorktrees(context.mainRepoRoot);
  if (!existing.includes(target.worktreeDir)) {
    throw WorktreeErrors.notRegistered(`The path exists but is not a registered git worktree: ${target.worktreeDir}`);
  }

  const envResult = await runWorktreeEnv({
    cwd: target.worktreeDir,
    printer: options.printer,
  });
  const worktreeConfig = loadConfig({cwd: target.worktreeDir, env: process.env});

  await runEnvSetup(worktreeConfig, {
    skipPull: true,
    printer: options.printer,
  });
  await runEnvStart(worktreeConfig, {
    wait: options.wait,
    timeoutSeconds: options.timeoutSeconds ?? 250,
    printer: options.printer,
  });

  return {
    ok: true,
    worktreeName: target.name,
    worktreeDir: target.worktreeDir,
    portalUrl: envResult.portalUrl,
  };
}

export function formatWorktreeStart(result: WorktreeStartResult): string {
  return [`Worktree ready at: ${result.worktreeDir}`, `Portal URL: ${result.portalUrl}`].join('\n');
}
