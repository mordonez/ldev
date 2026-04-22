import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction, withCommandContext} from '../../cli/command-helpers.js';
import {createRuntimeAdapter} from '../../core/runtime/runtime-adapter-factory.js';
import {formatEnvLogsDiagnose, runEnvLogsDiagnose} from '../../features/env/env-logs-diagnose.js';
import {runEnvShell} from '../../features/env/env-shell.js';
import {formatEnvSetup, runEnvSetup} from '../../features/env/env-setup.js';
import {formatEnvStart} from '../../features/env/env-start.js';
import {formatEnvStatus} from '../../features/env/env-status.js';
import {formatEnvStop} from '../../features/env/env-stop.js';

type SharedCommandOptions = {
  helpGroup?: string;
};

type EnvSetupCommandOptions = {
  with: string[];
  skipPull?: boolean;
};

type EnvStartCommandOptions = {
  activationKeyFile?: string;
  wait?: boolean;
  timeout: string;
};

type EnvLogsCommandOptions = {
  service?: string;
  since?: string;
  follow?: boolean;
};

export function createEnvSetupCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    addOutputFormatOption(
      new Command('setup')
        .description('Pull images, seed .env and warm deploy cache')
        .option('--skip-pull', 'Skip docker compose pull')
        .option(
          '--with <service>',
          'Add a compose service add-on (elasticsearch, postgres). Repeatable.',
          (val: string, prev: string[]) => [...prev, val],
          [] as string[],
        ),
    ).action(
      createFormattedAction(
        async (context, commandOptions: EnvSetupCommandOptions) =>
          runEnvSetup(context.config, {
            with: commandOptions.with,
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
        .description('Start containers and wait for Liferay to be ready')
        .option(
          '--activation-key-file <file>',
          'Copy a local DXP activation key into liferay/configs/dockerenv/osgi/modules before start',
        )
        .option('--no-wait', 'Do not wait for liferay health/running state')
        .option('--timeout <seconds>', 'Health wait timeout in seconds', '250'),
    ).action(
      createFormattedAction(
        async (context, commandOptions: EnvStartCommandOptions) =>
          createRuntimeAdapter(context.config, {projectType: context.project.projectType}).start({
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
    addOutputFormatOption(new Command('stop').description('Stop containers')).action(
      createFormattedAction(
        async (context) =>
          createRuntimeAdapter(context.config, {projectType: context.project.projectType}).stop({
            printer: context.printer,
          }),
        {
          text: formatEnvStop,
        },
      ),
    ),
    options?.helpGroup,
  );
}

export function createEnvStatusCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    addOutputFormatOption(new Command('status').description('Show environment status'), 'json').action(
      createFormattedAction(
        async (context) => createRuntimeAdapter(context.config, {projectType: context.project.projectType}).status(),
        {text: formatEnvStatus},
      ),
    ),
    options?.helpGroup,
  );
}

export function createEnvLogsCommand(options?: SharedCommandOptions): Command {
  const command = new Command('logs')
    .description('Stream container logs (use diagnose subcommand for analysis)')
    .option('--service <service>', 'Optional service name filter')
    .option('--since <since>', 'Limit logs since the given duration/time')
    .option('--no-follow', 'Do not follow log output')
    .passThroughOptions()
    // escape-hatch: streams output directly; no return value to format
    .action(async (commandOptions: EnvLogsCommandOptions) =>
      withCommandContext(commandOptions, async (context) => {
        await createRuntimeAdapter(context.config, {projectType: context.project.projectType}).logs({
          service: commandOptions.service,
          since: commandOptions.since,
          follow: commandOptions.follow,
        });
      }),
    );

  addOutputFormatOption(
    command
      .command('diagnose')
      .description('Analyze recent logs and group exceptions by type and frequency')
      .option('--service <service>', 'Optional service name filter', 'liferay')
      .option('--since <since>', 'Limit logs since the given duration/time', '10m'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: {service?: string; since?: string}) =>
        runEnvLogsDiagnose(context.config, {
          service: options.service,
          since: options.since,
        }),
      {text: formatEnvLogsDiagnose},
    ),
  );

  return withOptionalHelpGroup(command, options?.helpGroup);
}

export function createEnvShellCommand(options?: SharedCommandOptions): Command {
  return withOptionalHelpGroup(
    new Command('shell')
      .description('Open a shell inside the liferay container')
      // escape-hatch: interactive process with no return value to format
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
