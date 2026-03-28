import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {addGitWorktree, isGitRepository, listGitWorktrees} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {assertPrimaryCheckoutGuardrail} from './worktree-guardrails.js';
import {runWorktreeEnv} from './worktree-env.js';
import {resolveWorktreeContext, resolveWorktreeTarget} from './worktree-paths.js';

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
    throw new CliError('worktree setup requiere ejecutarse dentro de un repositorio git válido.', {
      code: 'WORKTREE_REPO_NOT_FOUND',
    });
  }

  const capabilities = await detectCapabilities(config.cwd);
  if (!capabilities.supportsWorktrees) {
    throw new CliError('Git worktrees no está disponible en este entorno.', {code: 'WORKTREE_CAPABILITY_MISSING'});
  }

  const context = resolveWorktreeContext(config.repoRoot);
  await assertPrimaryCheckoutGuardrail(context, 'crear otro worktree desde una raíz incorrecta');

  const target = resolveWorktreeTarget(context.mainRepoRoot, options.name);
  const existing = await listGitWorktrees(context.mainRepoRoot);

  let reused = false;
  if (await fs.pathExists(target.worktreeDir)) {
    if (existing.includes(target.worktreeDir)) {
      reused = true;
    } else {
      throw new CliError(`El path existe pero no es un git worktree registrado: ${target.worktreeDir}`, {
        code: 'WORKTREE_PATH_CONFLICT',
      });
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
      await withProgress(options.printer, `Creando worktree ${target.name}`, createWorktree);
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
  const lines = [`Worktree listo: ${result.worktreeDir}`, `Branch: ${result.branch}`];
  if (result.reused) {
    lines.push('Estado: reutilizado');
  }
  if (result.envPrepared) {
    lines.push('Entorno local: preparado');
  } else {
    lines.push(`Siguiente paso: cd ${result.worktreeDir} && ldev start`);
  }
  return lines.join('\n');
}
