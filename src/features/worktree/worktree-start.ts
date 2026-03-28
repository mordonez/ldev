import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {isGitRepository, listGitWorktrees} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {runEnvSetup} from '../env/env-setup.js';
import {runEnvStart} from '../env/env-start.js';
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
  timeoutSeconds?: number;
  printer?: Printer;
}): Promise<WorktreeStartResult> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot || !(await isGitRepository(config.repoRoot))) {
    throw new CliError('worktree start requiere ejecutarse dentro de un repositorio git válido.', {
      code: 'WORKTREE_REPO_NOT_FOUND',
    });
  }

  const capabilities = await detectCapabilities(config.cwd);
  if (!capabilities.supportsWorktrees) {
    throw new CliError('Git worktrees no está disponible en este entorno.', {code: 'WORKTREE_CAPABILITY_MISSING'});
  }

  const context = resolveWorktreeContext(config.repoRoot);
  await assertPrimaryCheckoutGuardrail(context, 'arrancar un worktree desde una raíz incorrecta');

  const target = options.name
    ? resolveWorktreeTarget(context.mainRepoRoot, options.name)
    : context.isWorktree && context.currentWorktreeName
      ? resolveWorktreeTarget(context.mainRepoRoot, context.currentWorktreeName)
      : null;

  if (!target) {
    throw new CliError('worktree start necesita un NAME o ejecutarse dentro del worktree objetivo.', {
      code: 'WORKTREE_NAME_REQUIRED',
    });
  }

  if (!(await fs.pathExists(target.worktreeDir)) || !(await fs.pathExists(target.dockerDir))) {
    throw new CliError(
      `Worktree no encontrado: ${target.worktreeDir}\nCrea primero el worktree con 'ldev worktree setup --name ${target.name}'.`,
      {code: 'WORKTREE_NOT_FOUND'},
    );
  }

  const existing = await listGitWorktrees(context.mainRepoRoot);
  if (!existing.includes(target.worktreeDir)) {
    throw new CliError(`El path existe pero no es un git worktree registrado: ${target.worktreeDir}`, {
      code: 'WORKTREE_NOT_REGISTERED',
    });
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
  return [`Worktree listo en: ${result.worktreeDir}`, `Portal URL: ${result.portalUrl}`].join('\n');
}
