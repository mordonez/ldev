import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {withProgress, type Printer} from '../../../../core/output/printer.js';
import {runLiferayResourceImportStructure} from '../liferay-resource-import-structure.js';
import type {ResourceDependencies} from '../liferay-resource-artifact-shared.js';
import {readMigrationDescriptor, type MigrationStage} from './pipeline-descriptor.js';
import {resolveMigrationStructureFile, runCleanupStage, writeTempPlanFile} from './pipeline-stages.js';

export type LiferayResourceMigrationRunResult = {
  site: string;
  structureKey: string;
  stage: MigrationStage;
  status: string;
  id: string;
  migrationApplied: boolean;
  migratedArticleKeys: string[];
};

export async function runLiferayResourceMigrationRun(
  config: AppConfig,
  options: {
    migrationFile: string;
    stage?: MigrationStage;
    checkOnly?: boolean;
    migrationDryRun?: boolean;
    skipUpdate?: boolean;
    printer?: Printer;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceMigrationRunResult> {
  const descriptor = await readMigrationDescriptor(config, options.migrationFile);
  const stage = options.stage ?? 'introduce';

  if (stage === 'cleanup') {
    const result = await runCleanupStage(
      config,
      descriptor,
      [],
      {
        checkOnly: options.checkOnly,
        migrationDryRun: options.migrationDryRun,
      },
      dependencies,
    );

    return {
      site: descriptor.site,
      structureKey: descriptor.structureKey,
      stage,
      status: result.status,
      id: result.id,
      migrationApplied: Boolean(result.migration) && !result.migration?.dryRun,
      migratedArticleKeys: result.migration?.articleKeys ?? [],
    };
  }

  const stageDescriptor = descriptor.introduce;
  const structureFile = await resolveMigrationStructureFile(config, descriptor, stageDescriptor);

  const planFile = await writeTempPlanFile(stageDescriptor.planNode);

  try {
    const syncTask = async () =>
      runLiferayResourceImportStructure(
        config,
        {
          site: descriptor.site,
          key: descriptor.structureKey,
          file: structureFile,
          checkOnly: Boolean(options.checkOnly),
          skipUpdate: Boolean(options.skipUpdate),
          migrationPlan: planFile,
          migrationPhase: 'post',
          migrationDryRun: Boolean(options.checkOnly) || Boolean(options.migrationDryRun),
          cleanupMigration: stageDescriptor.cleanupMigration,
          printer: options.printer,
        },
        dependencies,
      );

    const progressMessage = `Running ${stage} migration for structure: ${descriptor.structureKey} (site: ${descriptor.site})`;
    const result = options.printer ? await withProgress(options.printer, progressMessage, syncTask) : await syncTask();

    if (result.migration) {
      options.printer?.info(
        `Migration complete: ${result.migration.migrated} updated, ${result.migration.unchanged} unchanged, ${result.migration.failed} failed out of ${result.migration.scanned} scanned`,
      );
      options.printer?.info(
        `Migration reasons: copied=${result.migration.reasonBreakdown.copiedToNewField}, already-target=${result.migration.reasonBreakdown.alreadyHadTargetValue}, source-empty=${result.migration.reasonBreakdown.sourceEmpty}, no-delta=${result.migration.reasonBreakdown.noEffectiveChange}, source-cleaned=${result.migration.reasonBreakdown.sourceCleaned}`,
      );
    } else {
      options.printer?.info(`Migration phase completed: ${result.status}`);
    }
    return {
      site: descriptor.site,
      structureKey: descriptor.structureKey,
      stage,
      status: result.status,
      id: result.id,
      migrationApplied: Boolean(result.migration) && !result.migration?.dryRun,
      migratedArticleKeys: result.migration?.articleKeys ?? [],
    };
  } finally {
    await fs.remove(planFile);
  }
}

export function formatLiferayResourceMigrationRun(result: LiferayResourceMigrationRunResult): string {
  return `${result.status}\t${result.structureKey}\t${result.id}\nsite=${result.site}\nstage=${result.stage}\nmigrationApplied=${result.migrationApplied}`;
}
