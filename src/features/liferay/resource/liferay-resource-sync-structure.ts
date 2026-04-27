import type {AppConfig} from '../../../core/config/load-config.js';
import type {Printer} from '../../../core/output/printer.js';
import {resolveSite} from '../inventory/liferay-inventory-shared.js';
import {resolveStructureFile} from './liferay-resource-paths.js';
import type {MigrationStats} from './migration/index.js';
import {syncArtifactDetailed} from './sync-engine.js';
import {structureSyncStrategy, type StructureResourceDependencies} from './sync-strategies/structure-sync-strategy.js';

export type ResourceDependencies = StructureResourceDependencies;

export type LiferayResourceSyncStructureResult = {
  status: 'created' | 'updated' | 'checked' | 'checked_missing';
  id: string;
  key: string;
  siteId: number;
  siteFriendlyUrl: string;
  structureFile: string;
  removedFieldReferences: string[];
  recoveredAfterTimeout?: boolean;
  migration?: MigrationStats;
};

export async function runLiferayResourceSyncStructure(
  config: AppConfig,
  options: {
    site?: string;
    key: string;
    file?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
    skipUpdate?: boolean;
    migrationPlan?: string;
    migrationPhase?: string;
    migrationDryRun?: boolean;
    cleanupMigration?: boolean;
    allowBreakingChange?: boolean;
    printer?: Printer;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceSyncStructureResult> {
  // Resolve site (resolveSite returns { id, friendlyUrlPath } compatible with ResolvedSite)
  const site = await resolveSite(config, options.site ?? '/global', dependencies);
  const structureFile = await resolveStructureFile(config, options.key, options.file);

  // Prepare strategy options
  const strategyOptions = {
    key: options.key,
    file: options.file,
    checkOnly: options.checkOnly,
    createMissing: options.createMissing,
    skipUpdate: options.skipUpdate,
    migrationPlan: options.migrationPlan,
    migrationPhase: options.migrationPhase,
    migrationDryRun: options.migrationDryRun,
    cleanupMigration: options.cleanupMigration,
    allowBreakingChange: options.allowBreakingChange,
    printer: options.printer,
  };

  const outcome = await syncArtifactDetailed(
    config,
    site,
    structureSyncStrategy,
    {
      checkOnly: options.checkOnly,
      createMissing: options.createMissing,
      strategyOptions,
    },
    dependencies,
  );
  const changedRemote = outcome.changedRemoteArtifact;

  // Return result
  return {
    status: outcome.result.status,
    id: outcome.result.id,
    key: options.key,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    structureFile,
    removedFieldReferences: changedRemote?.data.removedFieldReferences ?? [],
    ...(changedRemote?.data.recoveredAfterTimeout ? {recoveredAfterTimeout: true} : {}),
    ...(changedRemote?.data.migration ? {migration: changedRemote.data.migration} : {}),
  };
}

export function formatLiferayResourceSyncStructure(result: LiferayResourceSyncStructureResult): string {
  const lines = [
    `${result.status}\t${result.key}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.structureFile}`,
  ];
  if (result.removedFieldReferences.length > 0) {
    lines.push(`removedFieldReferences=${result.removedFieldReferences.join(',')}`);
  }
  if (result.recoveredAfterTimeout) {
    lines.push('recoveredAfterTimeout=true');
  }
  if (result.migration) {
    lines.push(
      `migration scanned=${result.migration.scanned} migrated=${result.migration.migrated} unchanged=${result.migration.unchanged} failed=${result.migration.failed} dryRun=${result.migration.dryRun}`,
    );
    lines.push(
      `migration reasons copied=${result.migration.reasonBreakdown.copiedToNewField} alreadyTarget=${result.migration.reasonBreakdown.alreadyHadTargetValue} sourceEmpty=${result.migration.reasonBreakdown.sourceEmpty} noDelta=${result.migration.reasonBreakdown.noEffectiveChange} sourceCleaned=${result.migration.reasonBreakdown.sourceCleaned}`,
    );
  }
  return lines.join('\n');
}
