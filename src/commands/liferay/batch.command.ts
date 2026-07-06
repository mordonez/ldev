import {Command, InvalidArgumentError} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_POLL_TIMEOUT_SECONDS,
  formatLiferayBatchExport,
  formatLiferayBatchImport,
  formatLiferayBatchStatus,
  getLiferayBatchExportExitCode,
  getLiferayBatchImportExitCode,
  getLiferayBatchStatusExitCode,
  runLiferayBatchExport,
  runLiferayBatchImport,
  runLiferayBatchStatus,
} from '../../features/liferay/batch/liferay-batch-engine.js';

type BatchImportCommandOptions = {
  className: string;
  file?: string;
  data?: string;
  createStrategy?: string;
  importStrategy?: string;
  externalReferenceCode?: string;
  fieldNameMapping?: string;
  taskItemDelegateName?: string;
  poll?: boolean;
  pollInterval: number;
  pollTimeout: number;
};

type BatchExportCommandOptions = {
  className: string;
  contentType?: string;
  fieldNames?: string;
  taskItemDelegateName?: string;
  poll?: boolean;
  pollInterval: number;
  pollTimeout: number;
};

type BatchStatusCommandOptions = {
  task: number;
  operation?: string;
};

function parsePositiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`${flag} must be a positive number`);
  }

  return parsed;
}

function parseTaskId(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('--task must be a positive integer');
  }

  return parsed;
}

export function createBatchCommands(parent: Command): void {
  const batch = new Command('batch')
    .helpGroup('Batch Engine:')
    .description('Batch Engine import/export wrapper with executeStatus polling')
    .addHelpText(
      'after',
      `
Wraps the Liferay headless-batch-engine API (the modern async import/export
mechanism used by LAR Mirror imports for Pages, Object Entries, etc.).

Submits a batch job, polls GET .../import-tasks/{id} or .../export-tasks/{id}
until executeStatus is COMPLETED or FAILED, and reports failures with a
read-back verification, following the same evidence-based contract as
'ldev resource import-*'.

Examples:
  ldev portal batch import --class-name com.liferay.object.model.ObjectEntry --file entries.json
  ldev portal batch import --class-name com.liferay.object.model.ObjectEntry --file entries.json --no-poll
  ldev portal batch export --class-name com.liferay.object.model.ObjectEntry --poll
  ldev portal batch status --task 12345
`,
    );

  addOutputFormatOption(
    batch
      .command('import')
      .description('Submit a Batch Engine import task and poll executeStatus until it finishes')
      .requiredOption(
        '--class-name <className>',
        'Fully qualified DTO class name, e.g. com.liferay.object.model.ObjectEntry',
      )
      .option('--file <file>', 'JSON file with the import payload (array of items, or {items: [...]})')
      .option('--data <json>', 'Inline JSON payload; alternative to --file')
      .option('--create-strategy <strategy>', 'INSERT or UPSERT')
      .option('--import-strategy <strategy>', 'ON_ERROR_CONTINUE or ON_ERROR_FAIL')
      .option('--external-reference-code <erc>', 'External reference code for the batch task')
      .option('--field-name-mapping <mapping>', 'Field name mapping override, as expected by the Batch Engine API')
      .option('--task-item-delegate-name <name>', 'Task item delegate name override')
      .option('--no-poll', 'Submit only; do not wait for executeStatus to reach a terminal state')
      .option(
        '--poll-interval <seconds>',
        'Polling interval in seconds',
        (value) => parsePositiveNumber(value, '--poll-interval'),
        DEFAULT_POLL_INTERVAL_SECONDS,
      )
      .option(
        '--poll-timeout <seconds>',
        'Maximum time to poll before giving up, in seconds',
        (value) => parsePositiveNumber(value, '--poll-timeout'),
        DEFAULT_POLL_TIMEOUT_SECONDS,
      ),
  ).action(
    createFormattedAction(
      async (context, options: BatchImportCommandOptions) =>
        runLiferayBatchImport(context.config, {
          className: options.className,
          file: options.file,
          data: options.data,
          createStrategy: options.createStrategy,
          importStrategy: options.importStrategy,
          externalReferenceCode: options.externalReferenceCode,
          fieldNameMapping: options.fieldNameMapping,
          taskItemDelegateName: options.taskItemDelegateName,
          poll: options.poll,
          pollIntervalSeconds: options.pollInterval,
          pollTimeoutSeconds: options.pollTimeout,
        }),
      {text: formatLiferayBatchImport, exitCode: getLiferayBatchImportExitCode},
    ),
  );

  addOutputFormatOption(
    batch
      .command('export')
      .description('Submit a Batch Engine export task, optionally polling executeStatus until it finishes')
      .requiredOption(
        '--class-name <className>',
        'Fully qualified DTO class name, e.g. com.liferay.object.model.ObjectEntry',
      )
      .option('--content-type <type>', 'Export content type, e.g. JSON, CSV, XML', 'JSON')
      .option('--field-names <fields>', 'Comma-separated field names to export')
      .option('--task-item-delegate-name <name>', 'Task item delegate name override')
      .option('--poll', 'Wait for executeStatus to reach a terminal state before returning')
      .option(
        '--poll-interval <seconds>',
        'Polling interval in seconds',
        (value) => parsePositiveNumber(value, '--poll-interval'),
        DEFAULT_POLL_INTERVAL_SECONDS,
      )
      .option(
        '--poll-timeout <seconds>',
        'Maximum time to poll before giving up, in seconds',
        (value) => parsePositiveNumber(value, '--poll-timeout'),
        DEFAULT_POLL_TIMEOUT_SECONDS,
      ),
  ).action(
    createFormattedAction(
      async (context, options: BatchExportCommandOptions) =>
        runLiferayBatchExport(context.config, {
          className: options.className,
          contentType: options.contentType,
          fieldNames: options.fieldNames,
          taskItemDelegateName: options.taskItemDelegateName,
          poll: Boolean(options.poll),
          pollIntervalSeconds: options.pollInterval,
          pollTimeoutSeconds: options.pollTimeout,
        }),
      {text: formatLiferayBatchExport, exitCode: getLiferayBatchExportExitCode},
    ),
  );

  addOutputFormatOption(
    batch
      .command('status')
      .description('Fetch the current executeStatus of a previously submitted batch task')
      .requiredOption('--task <taskId>', 'Batch task id', parseTaskId)
      .option('--operation <operation>', 'import or export', 'import'),
  ).action(
    createFormattedAction(
      async (context, options: BatchStatusCommandOptions) =>
        runLiferayBatchStatus(context.config, {
          taskId: options.task,
          operation: options.operation === 'export' ? 'export' : 'import',
        }),
      {text: formatLiferayBatchStatus, exitCode: getLiferayBatchStatusExitCode},
    ),
  );

  parent.addCommand(batch);
}
