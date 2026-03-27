import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction, createFormattedArgumentAction} from '../../cli/command-helpers.js';
import {formatWorktreeBtrfsRefreshBase, runWorktreeBtrfsRefreshBase} from '../../features/worktree/worktree-btrfs-refresh-base.js';
import {formatWorktreeClean, runWorktreeClean} from '../../features/worktree/worktree-clean.js';
import {formatWorktreeEnv, runWorktreeEnv} from '../../features/worktree/worktree-env.js';
import {formatWorktreeGc, runWorktreeGc} from '../../features/worktree/worktree-gc.js';
import {formatWorktreeSetup, runWorktreeSetup} from '../../features/worktree/worktree-setup.js';
import {formatWorktreeStart, runWorktreeStart} from '../../features/worktree/worktree-start.js';

export function createWorktreeCommand(): Command {
  const command = new Command('worktree');

  command
    .description('Isolated git worktree and runtime tooling')
    .addHelpText('after', `
Use this namespace only when you need isolated branches with separate local runtime state.
If you are working in the main repo, you usually do not need these commands.

Typical flow:
  worktree setup --name issue-123 --with-env
  cd .worktrees/issue-123
  ldev start

Destructive commands:
  clean           Remove runtime data and the git worktree; requires --force
  gc --apply      Remove stale worktrees selected by age
`);

  addOutputFormatOption(
    command
      .command('setup')
      .helpGroup('Daily worktree flow:')
      .description('Create or reuse a git worktree and optionally prepare its local env')
      .requiredOption('--name <name>', 'Worktree name')
      .option('--base <ref>', 'Base ref for a new worktree branch')
      .option('--with-env', 'Prepare worktree local env after creation'),
  ).action(createFormattedAction(async (context, options) => runWorktreeSetup({
        cwd: context.cwd,
        name: options.name,
        baseRef: options.base,
        withEnv: Boolean(options.withEnv),
        printer: context.printer,
      }), {text: formatWorktreeSetup}));

  addOutputFormatOption(
    command
      .command('start')
      .helpGroup('Daily worktree flow:')
      .description('Prepare and start the local env of an existing worktree')
      .argument('[name]', 'Worktree name; optional when running inside the worktree')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
  ).action(createFormattedArgumentAction(async (context, name, options) => runWorktreeStart({
        cwd: context.cwd,
        name,
        timeoutSeconds: Number.parseInt(options.timeout, 10),
        printer: context.printer,
      }), {text: formatWorktreeStart}));

  addOutputFormatOption(
    command
      .command('env')
      .helpGroup('Daily worktree flow:')
      .description('Prepare or inspect the local env wiring of a worktree')
      .option('--name <name>', 'Worktree name; optional when running inside the worktree'),
  ).action(createFormattedAction(async (context, options) => runWorktreeEnv({
        cwd: context.cwd,
        name: options.name,
        printer: context.printer,
      }), {text: formatWorktreeEnv}));

  addOutputFormatOption(
    command
      .command('clean')
      .helpGroup('Maintenance commands:')
      .description('Destructive: remove a worktree and its local runtime data')
      .argument('[name]', 'Worktree name; optional when running inside the worktree')
      .option('--force', 'Actually perform the cleanup')
      .option('--delete-branch', 'Delete the local fix/<name> branch after cleanup'),
  ).action(createFormattedArgumentAction(async (context, name, options) => runWorktreeClean({
        cwd: context.cwd,
        name,
        force: Boolean(options.force),
        deleteBranch: Boolean(options.deleteBranch),
        printer: context.printer,
      }), {text: formatWorktreeClean}));

  addOutputFormatOption(
    command
      .command('gc')
      .helpGroup('Maintenance commands:')
      .description('Preview or, with --apply, remove stale worktrees conservatively')
      .option('--days <days>', 'Age threshold in days', '7')
      .option('--apply', 'Actually remove the candidate worktrees'),
  ).action(createFormattedAction(async (context, options) => runWorktreeGc({
        cwd: context.cwd,
        days: Number.parseInt(options.days, 10),
        apply: Boolean(options.apply),
        printer: context.printer,
      }), {text: formatWorktreeGc}));

  addOutputFormatOption(
    command
      .command('btrfs-refresh-base')
      .helpGroup('Maintenance commands:')
      .description('Linux-only: refresh BTRFS_BASE from the current main env data root'),
  ).action(createFormattedAction(async (context) => runWorktreeBtrfsRefreshBase({
        cwd: context.cwd,
        printer: context.printer,
      }), {text: formatWorktreeBtrfsRefreshBase}));

  return command;
}
