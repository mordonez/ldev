import type {AppConfig} from '../../../core/config/load-config.js';
import {CliError} from '../../../core/errors.js';
import {resolveSite} from '../inventory/liferay-inventory-shared.js';
import {resolveStructureFile} from './liferay-resource-paths.js';
import type {MigrationStats} from './liferay-resource-sync-structure-migration.js';
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
  };

  // Call strategy methods
  const local = await structureSyncStrategy.resolveLocal(config, site, strategyOptions);
  if (!local) {
    throw new CliError(`Structure file not found for key '${options.key}'.`, {
      code: 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
      details: {key: options.key, structureFile},
    });
  }

  const remote = await structureSyncStrategy.findRemote(config, site, local, strategyOptions, dependencies);

  // Guard: missing + !createMissing
  if (!remote && !options.createMissing) {
    throw new CliError(`Structure '${options.key}' does not exist and create-missing is not enabled.`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  // Guard: missing + checkOnly
  if (!remote && options.checkOnly) {
    return {
      status: 'checked_missing',
      id: '',
      key: options.key,
      siteId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
      structureFile,
      removedFieldReferences: [],
    };
  }

  // Upsert (strategy handles checkOnly/skipUpdate internally)
  const upserted = await structureSyncStrategy.upsert(config, site, local, remote, strategyOptions, dependencies);

  // Verify
  await structureSyncStrategy.verify(config, site, local, upserted, dependencies);

  // Determine final status
  const status = options.checkOnly ? 'checked' : remote ? 'updated' : 'created';

  // Return result
  return {
    status,
    id: upserted.id,
    key: options.key,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    structureFile,
    removedFieldReferences: upserted.data.removedFieldReferences,
    ...(upserted.data.recoveredAfterTimeout ? {recoveredAfterTimeout: true} : {}),
    ...(upserted.data.migration ? {migration: upserted.data.migration} : {}),
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
  }
  return lines.join('\n');
}
