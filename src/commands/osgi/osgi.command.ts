import {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
  withCommandContext,
} from '../../cli/command-helpers.js';
import {formatOsgiDiag, runOsgiDiag} from '../../features/osgi/osgi-diag.js';
import {formatOsgiHeapDump, runOsgiHeapDump} from '../../features/osgi/osgi-heap-dump.js';
import {runOsgiGogo} from '../../features/osgi/osgi-gogo.js';
import {formatOsgiStatus, runOsgiStatus} from '../../features/osgi/osgi-status.js';
import {formatOsgiThreadDump, runOsgiThreadDump} from '../../features/osgi/osgi-thread-dump.js';

export function createOsgiCommand(): Command {
  const command = new Command('osgi');
  command.description('Runtime diagnostics and Gogo Shell tooling').addHelpText(
    'after',
    `
Use this namespace for runtime debugging after the local env is already running.
Use it for troubleshooting and runtime inspection, not for the initial environment setup flow.

Interactive:
  gogo            Open a live Gogo Shell session

Observational:
  status, diag, thread-dump, heap-dump
`,
  );

  command
    .command('gogo')
    .helpGroup('Interactive commands:')
    .description('Open a live connection to the Liferay OSGi Gogo Shell')
    // escape-hatch: interactive process with no return value to format
    .action(async () => {
      await withCommandContext({}, async (context) => {
        await runOsgiGogo(context.config);
      });
    });

  addOutputFormatOption(
    command
      .command('status')
      .helpGroup('Diagnostics:')
      .description('Inspect the state of a specific OSGi bundle')
      .argument('<bundle>', 'Bundle symbolic name'),
  ).action(
    createFormattedArgumentAction(async (context, bundle: string) => runOsgiStatus(context.config, {bundle}), {
      text: formatOsgiStatus,
    }),
  );

  addOutputFormatOption(
    command
      .command('diag')
      .helpGroup('Diagnostics:')
      .description('Run Gogo diag for a specific OSGi bundle')
      .argument('<bundle>', 'Bundle symbolic name'),
  ).action(
    createFormattedArgumentAction(async (context, bundle: string) => runOsgiDiag(context.config, {bundle}), {
      text: formatOsgiDiag,
    }),
  );

  addOutputFormatOption(
    command
      .command('thread-dump')
      .helpGroup('Diagnostics:')
      .description('Collect one or more thread dumps from the Liferay process')
      .option('--count <count>', 'Number of dumps', '6')
      .option('--interval <seconds>', 'Seconds between dumps', '3'),
  ).action(
    createFormattedAction(
      async (context, options: {count?: string; interval?: string}) =>
        runOsgiThreadDump(context.config, {
          count: Number(options.count ?? '6'),
          intervalSeconds: Number(options.interval ?? '3'),
        }),
      {text: formatOsgiThreadDump},
    ),
  );

  addOutputFormatOption(
    command.command('heap-dump').helpGroup('Diagnostics:').description('Generate a heap dump from the Liferay process'),
  ).action(createFormattedAction(async (context) => runOsgiHeapDump(context.config), {text: formatOsgiHeapDump}));

  return command;
}
