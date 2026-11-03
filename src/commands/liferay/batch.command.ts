import {Command, InvalidArgumentError} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatLiferayBatchImport, runLiferayBatchImport} from '../../features/liferay/batch/liferay-batch-import.js';
import {formatLiferayBatchStatus, runLiferayBatchStatus} from '../../features/liferay/batch/liferay-batch-status.js';
import type {BatchCreateStrategy, BatchImportStrategy} from '../../features/liferay/batch/liferay-batch-shared.js';

type BatchImportOptions = {
  file: string;
  className?: string;
  taskItemDelegateName?: string;
  createStrategy?: BatchCreateStrategy;
  importStrategy?: BatchImportStrategy;
  site?: string;
  checkOnly?: boolean;
  timeout?: string;
};

function oneOf<T extends string>(values: readonly T[]) {
  return (value: string): T => {
    if ((values as readonly string[]).includes(value)) {
      return value as T;
    }
    throw new InvalidArgumentError(`Expected one of: ${values.join(', ')}`);
  };
}

export function createBatchCommand(): Command {
  const command = new Command('batch')
    .description('Run Batch Engine import tasks with polling and read-back')
    .addHelpText(
      'after',
      `
Accepts a JSON array of items (with --class-name) or a *.batch-engine-data.json
file from a batch client extension ({configuration, items}).

The task is polled until COMPLETED or FAILED. The command fails when the task
FAILED, when any item failed (ON_ERROR_CONTINUE still ends COMPLETED), or when
an item with an externalReferenceCode cannot be read back. Batch imports are not
transactional: the error lists items that were already written.

Read-back by ERC: ObjectDefinition, ListTypeDefinition, ObjectEntry
(--task-item-delegate-name C_<Object>) and TaxonomyVocabulary (with --site).

OAuth: ldev oauth install --scope-profile batch
`,
    );

  addOutputFormatOption(
    command
      .command('import')
      .description('Submit a Batch Engine import, wait for it and verify the items by ERC')
      .requiredOption('--file <file>', 'Items JSON array or *.batch-engine-data.json')
      .option('--class-name <className>', 'DTO class, e.g. com.liferay.object.admin.rest.dto.v1_0.ObjectDefinition')
      .option('--task-item-delegate-name <name>', 'Delegate, e.g. C_Course for object entries')
      .option(
        '--create-strategy <strategy>',
        'INSERT or UPSERT (default: UPSERT, or the file configuration)',
        oneOf(['INSERT', 'UPSERT'] as const),
      )
      .option(
        '--import-strategy <strategy>',
        'ON_ERROR_FAIL or ON_ERROR_CONTINUE (default: ON_ERROR_FAIL, or the file configuration)',
        oneOf(['ON_ERROR_FAIL', 'ON_ERROR_CONTINUE'] as const),
      )
      .option('--site <site>', 'Site friendly URL or id for site-scoped items')
      .option('--check-only', 'Validate the file and report which items exist; do not import')
      .option('--timeout <seconds>', 'Seconds to wait for the task', '300'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: BatchImportOptions) =>
        runLiferayBatchImport(context.config, {
          file: options.file,
          className: options.className,
          taskItemDelegateName: options.taskItemDelegateName,
          createStrategy: options.createStrategy,
          importStrategy: options.importStrategy,
          site: options.site,
          checkOnly: Boolean(options.checkOnly),
          timeoutSeconds: Number(options.timeout ?? 300),
        }),
      {text: formatLiferayBatchImport},
    ),
  );

  addOutputFormatOption(
    command
      .command('status')
      .description('Show one Batch Engine import task')
      .requiredOption('--task <id>', 'Import task id'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: {task: string}) => runLiferayBatchStatus(context.config, {taskId: options.task}),
      {text: formatLiferayBatchStatus},
    ),
  );

  return command;
}
