import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction, withCommandContext} from './command-helpers.js';
import {createAiCommand} from '../commands/ai/ai.command.js';
import {createDbCommand} from '../commands/db/db.command.js';
import {createDeployCommand} from '../commands/deploy/deploy.command.js';
import {createDoctorCommand} from '../commands/doctor/doctor.command.js';
import {createEnvCommand} from '../commands/env/env.command.js';
import {createLiferayCommand} from '../commands/liferay/liferay.command.js';
import {createOsgiCommand} from '../commands/osgi/osgi.command.js';
import {createProjectCommand} from '../commands/project/project.command.js';
import {createReindexCommand} from '../commands/reindex/reindex.command.js';
import {createWorktreeCommand} from '../commands/worktree/worktree.command.js';
import {formatDoctor, runDoctor} from '../features/doctor/doctor.service.js';
import {formatEnvSetup, runEnvSetup} from '../features/env/env-setup.js';
import {formatEnvStart, runEnvStart} from '../features/env/env-start.js';
import {formatEnvStatus, runEnvStatus} from '../features/env/env-status.js';
import {formatEnvStop, runEnvStop} from '../features/env/env-stop.js';
import {runEnvLogs} from '../features/env/env-logs.js';
import {runEnvShell} from '../features/env/env-shell.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('ldev')
    .description('Official Liferay local development CLI')
    .showHelpAfterError()
    .addCommand(createStartCommand())
    .addCommand(createStopCommand())
    .addCommand(createStatusCommand())
    .addCommand(createLogsCommand())
    .addCommand(createShellCommand())
    .addCommand(createSetupCommand())
    .addCommand(createProjectCommand())
    .addCommand(createDbCommand())
    .addCommand(createDeployCommand())
    .addCommand(createEnvCommand())
    .addCommand(createWorktreeCommand())
    .addCommand(createOsgiCommand())
    .addCommand(createReindexCommand())
    .addCommand(createAiCommand())
    .addCommand(createLiferayCommand())
    .addCommand(createDoctorCommand())
    .addHelpText('after', `
Quick start:
  ldev doctor
  ldev setup
  ldev start

Top-level shortcuts:
  setup      Alias of env setup
  start      Alias of env start
  stop       Alias of env stop
  status     Alias of env status
  logs       Alias of env logs
  shell      Alias of env shell

Official namespaces:
  project   Scaffold and tooling integration
  env       Local Docker lifecycle
  worktree  Isolated worktrees and local runtimes
  db        LCP backups, local import and doclib
  deploy    Build and deploy artifacts
  osgi      Runtime diagnostics and Gogo Shell
  reindex   Reindex observation and temporary tuning
  ai        Vendor AI assets
  liferay   Read-only Liferay API inspection
  doctor    Host prerequisites and effective config

Examples:
  ldev doctor
  ldev setup
  ldev start
  ldev db sync --project foo --environment prd --force
  ldev worktree setup --name issue-123 --with-env
  ldev liferay inventory sites --format json
`);

  return program;
}

function createSetupCommand(): Command {
  return addOutputFormatOption(
    new Command('setup')
      .description('Prepare docker/.env, local bind mounts, base images and a warm deploy cache')
      .option('--skip-pull', 'Skip docker compose pull'),
  ).action(createFormattedAction(async (context, options) => runEnvSetup(context.config, {
        skipPull: Boolean(options.skipPull),
        printer: context.printer,
      }), {text: formatEnvSetup}));
}

function createStartCommand(): Command {
  return addOutputFormatOption(
    new Command('start')
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
}

function createStopCommand(): Command {
  return addOutputFormatOption(
    new Command('stop')
      .description('Stop the current docker compose environment'),
  ).action(createFormattedAction(async (context) => runEnvStop(context.config, {printer: context.printer}), {text: formatEnvStop}));
}

function createStatusCommand(): Command {
  return addOutputFormatOption(
    new Command('status')
      .description('Show observable local environment status'),
    'json',
  ).action(createFormattedAction(async (context) => runEnvStatus(context.config), {text: formatEnvStatus}));
}

function createLogsCommand(): Command {
  return new Command('logs')
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
}

function createShellCommand(): Command {
  return new Command('shell')
    .description('Open an interactive bash shell inside the liferay container')
    .action(async () => withCommandContext({}, async (context) => {
      await runEnvShell(context.config, {processEnv: process.env});
    }));
}
