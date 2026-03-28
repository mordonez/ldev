import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction, withCommandContext} from '../../cli/command-helpers.js';
import {runEnvLogs} from '../../features/env/env-logs.js';
import {runEnvShell} from '../../features/env/env-shell.js';
import {formatEnvSetup, runEnvSetup} from '../../features/env/env-setup.js';
import {formatEnvStart, runEnvStart} from '../../features/env/env-start.js';
import {formatEnvStatus, runEnvStatus} from '../../features/env/env-status.js';
import {formatEnvStop, runEnvStop} from '../../features/env/env-stop.js';

type SharedCommandOptions = {
  helpGroup?: string;
};

export function createEnvSetupCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    addOutputFormatOption(
      new Command('setup')
        .description('Prepare docker/.env, local bind mounts, base images and a warm deploy cache')
        .option('--skip-pull', 'Skip docker compose pull'),
    ).action(
      createFormattedAction(
        async (context, commandOptions) =>
          runEnvSetup(context.config, {
            skipPull: Boolean(commandOptions.skipPull),
            printer: context.printer,
          }),
        {text: formatEnvSetup},
      ),
    ),
    options?.helpGroup,
  );
}

export function createEnvStartCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    addOutputFormatOption(
      new Command('start')
        .description('Start docker compose and, by default, wait until Liferay is ready')
        .option(
          '--activation-key-file <file>',
          'Copy a local DXP activation key into liferay/configs/dockerenv/osgi/modules before start',
        )
        .option('--no-wait', 'Do not wait for liferay health/running state')
        .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
    ).action(
      createFormattedAction(
        async (context, commandOptions) =>
          runEnvStart(context.config, {
            activationKeyFile: commandOptions.activationKeyFile,
            wait: commandOptions.wait,
            timeoutSeconds: Number.parseInt(commandOptions.timeout, 10),
            printer: context.printer,
          }),
        {text: formatEnvStart},
      ),
    ),
    options?.helpGroup,
  );
}

export function createEnvStopCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    addOutputFormatOption(new Command('stop').description('Stop the current docker compose environment')).action(
      createFormattedAction(async (context) => runEnvStop(context.config, {printer: context.printer}), {
        text: formatEnvStop,
      }),
    ),
    options?.helpGroup,
  );
}

export function createEnvStatusCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    addOutputFormatOption(new Command('status').description('Show observable local environment status'), 'json').action(
      createFormattedAction(async (context) => runEnvStatus(context.config), {text: formatEnvStatus}),
    ),
    options?.helpGroup,
  );
}

export function createEnvLogsCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    new Command('logs')
      .description('Stream docker compose logs for the current local environment')
      .option('--service <service>', 'Optional service name filter')
      .option('--since <since>', 'Limit logs since the given duration/time')
      .option('--no-follow', 'Do not follow log output')
      .action(async (commandOptions) =>
        withCommandContext(commandOptions, async (context) => {
          await runEnvLogs(context.config, {
            service: commandOptions.service,
            since: commandOptions.since,
            follow: commandOptions.follow,
          });
        }),
      ),
    options?.helpGroup,
  );
}

export function createEnvShellCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    new Command('shell')
      .description('Open an interactive bash shell inside the liferay container')
      .action(async (commandOptions) =>
        withCommandContext(commandOptions, async (context) => {
          await runEnvShell(context.config, {processEnv: process.env});
        }),
      ),
    options?.helpGroup,
  );
}

function withOptionalHelpGroup(command: Command, helpGroup: string | undefined): Command {
  if (helpGroup) {
    command.helpGroup(helpGroup);
  }

  return command;
}
