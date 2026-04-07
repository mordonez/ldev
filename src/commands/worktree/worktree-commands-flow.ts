import type {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {formatWorktreeEnv, runWorktreeEnv} from '../../features/worktree/worktree-env.js';
import {formatWorktreeSetup, runWorktreeSetup} from '../../features/worktree/worktree-setup.js';
import {formatWorktreeStart, runWorktreeStart} from '../../features/worktree/worktree-start.js';

export function registerWorktreeFlowCommands(command: Command): void {
  addOutputFormatOption(
    command
      .command('setup')
      .helpGroup('Daily worktree flow:')
      .description('Create or reuse a git worktree and optionally prepare its local env')
      .requiredOption('--name <name>', 'Worktree name')
      .option('--base <ref>', 'Base ref for a new worktree branch')
      .option('--with-env', 'Prepare worktree local env after creation'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runWorktreeSetup({
          cwd: context.cwd,
          name: options.name,
          baseRef: options.base,
          withEnv: Boolean(options.withEnv),
          printer: context.printer,
        }),
      {text: formatWorktreeSetup},
    ),
  );

  addOutputFormatOption(
    command
      .command('start')
      .helpGroup('Daily worktree flow:')
      .description('Prepare and start the local env of an existing worktree')
      .argument('[name]', 'Worktree name; optional when running inside the worktree')
      .option('--no-wait', 'Do not wait for liferay health/running state')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
  ).action(
    createFormattedArgumentAction(
      async (context, name, options) =>
        runWorktreeStart({
          cwd: context.cwd,
          name,
          wait: options.wait,
          timeoutSeconds: Number.parseInt(options.timeout, 10),
          printer: context.printer,
        }),
      {text: formatWorktreeStart},
    ),
  );

  addOutputFormatOption(
    command
      .command('env')
      .helpGroup('Daily worktree flow:')
      .description('Prepare or inspect the local env wiring of a worktree')
      .option('--name <name>', 'Worktree name; optional when running inside the worktree'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runWorktreeEnv({
          cwd: context.cwd,
          name: options.name,
          printer: context.printer,
        }),
      {text: formatWorktreeEnv},
    ),
  );
}
