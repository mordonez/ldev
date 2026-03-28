import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatEnvClean, runEnvClean} from '../../features/env/env-clean.js';
import {formatEnvInit, runEnvInit} from '../../features/env/env-init.js';
import {formatEnvIsHealthy, runEnvIsHealthy} from '../../features/env/env-is-healthy.js';
import {formatEnvRecreate, runEnvRecreate} from '../../features/env/env-recreate.js';
import {formatEnvRestart, runEnvRestart} from '../../features/env/env-restart.js';
import {formatEnvRestore, runEnvRestore} from '../../features/env/env-restore.js';
import {formatEnvWait, runEnvWait} from '../../features/env/env-wait.js';
import {
  createEnvLogsCommand,
  createEnvSetupCommand,
  createEnvShellCommand,
  createEnvStartCommand,
  createEnvStatusCommand,
  createEnvStopCommand,
} from './env-public.commands.js';

export function createEnvCommand(): Command {
  const command = new Command('env');

  command.description('Lifecycle of the local Docker environment').addHelpText(
    'after',
    `
Use this namespace when you need the namespaced form of the local runtime commands.
It also exposes recovery, initialization and diagnostics commands that are not available at the top level.

For the normal daily flow, prefer the top-level interface:
  ldev setup
  ldev start
  ldev stop
  ldev status
  ldev logs
  ldev shell
`,
  );

  addOutputFormatOption(
    command
      .command('init')
      .helpGroup('Project setup:')
      .description('Create or normalize docker/.env for the current repo or worktree'),
  ).action(createFormattedAction(async (context) => runEnvInit(context.config), {text: formatEnvInit}));

  command.addCommand(createEnvSetupCommand({helpGroup: 'Project setup:'}));
  command.addCommand(createEnvStartCommand({helpGroup: 'Daily lifecycle:'}));
  command.addCommand(createEnvStopCommand({helpGroup: 'Daily lifecycle:'}));

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
      async (context, options) =>
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
      async (context, options) =>
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
      async (context, options) =>
        runEnvRecreate(context.config, {
          wait: options.wait,
          timeoutSeconds: Number.parseInt(options.timeout, 10),
          printer: context.printer,
        }),
      {text: formatEnvRecreate},
    ),
  );

  command.addCommand(createEnvLogsCommand({helpGroup: 'Daily lifecycle:'}));
  command.addCommand(createEnvShellCommand({helpGroup: 'Daily lifecycle:'}));

  addOutputFormatOption(
    command
      .command('wait')
      .helpGroup('Diagnostics and scripting:')
      .description('Wait until Liferay is healthy/running')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '600')
      .option('--poll <seconds>', 'Polling interval in seconds', '10'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runEnvWait(context.config, {
          timeoutSeconds: Number.parseInt(options.timeout, 10),
          pollIntervalSeconds: Number.parseInt(options.poll, 10),
          printer: context.printer,
        }),
      {text: formatEnvWait},
    ),
  );

  addOutputFormatOption(
    command
      .command('is-healthy')
      .helpGroup('Diagnostics and scripting:')
      .description('Return a scriptable health result for the current environment'),
  ).action(
    createFormattedAction(async (context) => runEnvIsHealthy(context.config), {
      text: formatEnvIsHealthy,
      exitCode: (result) => (result.healthy ? 0 : 1),
    }),
  );

  command.addCommand(createEnvStatusCommand({helpGroup: 'Diagnostics and scripting:'}));

  return command;
}
