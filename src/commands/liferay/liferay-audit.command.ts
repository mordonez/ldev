import type {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatLiferayAudit, runLiferayAudit} from '../../features/liferay/liferay-audit.js';

export function createLiferayAuditCommands(parent: Command): void {
  addOutputFormatOption(
    parent
      .command('audit')
      .helpGroup('Portal diagnostics:')
      .description('Inspect accessible site metadata and a minimal portal audit snapshot')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--page-size <pageSize>', 'Headless page size', '200'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayAudit(context.config, {
          site: options.site,
          pageSize: Number.parseInt(options.pageSize, 10) || 200,
        }),
      {text: formatLiferayAudit},
    ),
  );
}
