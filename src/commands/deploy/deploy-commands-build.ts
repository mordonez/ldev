import type {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {formatDeployAll, runDeployAll} from '../../features/deploy/deploy-all.js';
import {formatDeployModule, runDeployModule} from '../../features/deploy/deploy-module.js';
import {formatDeployPrepare, runDeployPrepare} from '../../features/deploy/deploy-prepare.js';
import {formatDeployService, runDeployService} from '../../features/deploy/deploy-service.js';
import {formatDeployTheme, runDeployTheme} from '../../features/deploy/deploy-theme.js';

export function registerDeployBuildCommands(command: Command): void {
  addOutputFormatOption(
    command.command('all').description('Compile and deploy all modules for the current repo'),
  ).action(
    createFormattedAction(
      async (context) =>
        runDeployAll(context.config, {
          printer: context.printer,
        }),
      {text: formatDeployAll},
    ),
  );

  addOutputFormatOption(
    command
      .command('prepare')
      .description('Prepare build/docker artifacts and commit markers for the current repo or worktree')
      .option('--allow-running-env', 'Bypass the guardrail that blocks prepare while liferay is running'),
  ).action(
    createFormattedAction(
      async (context, options: {allowRunningEnv?: boolean}) =>
        runDeployPrepare(context.config, {
          printer: context.printer,
          allowRunningEnv: Boolean(options.allowRunningEnv),
          processEnv: process.env,
        }),
      {text: formatDeployPrepare},
    ),
  );

  addOutputFormatOption(
    command
      .command('module')
      .description('Compile and deploy a single module or theme into build/docker/deploy')
      .argument('<module>', 'Module or theme name'),
  ).action(
    createFormattedArgumentAction(
      async (context, module: string) =>
        runDeployModule(context.config, {
          module,
          printer: context.printer,
        }),
      {text: formatDeployModule},
    ),
  );

  addOutputFormatOption(
    command
      .command('theme')
      .description('Compile and deploy a theme into build/docker/deploy')
      .option('--theme <theme>', 'Theme name', 'ub-theme'),
  ).action(
    createFormattedAction(
      async (context, options: {theme: string}) =>
        runDeployTheme(context.config, {
          theme: options.theme,
          printer: context.printer,
        }),
      {text: formatDeployTheme},
    ),
  );

  addOutputFormatOption(
    command.command('service').description('Run Service Builder and restore tracked service.properties'),
  ).action(
    createFormattedAction(
      async (context) =>
        runDeployService(context.config, {
          printer: context.printer,
        }),
      {text: formatDeployService},
    ),
  );
}
