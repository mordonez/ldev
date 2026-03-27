import {CliError} from '../../cli/errors.js';
import {getCurrentBranchName} from '../../core/platform/git.js';

import type {WorktreeContext} from './worktree-paths.js';

export async function assertPrimaryCheckoutGuardrail(context: WorktreeContext, actionHint: string): Promise<void> {
  if (context.isWorktree) {
    return;
  }

  const branchName = await getCurrentBranchName(context.mainRepoRoot);
  if (!branchName || branchName === 'main' || branchName === 'master') {
    return;
  }

  const suggestedName = branchName.includes('/') ? branchName.slice(branchName.lastIndexOf('/') + 1) : branchName;

  throw new CliError(
    [
      'Operación bloqueada: la raíz principal del repo no debe usarse en ramas de trabajo.',
      `Checkout actual: ${context.mainRepoRoot} (${branchName})`,
      `Antes de ${actionHint}, mueve esta rama a un worktree:`,
      '  1. git switch main',
      `  2. ldev worktree setup --name ${suggestedName}`,
      `  3. cd .worktrees/${suggestedName}`,
      '  4. ldev start',
    ].join('\n'),
    {code: 'WORKTREE_GUARDRAIL'},
  );
}
