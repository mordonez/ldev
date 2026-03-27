import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction, withCommandContext} from '../../cli/command-helpers.js';
import {formatEnvClean, runEnvClean} from '../../features/env/env-clean.js';
import {formatEnvInfo, runEnvInfo} from '../../features/env/env-info.js';
import {formatEnvInit, runEnvInit} from '../../features/env/env-init.js';
import {formatEnvIsHealthy, runEnvIsHealthy} from '../../features/env/env-is-healthy.js';
import {runEnvLogs} from '../../features/env/env-logs.js';
import {formatEnvRecreate, runEnvRecreate} from '../../features/env/env-recreate.js';
import {formatEnvRestart, runEnvRestart} from '../../features/env/env-restart.js';
import {formatEnvRestore, runEnvRestore} from '../../features/env/env-restore.js';
import {runEnvShell} from '../../features/env/env-shell.js';
import {formatEnvSetup, runEnvSetup} from '../../features/env/env-setup.js';
import {formatEnvStart, runEnvStart} from '../../features/env/env-start.js';
import {formatEnvStatus, runEnvStatus} from '../../features/env/env-status.js';
import {formatEnvStop, runEnvStop} from '../../features/env/env-stop.js';
import {formatEnvWait, runEnvWait} from '../../features/env/env-wait.js';

export function createEnvCommand(): Command {
  const command = new Command('env');

  command
    .description('Lifecycle of the local Docker environment')
    .addHelpText('after', `
Command groups:
  setup                Prepare the local repo and warm the deploy cache
  start / stop         Operate docker compose for the current repo or worktree
  restore              Recover runtime data from main or Btrfs base
  status / info        Observational commands
  clean                Destructive cleanup; requires --force
`);

  addOutputFormatOption(
    command
      .command('init')
      .description('Create or normalize docker/.env for the current repo or worktree'),
  ).action(createFormattedAction(async (context) => runEnvInit(context.config), {text: formatEnvInit}));

  addOutputFormatOption(
    command
      .command('setup')
      .description('Prepare docker/.env, local bind mounts and base images')
      .option('--skip-pull', 'Skip docker compose pull'),
  ).action(createFormattedAction(async (context, options) => runEnvSetup(context.config, {
        skipPull: Boolean(options.skipPull),
        printer: context.printer,
      }), {text: formatEnvSetup}));

  addOutputFormatOption(
    command
      .command('start')
      .description('Start docker compose and, by default, wait until Liferay is ready')
      .option('--activation-key-file <file>', 'Copy a local DXP activation key into liferay/configs/dockerenv/osgi/modules before start')
      .option('--no-wait', 'Do not wait for liferay health/running state')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
  ).action(createFormattedAction(async (context, options) => runEnvStart(context.config, {
        activationKeyFile: options.activationKeyFile,
        wait: options.wait,
        timeoutSeconds: Number.parseInt(options.timeout, 10),
        printer: context.printer,
      }), {text: formatEnvStart}));

  addOutputFormatOption(
    command
      .command('stop')
      .description('Stop the current docker compose environment'),
  ).action(createFormattedAction(async (context) => runEnvStop(context.config, {printer: context.printer}), {text: formatEnvStop}));

  addOutputFormatOption(
    command
      .command('restore')
      .description('Replace the current runtime data from main or from BTRFS_BASE'),
  ).action(createFormattedAction(async (context) => runEnvRestore(context.config, {
        printer: context.printer,
      }), {text: formatEnvRestore}));

  addOutputFormatOption(
    command
      .command('clean')
      .description('Destructive: remove local docker resources and bind-mounted runtime data')
      .option('--force', 'Actually perform the cleanup'),
  ).action(createFormattedAction(async (context, options) => runEnvClean(context.config, {
        force: Boolean(options.force),
        printer: context.printer,
      }), {text: formatEnvClean}));

  addOutputFormatOption(
    command
      .command('restart')
      .description('Restart the liferay service and optionally wait for health')
      .option('--no-wait', 'Do not wait for liferay health/running state')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
  ).action(createFormattedAction(async (context, options) => runEnvRestart(context.config, {
        wait: options.wait,
        timeoutSeconds: Number.parseInt(options.timeout, 10),
        printer: context.printer,
      }), {text: formatEnvRestart}));

  addOutputFormatOption(
    command
      .command('recreate')
      .description('Recreate the liferay service and optionally wait for health')
      .option('--no-wait', 'Do not wait for liferay health/running state')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
  ).action(createFormattedAction(async (context, options) => runEnvRecreate(context.config, {
        wait: options.wait,
        timeoutSeconds: Number.parseInt(options.timeout, 10),
        printer: context.printer,
      }), {text: formatEnvRecreate}));

  command
    .command('logs')
    .description('Stream docker compose logs for the current local environment')
    .option('--service <service>', 'Optional service name filter')
    .option('--since <since>', 'Limit logs since the given duration/time')
    .option('--no-follow', 'Do not follow log output')
    .action(async (options) => withCommandContext({}, async (context) => {
      await runEnvLogs(context.config, {
        service: options.service,
        since: options.since,
        follow: options.follow,
      });
    }));

  command
    .command('shell')
    .description('Open an interactive bash shell inside the liferay container')
    .action(async () => withCommandContext({}, async (context) => {
      await runEnvShell(context.config, {processEnv: process.env});
    }));

  addOutputFormatOption(
    command
      .command('wait')
      .description('Wait until Liferay is healthy/running')
      .option('--timeout <seconds>', 'Health wait timeout in seconds', '600')
      .option('--poll <seconds>', 'Polling interval in seconds', '10'),
  ).action(createFormattedAction(async (context, options) => runEnvWait(context.config, {
        timeoutSeconds: Number.parseInt(options.timeout, 10),
        pollIntervalSeconds: Number.parseInt(options.poll, 10),
        printer: context.printer,
      }), {text: formatEnvWait}));

  addOutputFormatOption(
    command
      .command('is-healthy')
      .description('Return a scriptable health result for the current environment'),
  ).action(createFormattedAction(async (context) => runEnvIsHealthy(context.config), {
    text: formatEnvIsHealthy,
    exitCode: (result) => result.healthy ? 0 : 1,
  }));

  addOutputFormatOption(
    command
      .command('status')
      .description('Show observable local environment status'),
    'json',
  ).action(createFormattedAction(async (context) => runEnvStatus(context.config), {text: formatEnvStatus}));

  addOutputFormatOption(
    command
      .command('info')
      .description('Show a concise local environment summary'),
  ).action(createFormattedAction(async (context) => runEnvInfo(context.config), {text: formatEnvInfo}));

  return command;
}
