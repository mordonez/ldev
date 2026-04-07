import type {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {
  formatWorktreeBtrfsRefreshBase,
  runWorktreeBtrfsRefreshBase,
} from '../../features/worktree/worktree-btrfs-refresh-base.js';
import {formatWorktreeClean, runWorktreeClean} from '../../features/worktree/worktree-clean.js';
import {formatWorktreeGc, runWorktreeGc} from '../../features/worktree/worktree-gc.js';

export function registerWorktreeMaintenanceCommands(command: Command): void {
  addOutputFormatOption(
    command
      .command('clean')
      .helpGroup('Maintenance commands:')
      .description('Destructive: remove a worktree and its local runtime data')
      .argument('[name]', 'Worktree name; optional when running inside the worktree')
      .option('--force', 'Actually perform the cleanup')
      .option('--delete-branch', 'Delete the local fix/<name> branch after cleanup'),
  ).action(
    createFormattedArgumentAction(
      async (context, name, options) =>
        runWorktreeClean({
          cwd: context.cwd,
          name,
          force: Boolean(options.force),
          deleteBranch: Boolean(options.deleteBranch),
          printer: context.printer,
        }),
      {text: formatWorktreeClean},
    ),
  );

  addOutputFormatOption(
    command
      .command('gc')
      .helpGroup('Maintenance commands:')
      .description('Preview or, with --apply, remove stale worktrees conservatively')
      .option('--days <days>', 'Age threshold in days', '7')
      .option('--apply', 'Actually remove the candidate worktrees'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runWorktreeGc({
          cwd: context.cwd,
          days: Number.parseInt(options.days, 10),
          apply: Boolean(options.apply),
          printer: context.printer,
        }),
      {text: formatWorktreeGc},
    ),
  );

  addOutputFormatOption(
    command
      .command('btrfs-refresh-base')
      .helpGroup('Maintenance commands:')
      .description('Linux-only: refresh BTRFS_BASE from the current main env data root'),
  ).action(
    createFormattedAction(
      async (context) =>
        runWorktreeBtrfsRefreshBase({
          cwd: context.cwd,
          printer: context.printer,
        }),
      {text: formatWorktreeBtrfsRefreshBase},
    ),
  );
}
