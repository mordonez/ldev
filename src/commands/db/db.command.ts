import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatDbDownload, runDbDownload} from '../../features/db/db-download.js';
import {formatDbFilesDetect, runDbFilesDetect} from '../../features/db/db-files-detect.js';
import {formatDbFilesDownload, runDbFilesDownload} from '../../features/db/db-files-download.js';
import {formatDbFilesMount, runDbFilesMount} from '../../features/db/db-files-mount.js';
import {formatDbImport, runDbImport} from '../../features/db/db-import.js';
import {formatDbSync, runDbSync} from '../../features/db/db-sync.js';

export function createDbCommand(): Command {
  const command = new Command('db');

  command
    .description('Database backups, local import and Document Library tooling')
    .addHelpText('after', `
Use this namespace for state transfer between LCP and the local runtime.

Command groups:
  download / import / sync   PostgreSQL backup workflows
  files-*                    Document Library download, detection and mount workflows

Destructive behavior:
  import --force / sync --force   Replace the current local postgres-data before importing
`);

  addOutputFormatOption(
    command
      .command('import')
      .helpGroup('Database workflows:')
      .description('Import a local SQL backup into the local postgres service')
      .option('--file <file>', 'Backup file; autodetects the newest .gz/.sql/.dump under docker/backups if omitted')
      .option('--force', 'Replace the current local postgres-data before importing')
      .option('--skip-post-import', 'Skip docker/sql/post-import.d/*.sql after the import'),
  ).action(createFormattedAction(async (context, options: {file?: string; skipPostImport?: boolean; force?: boolean}) => runDbImport(context.config, {
        file: options.file,
        force: Boolean(options.force),
        skipPostImport: Boolean(options.skipPostImport),
        printer: context.printer,
      }), {text: formatDbImport}));

  addOutputFormatOption(
    command
      .command('download')
      .helpGroup('Database workflows:')
      .description('Download a database backup from LCP into docker/backups')
      .option('--environment <environment>', 'LCP environment')
      .option('--backup-id <backupId>', 'Specific backup id')
      .option('--project <project>', 'LCP project'),
  ).action(createFormattedAction(async (
        context,
        options: {environment?: string; backupId?: string; project?: string},
      ) => runDbDownload(context.config, {
        environment: options.environment,
        backupId: options.backupId,
        project: options.project,
        printer: context.printer,
      }), {text: formatDbDownload}));

  addOutputFormatOption(
    command
      .command('files-download')
      .helpGroup('Document Library workflows:')
      .description('Download Document Library content from LCP')
      .option('--environment <environment>', 'LCP environment')
      .option('--backup-id <backupId>', 'Specific backup id')
      .option('--project <project>', 'LCP project')
      .option('--doclib-dest <dir>', 'Directory where doclib should be downloaded')
      .option('--background', 'Run the doclib download in background'),
  ).action(createFormattedAction(async (
        context,
        options: {environment?: string; backupId?: string; project?: string; doclibDest?: string; background?: boolean},
      ) => runDbFilesDownload(context.config, {
        environment: options.environment,
        backupId: options.backupId,
        project: options.project,
        doclibDest: options.doclibDest,
        background: Boolean(options.background),
        printer: context.printer,
      }), {text: formatDbFilesDownload}));

  addOutputFormatOption(
    command
      .command('files-mount')
      .helpGroup('Document Library workflows:')
      .description('Mount or recreate the Docker volume for Document Library')
      .option('--path <path>', 'Local doclib path'),
  ).action(createFormattedAction(async (context, options: {path?: string}) => runDbFilesMount(context.config, {
        path: options.path,
        printer: context.printer,
      }), {text: formatDbFilesMount}));

  addOutputFormatOption(
    command
      .command('files-detect')
      .helpGroup('Document Library workflows:')
      .description('Detect a document_library directory and store it in docker/.env')
      .option('--base-dir <dir>', 'Directory where the search should start'),
  ).action(createFormattedAction(async (context, options: {baseDir?: string}) => runDbFilesDetect(context.config, {
        baseDir: options.baseDir,
      }), {text: formatDbFilesDetect}));

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
  ).action(createFormattedAction(async (
        context,
        options: {environment?: string; backupId?: string; project?: string; skipPostImport?: boolean; force?: boolean},
      ) => runDbSync(context.config, {
        environment: options.environment,
        backupId: options.backupId,
        project: options.project,
        force: Boolean(options.force),
        skipPostImport: Boolean(options.skipPostImport),
        printer: context.printer,
      }), {text: formatDbSync}));

  return command;
}
