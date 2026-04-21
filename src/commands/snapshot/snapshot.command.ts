import {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {runDbImport} from '../../features/db/db-import.js';
import {formatRestore, runRestore} from '../../features/snapshot/restore.js';
import {formatSnapshot, runSnapshot} from '../../features/snapshot/snapshot.js';

export function createSnapshotCommand(): Command {
  return addOutputFormatOption(
    new Command('snapshot')
      .description('Create a local environment snapshot: DB dump plus repo configs/resources')
      .addHelpText(
        'after',
        `
This is a logical snapshot bundle for DB + repo-managed Liferay state.
It is intentionally different from:
  env restore   Runtime data rehydration from main/BTRFS worktree state
`,
      )
      .option('--output <path>', 'Target snapshot directory or .zip archive'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: {output?: string}) =>
        runSnapshot(context.config, {
          output: options.output,
          printer: context.printer,
        }),
      {text: formatSnapshot},
    ),
  );
}

export function createRestoreCommand(): Command {
  return addOutputFormatOption(
    new Command('restore')
      .description('Restore a snapshot bundle into the current local environment')
      .addHelpText(
        'after',
        `
This restores a snapshot created by 'ldev snapshot'.
It accepts either a snapshot directory or a .zip archive.
For runtime-data restoration across main/worktrees, use:
  ldev env restore
`,
      )
      .argument('<snapshot>', 'Snapshot directory')
      .option('--force', 'Actually restore the DB and copied files')
      .option('--skip-db', 'Skip database import')
      .option('--skip-files', 'Skip restoring configs/resources'),
    'json',
  ).action(
    createFormattedArgumentAction(
      async (context, snapshot: string, options: {force?: boolean; skipDb?: boolean; skipFiles?: boolean}) =>
        runRestore(context.config, {
          snapshot,
          force: Boolean(options.force),
          skipDb: Boolean(options.skipDb),
          skipFiles: Boolean(options.skipFiles),
          printer: context.printer,
          restoreDatabase: async (file, restoreOptions) => {
            await runDbImport(context.config, {
              file,
              force: true,
              processEnv: restoreOptions.processEnv,
              printer: restoreOptions.printer,
            });
          },
        }),
      {text: formatRestore},
    ),
  );
}
