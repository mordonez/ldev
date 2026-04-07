import type {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatDbFilesDetect, runDbFilesDetect} from '../../features/db/db-files-detect.js';
import {formatDbFilesDownload, runDbFilesDownload} from '../../features/db/db-files-download.js';
import {formatDbFilesMount, runDbFilesMount} from '../../features/db/db-files-mount.js';

export function registerDbFilesCommands(command: Command): void {
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
  ).action(
    createFormattedAction(
      async (
        context,
        options: {environment?: string; backupId?: string; project?: string; doclibDest?: string; background?: boolean},
      ) =>
        runDbFilesDownload(context.config, {
          environment: options.environment,
          backupId: options.backupId,
          project: options.project,
          doclibDest: options.doclibDest,
          background: Boolean(options.background),
          printer: context.printer,
        }),
      {text: formatDbFilesDownload},
    ),
  );

  addOutputFormatOption(
    command
      .command('files-mount')
      .helpGroup('Document Library workflows:')
      .description('Mount or recreate the Docker volume for Document Library')
      .option('--path <path>', 'Local doclib path'),
  ).action(
    createFormattedAction(
      async (context, options: {path?: string}) =>
        runDbFilesMount(context.config, {
          path: options.path,
          printer: context.printer,
        }),
      {text: formatDbFilesMount},
    ),
  );

  addOutputFormatOption(
    command
      .command('files-detect')
      .helpGroup('Document Library workflows:')
      .description('Detect a document_library directory and store it in docker/.env')
      .option('--base-dir <dir>', 'Directory where the search should start'),
  ).action(
    createFormattedAction(
      async (context, options: {baseDir?: string}) =>
        runDbFilesDetect(context.config, {
          baseDir: options.baseDir,
        }),
      {text: formatDbFilesDetect},
    ),
  );
}
