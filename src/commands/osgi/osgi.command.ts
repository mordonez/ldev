import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction, createFormattedArgumentAction, withCommandContext} from '../../cli/command-helpers.js';
import {formatOsgiDiag, runOsgiDiag} from '../../features/osgi/osgi-diag.js';
import {formatOsgiHeapDump, runOsgiHeapDump} from '../../features/osgi/osgi-heap-dump.js';
import {runOsgiGogo} from '../../features/osgi/osgi-gogo.js';
import {formatOsgiLiferayCliCreds, runOsgiLiferayCliCreds} from '../../features/osgi/osgi-liferaycli-creds.js';
import {formatOsgiStatus, runOsgiStatus} from '../../features/osgi/osgi-status.js';
import {formatOsgiThreadDump, runOsgiThreadDump} from '../../features/osgi/osgi-thread-dump.js';

export function createOsgiCommand(): Command {
  const command = new Command('osgi');
  command
    .description('Runtime diagnostics and Gogo Shell tooling')
    .addHelpText('after', `
Interactive:
  gogo            Open a live Gogo Shell session

Observational:
  status, diag, thread-dump, heap-dump, liferaycli-creds
`);

  command
    .command('gogo')
    .description('Conectar al Gogo Shell OSGi de Liferay')
    .action(async () => {
      await withCommandContext({}, async (context) => {
        await runOsgiGogo(context.config);
      });
    });

  addOutputFormatOption(
    command
      .command('status')
      .description('Inspect the state of a specific OSGi bundle')
      .argument('<bundle>', 'Bundle symbolic name'),
  ).action(createFormattedArgumentAction(async (context, bundle: string) => runOsgiStatus(context.config, {bundle}), {text: formatOsgiStatus}));

  addOutputFormatOption(
    command
      .command('diag')
      .description('Run Gogo diag for a specific OSGi bundle')
      .argument('<bundle>', 'Bundle symbolic name'),
  ).action(createFormattedArgumentAction(async (context, bundle: string) => runOsgiDiag(context.config, {bundle}), {text: formatOsgiDiag}));

  addOutputFormatOption(
    command
      .command('thread-dump')
      .description('Collect one or more thread dumps from the Liferay process')
      .option('--count <count>', 'Number of dumps', '6')
      .option('--interval <seconds>', 'Seconds between dumps', '3'),
  ).action(createFormattedAction(async (context, options: {count?: string; interval?: string}) => runOsgiThreadDump(context.config, {
        count: Number(options.count ?? '6'),
        intervalSeconds: Number(options.interval ?? '3'),
      }), {text: formatOsgiThreadDump}));

  addOutputFormatOption(
    command
      .command('heap-dump')
      .description('Generate a heap dump from the Liferay process'),
  ).action(createFormattedAction(async (context) => runOsgiHeapDump(context.config), {text: formatOsgiHeapDump}));

  addOutputFormatOption(
    command
      .command('liferaycli-creds')
      .description('Print OAuth2 credentials for the local liferay-cli app')
      .option('--write-env', 'Persist read-write OAuth2 credentials into docker/.env'),
  ).action(createFormattedAction(
    async (context, options: {writeEnv?: boolean}) => runOsgiLiferayCliCreds(context.config, {
      writeEnv: Boolean(options.writeEnv),
    }),
    {text: formatOsgiLiferayCliCreds},
  ));

  return command;
}
