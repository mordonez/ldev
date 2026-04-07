import type {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatDeployCacheUpdate, runDeployCacheUpdate} from '../../features/deploy/deploy-cache-update.js';
import {formatDeployStatus, runDeployStatus} from '../../features/deploy/deploy-status.js';
import {formatDeployWatch, runDeployWatch} from '../../features/deploy/deploy-watch.js';

export function registerDeployRuntimeCommands(command: Command): void {
  addOutputFormatOption(
    command
      .command('watch')
      .description('Watch modules/themes and redeploy only the touched unit')
      .option('--module <module>', 'Watch only one module or theme')
      .option('--interval <ms>', 'Polling interval in milliseconds', '1200')
      .option('--iterations <count>', 'Polling iterations for scripted runs; 0 means no limit', '0'),
  ).action(
    createFormattedAction(
      async (context, options: {module?: string; interval?: string; iterations?: string}) =>
        runDeployWatch(context.config, {
          module: options.module,
          intervalMs: Number.parseInt(options.interval ?? '1200', 10) || 1200,
          iterations: Number.parseInt(options.iterations ?? '0', 10) || Number.POSITIVE_INFINITY,
          printer: context.printer,
        }),
      {text: formatDeployWatch},
    ),
  );

  addOutputFormatOption(
    command.command('status').description('Show observed deploy artifacts and OSGi runtime state'),
    'json',
  ).action(createFormattedAction(async (context) => runDeployStatus(context.config), {text: formatDeployStatus}));

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
}
