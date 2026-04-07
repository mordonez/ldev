import {Command} from 'commander';

import {addOutputFormatOption, createFormattedArgumentAction} from '../../cli/command-helpers.js';
import {
  formatLiferayConfigGet,
  formatLiferayConfigSet,
  runLiferayConfigGet,
  runLiferayConfigSet,
} from '../../features/liferay/liferay-config.js';

export function createLiferayConfigCommand(): Command {
  const command = new Command('config').description('Inspect and update effective local Liferay config files');

  addOutputFormatOption(
    command
      .command('get')
      .description('Read one portal property or one OSGi config PID from local config files')
      .argument('<target>', 'Portal property key or OSGi PID')
      .option('--source <source>', 'source or effective', 'effective'),
    'json',
  ).action(
    createFormattedArgumentAction(
      async (context, target: string, options: {source?: 'effective' | 'source'}) =>
        runLiferayConfigGet(context.config, {
          target,
          source: options.source,
        }),
      {text: formatLiferayConfigGet},
    ),
  );

  addOutputFormatOption(
    command
      .command('set')
      .description('Write one portal property or one OSGi config key into local config files')
      .argument('<target>', 'Portal property key or OSGi PID')
      .requiredOption('--value <value>', 'New value')
      .option('--key <key>', 'OSGi config key; when omitted target is treated as portal property key')
      .option('--source <source>', 'source or effective', 'source'),
    'json',
  ).action(
    createFormattedArgumentAction(
      async (context, target: string, options: {value: string; key?: string; source?: 'effective' | 'source'}) =>
        runLiferayConfigSet(context.config, {
          target,
          key: options.key,
          value: options.value,
          source: options.source,
        }),
      {text: formatLiferayConfigSet},
    ),
  );

  return command;
}
