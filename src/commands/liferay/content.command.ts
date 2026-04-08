import {Command} from 'commander';

import {CliError} from '../../core/errors.js';
import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatContentPrune, runContentPrune} from '../../features/liferay/content/liferay-content-prune.js';

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function createContentCommand(): Command {
  const command = new Command('content').description('Journal/web content management').addHelpText(
    'after',
    `
Use this namespace to safely reduce content volume in local environments after a db sync/import.

Commands:
  prune   Remove Journal articles from specified folders, optionally filtered by structure
`,
  );

  addOutputFormatOption(
    command
      .command('prune')
      .description('Reduce Journal article volume in a site for local environments')
      .option('--site <site>', 'Site friendly URL, e.g. /estudis (use instead of --group-id)')
      .option('--group-id <groupId>', 'Site group ID (use instead of --site)')
      .option('--root-folder <folderId>', 'Root folder ID to prune (repeatable, required)', collect, [] as string[])
      .option('--structure <key>', 'Structure key to filter, e.g. FITXA (repeatable)', collect, [] as string[])
      .option('--keep <n>', 'Articles to keep per structure (default: 0 = delete all)')
      .option('--dry-run', 'Preview what would be deleted without making changes')
      .addHelpText(
        'after',
        `
Safely reduces Journal article volume under the specified root folders.
Designed for local environments after ldev db sync/import to make reindexing viable.

Rules:
  - Exactly one of --site or --group-id is required.
  - --root-folder is repeatable and required.
  - --structure filters which articles are in scope (repeatable).
  - --keep N retains the N most recent articles per structure (by modifiedDate, stable by id).
  - Without --keep, all in-scope articles are deleted.
  - Folders are only removed if they end up completely empty after article deletion.
  - No SQL is used; all operations go through Liferay's service layer (Headless Delivery API).

Examples:
  # Preview what would be deleted in a folder
  ldev portal content prune --site /estudis --root-folder 12345 --dry-run

  # Delete everything under folder 12345 matching structure FITXA, keep 2 most recent
  ldev portal content prune --site /estudis --root-folder 12345 --structure FITXA --keep 2 --dry-run

  # Prune two structures, keep 3 each
  ldev portal content prune --site /estudis --root-folder 12345 --structure FITXA --structure GRAU --keep 3

  # Delete all articles under a folder (no structure filter)
  ldev portal content prune --site /estudis --root-folder 12345 --keep 0

  # Use group-id instead of site
  ldev portal content prune --group-id 20121 --root-folder 67890 --dry-run
`,
      ),
  ).action(
    createFormattedAction(
      async (
        context,
        options: {
          site?: string;
          groupId?: string;
          rootFolder: string[];
          structure: string[];
          keep?: string;
          dryRun?: boolean;
          format?: string;
          json?: boolean;
          ndjson?: boolean;
        },
      ) => {
        if (options.site && options.groupId) {
          throw new CliError('Use either --site or --group-id, not both.', {
            code: 'LIFERAY_CONTENT_PRUNE_ERROR',
          });
        }
        if (!options.site && !options.groupId) {
          throw new CliError('One of --site or --group-id is required.', {
            code: 'LIFERAY_CONTENT_PRUNE_ERROR',
          });
        }
        if (options.rootFolder.length === 0) {
          throw new CliError('At least one --root-folder is required.', {
            code: 'LIFERAY_CONTENT_PRUNE_ERROR',
          });
        }

        const keep = options.keep !== undefined ? Number.parseInt(options.keep, 10) : undefined;
        if (keep !== undefined && (Number.isNaN(keep) || keep < 0)) {
          throw new CliError('--keep must be a non-negative integer.', {
            code: 'LIFERAY_CONTENT_PRUNE_ERROR',
          });
        }

        return runContentPrune(context.config, {
          site: options.site,
          groupId: options.groupId ? Number.parseInt(options.groupId, 10) : undefined,
          rootFolders: options.rootFolder.map((id) => Number.parseInt(id, 10)),
          structures: options.structure.length > 0 ? options.structure : undefined,
          keep,
          dryRun: Boolean(options.dryRun),
        });
      },
      {text: formatContentPrune},
    ),
  );

  return command;
}
