import type {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatEnvDiff, runEnvDiff} from '../../features/env/env-diff.js';
import {formatEnvIsHealthy, runEnvIsHealthy} from '../../features/env/env-is-healthy.js';
import {formatEnvWait, runEnvWait} from '../../features/env/env-wait.js';

export function registerEnvDiagnosticsCommands(command: Command): void {
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
      .command('diff')
      .helpGroup('Diagnostics and scripting:')
      .description('Compare the current environment against a saved baseline')
      .option('--baseline <file>', 'Custom baseline file')
      .option('--write-baseline', 'Persist the current environment as baseline instead of diffing'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runEnvDiff(context.config, {
          baseline: options.baseline,
          writeBaseline: Boolean(options.writeBaseline),
        }),
      {text: formatEnvDiff},
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
}
