import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {withProgress, type Printer} from '../../../../core/output/printer.js';
import {runLiferayResourceImportStructure} from '../liferay-resource-import-structure.js';
import {runLiferayResourceImportTemplate} from '../liferay-resource-import-template.js';
import type {ResourceDependencies} from '../liferay-resource-artifact-shared.js';
import {readMigrationDescriptor} from './pipeline-descriptor.js';
import {
  resolveMigrationStructureFile,
  resolvePipelineTemplates,
  runCleanupStage,
  writeTempPlanFile,
} from './pipeline-stages.js';
import {runLiferayResourceMigrationRun} from './migration-run.js';

export type LiferayResourceMigrationPipelineResult = {
  site: string;
  structureKey: string;
  dependentStructureResults: Array<{key: string; status: string; id: string}>;
  structureStatus: string;
  templateResults: Array<{name: string; status: string; id: string}>;
  validationRun: boolean;
  cleanupRun: boolean;
};

export async function runLiferayResourceMigrationPipeline(
  config: AppConfig,
  options: {
    migrationFile: string;
    checkOnly?: boolean;
    migrationDryRun?: boolean;
    runCleanup?: boolean;
    skipValidation?: boolean;
    createMissingTemplates?: boolean;
    printer?: Printer;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceMigrationPipelineResult> {
  const descriptor = await readMigrationDescriptor(config, options.migrationFile);
  options.printer?.info(
    `Starting migration pipeline for structure: ${descriptor.structureKey} (site: ${descriptor.site})`,
  );
  const dependentStructureResults: Array<{key: string; status: string; id: string}> = [];

  if (descriptor.dependentStructures.length > 0) {
    options.printer?.info(`Processing ${descriptor.dependentStructures.length} dependent structure(s)...`);
  }

  for (const dependentKey of descriptor.dependentStructures) {
    const checked = await runLiferayResourceImportStructure(
      config,
      {
        site: '/global',
        key: dependentKey,
        checkOnly: true,
        createMissing: true,
      },
      dependencies,
    );
    if (checked.status === 'checked_missing' && !options.checkOnly) {
      const created = await runLiferayResourceImportStructure(
        config,
        {
          site: '/global',
          key: dependentKey,
          createMissing: true,
        },
        dependencies,
      );
      dependentStructureResults.push({key: dependentKey, status: created.status, id: created.id});
      continue;
    }
    dependentStructureResults.push({key: dependentKey, status: checked.status, id: checked.id});
  }

  options.printer?.info(`Running introduce phase of structure migration...`);
  const structure = await runLiferayResourceMigrationRun(
    config,
    {
      migrationFile: options.migrationFile,
      stage: 'introduce',
      checkOnly: options.checkOnly,
      migrationDryRun: options.migrationDryRun,
      printer: options.printer,
    },
    dependencies,
  );

  const pipelineTemplates = await resolvePipelineTemplates(config, descriptor, dependencies);
  const templateResults: Array<{name: string; status: string; id: string}> = [];
  for (const templateName of pipelineTemplates) {
    const templateTask = async () =>
      runLiferayResourceImportTemplate(
        config,
        {
          site: descriptor.site,
          key: templateName,
          checkOnly: Boolean(options.checkOnly),
          createMissing: Boolean(options.createMissingTemplates),
        },
        dependencies,
      );
    const result = options.printer
      ? await withProgress(
          options.printer,
          `Syncing template: ${templateName} (site: ${descriptor.site})`,
          templateTask,
        )
      : await templateTask();
    templateResults.push({name: templateName, status: result.status, id: result.id});
  }

  if (options.runCleanup) {
    const cleanupTask = async () =>
      runCleanupStage(
        config,
        descriptor,
        structure.migratedArticleKeys,
        {
          checkOnly: options.checkOnly,
          migrationDryRun: options.migrationDryRun,
        },
        dependencies,
      );
    const cleanupMessage = `Running cleanup phase of structure migration: ${descriptor.structureKey} (site: ${descriptor.site})`;
    if (options.printer) {
      await withProgress(options.printer, cleanupMessage, cleanupTask);
    } else {
      await cleanupTask();
    }
  }

  if (!options.skipValidation) {
    if (options.runCleanup) {
      const validationCleanupTask = async () =>
        runCleanupStage(
          config,
          descriptor,
          structure.migratedArticleKeys,
          {
            checkOnly: true,
            migrationDryRun: true,
          },
          dependencies,
        );
      const validationCleanupMessage = `Validating cleanup phase of structure migration: ${descriptor.structureKey} (site: ${descriptor.site})`;
      if (options.printer) {
        await withProgress(options.printer, validationCleanupMessage, validationCleanupTask);
      } else {
        await validationCleanupTask();
      }
    } else {
      const validationMessage = `Validating structure migration: ${descriptor.structureKey} (site: ${descriptor.site})`;
      const validationTask = async () => {
        const validationPlanFile = await writeTempPlanFile(descriptor.introduce.planNode);
        try {
          await runLiferayResourceImportStructure(
            config,
            {
              site: descriptor.site,
              key: descriptor.structureKey,
              file: await resolveMigrationStructureFile(config, descriptor, descriptor.introduce),
              checkOnly: true,
              migrationPlan: validationPlanFile,
              migrationPhase: 'post',
              cleanupMigration: false,
            },
            dependencies,
          );
        } finally {
          await fs.remove(validationPlanFile);
        }
      };
      if (options.printer) {
        await withProgress(options.printer, validationMessage, validationTask);
      } else {
        await validationTask();
      }
    }

    for (const templateName of pipelineTemplates) {
      const validateTemplateTask = async () =>
        runLiferayResourceImportTemplate(
          config,
          {
            site: descriptor.site,
            key: templateName,
            checkOnly: true,
          },
          dependencies,
        );
      if (options.printer) {
        await withProgress(
          options.printer,
          `Validating template: ${templateName} (site: ${descriptor.site})`,
          validateTemplateTask,
        );
      } else {
        await validateTemplateTask();
      }
    }
  }

  return {
    site: descriptor.site,
    structureKey: descriptor.structureKey,
    dependentStructureResults,
    structureStatus: structure.status,
    templateResults,
    validationRun: !options.skipValidation,
    cleanupRun: Boolean(options.runCleanup),
  };
}

export function formatLiferayResourceMigrationPipeline(result: LiferayResourceMigrationPipelineResult): string {
  const lines = [
    `${result.structureStatus}\t${result.structureKey}`,
    `site=${result.site}`,
    `dependentStructures=${result.dependentStructureResults.length}`,
    `templates=${result.templateResults.length}`,
    `validationRun=${result.validationRun}`,
    `cleanupRun=${result.cleanupRun}`,
  ];
  for (const dependentStructure of result.dependentStructureResults) {
    lines.push(`dependency ${dependentStructure.status}\t${dependentStructure.key}\t${dependentStructure.id}`);
  }
  for (const template of result.templateResults) {
    lines.push(`template ${template.status}\t${template.name}\t${template.id}`);
  }
  return lines.join('\n');
}
