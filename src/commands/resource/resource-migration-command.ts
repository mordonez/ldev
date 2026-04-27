import type {Command} from 'commander';

import {
  registerResourceWorkflow,
  type ResourceCommandOptionBag,
  type ResourceMigrationStage,
} from './resource-workflow.js';
import {
  formatLiferayResourceMigrationPipeline,
  formatLiferayResourceMigrationRun,
  runLiferayResourceMigrationPipeline,
  runLiferayResourceMigrationRun,
} from '../../features/liferay/resource/liferay-resource-migration.js';
import {
  formatLiferayResourceMigrationInit,
  runLiferayResourceMigrationInit,
} from '../../features/liferay/resource/liferay-resource-migration-init.js';

export function registerResourceMigrationCommand(resource: Command): void {
  registerResourceWorkflow(resource, {
    name: 'migration-init',
    description: 'Generate a base migration descriptor you can edit before running the migration',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--structure <structure>', 'Structure key or numeric id')
        .option('--file <file>', 'Local structure JSON; autodetects by structure if omitted')
        .option(
          '--output <file>',
          'Destination migration descriptor; defaults to paths.migrations/<site>/<structure>.migration.json',
        )
        .option('--templates', 'Sync templates associated to the structure in migration-pipeline')
        .option('--overwrite', 'Overwrite an existing descriptor'),
    run: async (context, options) => {
      return runLiferayResourceMigrationInit(context.config, {
        site: options.site,
        key: options.structure as string | undefined,
        file: options.file,
        output: options.output,
        templates: Boolean(options.templates),
        overwrite: Boolean(options.overwrite),
      });
    },
    render: {text: formatLiferayResourceMigrationInit},
  });

  registerResourceWorkflow(resource, {
    name: 'migration-run',
    description: 'Advanced: run a single migration stage from a descriptor; prefer migration-pipeline for normal use',
    configure: (command) =>
      command
        .requiredOption('--migration-file <file>', 'Migration descriptor JSON file')
        .option('--stage <stage>', 'Stage to run: introduce or cleanup', 'introduce')
        .option('--check-only', 'Validate only; do not mutate structures')
        .option('--migration-dry-run', 'Do not persist structured content migration updates')
        .option('--skip-update', 'Do not update the structure definition itself'),
    run: async (context, options: ResourceCommandOptionBag & {migrationFile: string; stage: ResourceMigrationStage}) =>
      runLiferayResourceMigrationRun(context.config, {
        migrationFile: options.migrationFile,
        stage: options.stage,
        checkOnly: Boolean(options.checkOnly),
        migrationDryRun: Boolean(options.migrationDryRun),
        skipUpdate: Boolean(options.skipUpdate),
        printer: context.printer,
      }),
    render: {text: formatLiferayResourceMigrationRun},
  });

  registerResourceWorkflow(resource, {
    name: 'migration-pipeline',
    description:
      'Recommended: run the full migration workflow from one descriptor, including validation and optional cleanup',
    configure: (command) =>
      command
        .requiredOption('--migration-file <file>', 'Migration descriptor JSON file')
        .option('--check-only', 'Validate only; do not mutate structures or templates')
        .option('--migration-dry-run', 'Do not persist structured content migration updates')
        .option('--run-cleanup', 'Execute the cleanup phase defined in the same descriptor')
        .option('--skip-validation', 'Skip the final check-only validation pass')
        .option('--create-missing-templates', 'Create descriptor templates when they do not exist'),
    run: async (context, options: ResourceCommandOptionBag & {migrationFile: string}) =>
      runLiferayResourceMigrationPipeline(context.config, {
        migrationFile: options.migrationFile,
        checkOnly: Boolean(options.checkOnly),
        migrationDryRun: Boolean(options.migrationDryRun),
        runCleanup: Boolean(options.runCleanup),
        skipValidation: Boolean(options.skipValidation),
        createMissingTemplates: Boolean(options.createMissingTemplates),
        printer: context.printer,
      }),
    render: {text: formatLiferayResourceMigrationPipeline},
  });
}
