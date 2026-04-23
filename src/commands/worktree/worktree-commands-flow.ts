import type {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {runEnvSetup} from '../../features/env/env-setup.js';
import {runEnvStart} from '../../features/env/env-start.js';
import {runEnvStop} from '../../features/env/env-stop.js';
import {formatWorktreeEnv, runWorktreeEnv} from '../../features/worktree/worktree-env.js';
import {formatWorktreeSetup, runWorktreeSetup} from '../../features/worktree/worktree-setup.js';
import {formatWorktreeStart, runWorktreeStart} from '../../features/worktree/worktree-start.js';

type WorktreeSetupCommandOptions = {
  name: string;
  base?: string;
  withEnv?: boolean;
  stopMainForClone?: boolean;
  restartMainAfterClone?: boolean;
};

type WorktreeStartCommandOptions = {
  wait?: boolean;
  timeout: string;
};

type WorktreeEnvCommandOptions = {
  name?: string;
};

export function registerWorktreeFlowCommands(command: Command): void {
  addOutputFormatOption(
    command
      .command('setup')
      .helpGroup('Daily worktree flow:')
      .description('Create or reuse a git worktree and optionally prepare its local env')
      .requiredOption('--name <name>', 'Worktree name')
      .option('--base <ref>', 'Base ref for a new worktree branch')
      .option('--with-env', 'Prepare worktree local env after creation')
      .option(
        '--stop-main-for-clone',
        'Stop the main environment first when non-Btrfs state cloning needs exclusive access',
      )
      .option(
        '--restart-main-after-clone',
        'After an automatic stop, start the main environment again without waiting for full portal readiness',
      ),
  ).action(
    createFormattedAction(
      async (context, options: WorktreeSetupCommandOptions) =>
        runWorktreeSetup({
          cwd: context.cwd,
          name: options.name,
          baseRef: options.base,
          withEnv: Boolean(options.withEnv),
          stopMainForClone: Boolean(options.stopMainForClone),
          restartMainAfterClone: Boolean(options.restartMainAfterClone),
          printer: context.printer,
          stopEnv: runEnvStop,
          startEnv: runEnvStart,
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
      async (context, name: string | undefined, options: WorktreeStartCommandOptions) =>
        runWorktreeStart({
          cwd: context.cwd,
          name,
          wait: options.wait,
          timeoutSeconds: Number.parseInt(options.timeout, 10),
          printer: context.printer,
          setupEnv: runEnvSetup,
          startEnv: runEnvStart,
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
      async (context, options: WorktreeEnvCommandOptions) =>
        runWorktreeEnv({
          cwd: context.cwd,
          name: options.name,
          printer: context.printer,
        }),
      {text: formatWorktreeEnv},
    ),
  );
}
