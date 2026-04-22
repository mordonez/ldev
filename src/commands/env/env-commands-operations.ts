import type {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatEnvClean, runEnvClean} from '../../features/env/env-clean.js';
import {formatEnvInit, runEnvInit} from '../../features/env/env-init.js';
import {formatEnvRecreate, runEnvRecreate} from '../../features/env/env-recreate.js';
import {formatEnvRestart, runEnvRestart} from '../../features/env/env-restart.js';
import {formatEnvRestore, runEnvRestore} from '../../features/env/env-restore.js';

type EnvCleanCommandOptions = {
  force?: boolean;
};

type EnvRestartCommandOptions = {
  wait?: boolean;
  timeout: string;
};

export function registerEnvOperationsCommands(command: Command): void {
  addOutputFormatOption(
    command
      .command('init')
      .helpGroup('Project setup:')
      .description('Create or normalize docker/.env for the current repo or worktree'),
  ).action(createFormattedAction(async (context) => runEnvInit(context.config), {text: formatEnvInit}));

  addOutputFormatOption(
    command
      .command('restore')
      .helpGroup('Recovery and maintenance:')
      .description('Replace the current runtime data from main or from BTRFS_BASE'),
  ).action(
    createFormattedAction(
      async (context) =>
        runEnvRestore(context.config, {
          printer: context.printer,
        }),
      {text: formatEnvRestore},
    ),
  );

  addOutputFormatOption(
    command
      .command('clean')
      .helpGroup('Recovery and maintenance:')
      .description('Destructive: remove local docker resources and bind-mounted runtime data')
      .option('--force', 'Actually perform the cleanup'),
  ).action(
    createFormattedAction(
      async (context, options: EnvCleanCommandOptions) =>
        runEnvClean(context.config, {
          force: Boolean(options.force),
          printer: context.printer,
        }),
      {text: formatEnvClean},
    ),
  );

  addOutputFormatOption(
    command
      .command('restart')
      .helpGroup('Recovery and maintenance:')
      .description('Restart the liferay service and optionally wait for health')
      .option('--no-wait', 'Do not wait for liferay health/running state')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
  ).action(
    createFormattedAction(
      async (context, options: EnvRestartCommandOptions) =>
        runEnvRestart(context.config, {
          wait: options.wait,
          timeoutSeconds: Number.parseInt(options.timeout, 10),
          printer: context.printer,
        }),
      {text: formatEnvRestart},
    ),
  );

  addOutputFormatOption(
    command
      .command('recreate')
      .helpGroup('Recovery and maintenance:')
      .description('Recreate the liferay service and optionally wait for health')
      .option('--no-wait', 'Do not wait for liferay health/running state')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
  ).action(
    createFormattedAction(
      async (context, options: EnvRestartCommandOptions) =>
        runEnvRecreate(context.config, {
          wait: options.wait,
          timeoutSeconds: Number.parseInt(options.timeout, 10),
          printer: context.printer,
        }),
      {text: formatEnvRecreate},
    ),
  );
}
