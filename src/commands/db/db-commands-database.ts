import type {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {formatDbDownload, runDbDownload} from '../../features/db/db-download.js';
import {formatDbImport, runDbImport} from '../../features/db/db-import.js';
import {formatDbQuery, runDbQuery} from '../../features/db/db-query.js';
import {formatDbSync, runDbSync} from '../../features/db/db-sync.js';

export function registerDbDatabaseCommands(command: Command): void {
  addOutputFormatOption(
    command
      .command('import')
      .helpGroup('Database workflows:')
      .description('Import a local SQL backup into the local postgres service')
      .option('--file <file>', 'Backup file; autodetects the newest .gz/.sql/.dump under docker/backups if omitted')
      .option('--force', 'Replace the current local postgres-data before importing')
      .option('--skip-post-import', 'Skip docker/sql/post-import.d/*.sql after the import'),
  ).action(
    createFormattedAction(
      async (context, options: {file?: string; skipPostImport?: boolean; force?: boolean}) =>
        runDbImport(context.config, {
          file: options.file,
          force: Boolean(options.force),
          skipPostImport: Boolean(options.skipPostImport),
          printer: context.printer,
        }),
      {text: formatDbImport},
    ),
  );

  addOutputFormatOption(
    command
      .command('download')
      .helpGroup('Database workflows:')
      .description('Download a database backup from LCP into docker/backups')
      .option('--environment <environment>', 'LCP environment')
      .option('--backup-id <backupId>', 'Specific backup id')
      .option('--project <project>', 'LCP project'),
  ).action(
    createFormattedAction(
      async (context, options: {environment?: string; backupId?: string; project?: string}) =>
        runDbDownload(context.config, {
          environment: options.environment,
          backupId: options.backupId,
          project: options.project,
          printer: context.printer,
        }),
      {text: formatDbDownload},
    ),
  );

  addOutputFormatOption(
    command
      .command('sync')
      .helpGroup('Database workflows:')
      .description('Download and import a database backup from LCP')
      .option('--environment <environment>', 'LCP environment')
      .option('--backup-id <backupId>', 'Specific backup id')
      .option('--project <project>', 'LCP project')
      .option('--force', 'Replace the current local postgres-data before importing')
      .option('--skip-post-import', 'Skip docker/sql/post-import.d/*.sql after the import'),
  ).action(
    createFormattedAction(
      async (
        context,
        options: {environment?: string; backupId?: string; project?: string; skipPostImport?: boolean; force?: boolean},
      ) =>
        runDbSync(context.config, {
          environment: options.environment,
          backupId: options.backupId,
          project: options.project,
          force: Boolean(options.force),
          skipPostImport: Boolean(options.skipPostImport),
          printer: context.printer,
        }),
      {text: formatDbSync},
    ),
  );

  addOutputFormatOption(
    command
      .command('query')
      .helpGroup('Database workflows:')
      .description('Execute SQL directly against the local PostgreSQL container')
      .argument('[query]', 'Inline SQL query')
      .option('--file <file>', 'Read SQL from a file'),
  ).action(
    createFormattedArgumentAction(
      async (context, query: string | undefined, options: {file?: string}) =>
        runDbQuery(context.config, {
          query,
          file: options.file,
        }),
      {text: formatDbQuery},
    ),
  );
}
