import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  formatLiferaySearchIndices,
  formatLiferaySearchMappings,
  formatLiferaySearchQuery,
  runLiferaySearchIndices,
  runLiferaySearchMappings,
  runLiferaySearchQuery,
} from '../../features/liferay/liferay-search.js';

export function createLiferaySearchCommand(): Command {
  const command = new Command('search')
    .description('Inspect Elasticsearch indices, mappings and ad hoc queries')
    .addHelpText(
      'after',
      `
Use this namespace when you need direct Elasticsearch inspection.

Relationship with reindex:
  reindex status   Human-friendly summary of index status and reindex progress
  search indices   Broader index inventory with richer metadata
`,
    );

  addOutputFormatOption(command.command('indices').description('List Elasticsearch indices')).action(
    createFormattedAction(async (context) => runLiferaySearchIndices(context.config), {
      text: formatLiferaySearchIndices,
    }),
  );

  addOutputFormatOption(
    command
      .command('mappings')
      .description('Show mappings for one index')
      .requiredOption('--index <index>', 'Index name'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: {index: string}) => runLiferaySearchMappings(context.config, {index: options.index}),
      {text: formatLiferaySearchMappings},
    ),
  );

  addOutputFormatOption(
    command
      .command('query')
      .description('Execute a simple Elasticsearch query against one index')
      .requiredOption('--index <index>', 'Index name')
      .option('--query <query>', 'Query string, defaults to *')
      .option('--body <body>', 'Raw JSON request body'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: {index: string; query?: string; body?: string}) =>
        runLiferaySearchQuery(context.config, {
          index: options.index,
          query: options.query,
          body: options.body,
        }),
      {text: formatLiferaySearchQuery},
    ),
  );

  return command;
}
