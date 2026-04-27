import fs from 'fs-extra';

import {loadConfig, type AppConfig} from '../../core/config/load-config.js';
import {listGitWorktrees} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {WorktreeErrors} from './errors/worktree-error-factory.js';
import {assertPrimaryCheckoutGuardrail} from './worktree-guardrails.js';
import {runWorktreeEnv} from './worktree-env.js';
import {prepareWorktreeFlow} from './worktree-flow.js';
import {resolveWorktreeTarget} from './worktree-paths.js';

export type WorktreeStartResult = {
  ok: true;
  worktreeName: string;
  worktreeDir: string;
  portalUrl: string;
};

export type WorktreeStartEnvSetup = (
  config: AppConfig,
  options: {
    skipPull: true;
    printer?: Printer;
  },
) => Promise<unknown>;

export type WorktreeStartEnvStart = (
  config: AppConfig,
  options: {
    wait?: boolean;
    timeoutSeconds: number;
    printer?: Printer;
  },
) => Promise<unknown>;

export async function runWorktreeStart(options: {
  cwd: string;
  name?: string;
  wait?: boolean;
  timeoutSeconds?: number;
  printer?: Printer;
  setupEnv?: WorktreeStartEnvSetup;
  startEnv?: WorktreeStartEnvStart;
}): Promise<WorktreeStartResult> {
  const {context} = await prepareWorktreeFlow({cwd: options.cwd, commandName: 'start'});
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

  if (!options.setupEnv || !options.startEnv) {
    throw WorktreeErrors.capabilityMissing('worktree start requires env setup/start handlers.');
  }

  await options.setupEnv(worktreeConfig, {
    skipPull: true,
    printer: options.printer,
  });
  await options.startEnv(worktreeConfig, {
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
