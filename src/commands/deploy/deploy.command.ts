import {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {formatDeployAll, runDeployAll} from '../../features/deploy/deploy-all.js';
import {formatDeployCacheUpdate, runDeployCacheUpdate} from '../../features/deploy/deploy-cache-update.js';
import {formatDeployModule, runDeployModule} from '../../features/deploy/deploy-module.js';
import {formatDeployPrepare, runDeployPrepare} from '../../features/deploy/deploy-prepare.js';
import {formatDeployService, runDeployService} from '../../features/deploy/deploy-service.js';
import {formatDeployTheme, runDeployTheme} from '../../features/deploy/deploy-theme.js';

export function createDeployCommand(): Command {
  const command = new Command('deploy');

  command.description('Build and deployment artifact tooling').addHelpText(
    'after',
    `
Use this namespace when you want explicit control over build outputs.
If your goal is just "make local changes available in the running env",
prefer the simplest command that matches the scope:
  deploy prepare       Build artifacts without touching runtime state
  deploy module <x>    Rebuild one deployable unit
  deploy all           Rebuild everything for the current repo

Safe defaults:
  prepare       Build local deploy artifacts without touching Docker runtime
  cache-update  Refresh ENV_DATA_ROOT/liferay-deploy-cache from current artifacts

Mutating commands:
  all, module, theme, service   Run Gradle tasks and update local build outputs
`,
  );

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
      .description('Prepare build/docker artifacts and commit markers for the current repo or worktree'),
  ).action(
    createFormattedAction(
      async (context) =>
        runDeployPrepare(context.config, {
          printer: context.printer,
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

  addOutputFormatOption(
    command
      .command('cache-update')
      .description('Copy build/docker/deploy artifacts into ENV_DATA_ROOT/liferay-deploy-cache')
      .option('--clean', 'Delete cached artifacts before copying'),
  ).action(
    createFormattedAction(
      async (context, options: {clean?: boolean}) =>
        runDeployCacheUpdate(context.config, {
          clean: Boolean(options.clean),
          printer: context.printer,
        }),
      {text: formatDeployCacheUpdate},
    ),
  );

  return command;
}
