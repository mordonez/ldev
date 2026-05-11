import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {
  formatLiferayResourceImportResult,
  getLiferayResourceImportExitCode,
  normalizeImportKeys,
  runLiferayResourceFileImport,
  unwrapLiferayResourceImportFailure,
  type LiferayResourceImportResult,
} from './liferay-resource-import-shared.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {runLiferayResourceSyncStructure} from './liferay-resource-sync-structure.js';

export type LiferayResourceImportStructuresResult = LiferayResourceImportResult;

export async function runLiferayResourceImportStructures(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    allSites?: boolean;
    apply?: boolean;
    structureKeys?: string[];
    checkOnly?: boolean;
    createMissing?: boolean;
    skipUpdate?: boolean;
    migrationPlan?: string;
    migrationPhase?: string;
    migrationDryRun?: boolean;
    cleanupMigration?: boolean;
    allowBreakingChange?: boolean;
    continueOnError?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceImportStructuresResult> {
  const structureKeys = normalizeImportKeys(options?.structureKeys);
  if (!options?.allSites && !options?.apply && structureKeys.length === 0) {
    throw LiferayErrors.resourceError(
      'resource import-structures requires --structure <key> (repeatable), --apply for the resolved site, or --all-sites to avoid accidental mass imports.',
    );
  }

  try {
    return await runLiferayResourceFileImport(config, {
      artifactType: 'structure',
      dir: options?.dir,
      site: options?.site,
      allSites: Boolean(options?.allSites),
      continueOnError: Boolean(options?.continueOnError),
      extension: '.json',
      allowedKeys: structureKeys,
      runEntry: (site, file) =>
        runLiferayResourceSyncStructure(
          config,
          {
            site,
            key: path.basename(file, '.json'),
            file,
            checkOnly: Boolean(options?.checkOnly),
            createMissing: Boolean(options?.createMissing),
            skipUpdate: Boolean(options?.skipUpdate),
            migrationPlan: options?.migrationPlan,
            migrationPhase: options?.migrationPhase,
            migrationDryRun: Boolean(options?.migrationDryRun),
            cleanupMigration: Boolean(options?.cleanupMigration),
            allowBreakingChange: Boolean(options?.allowBreakingChange),
          },
          dependencies,
        ),
      formatFailure: (failure) =>
        `Import failed for structure '${failure.entry}' in site '${failure.site}': ${failure.message}`,
    });
  } catch (error) {
    const failure = unwrapLiferayResourceImportFailure(error);
    if (failure) {
      throw LiferayErrors.resourceError(
        `Import failed for structure '${failure.entry}' in site '${failure.site}': ${failure.message}`,
        {details: failure},
      );
    }

    throw error;
  }
}

export function formatLiferayResourceImportStructures(result: LiferayResourceImportStructuresResult): string {
  return formatLiferayResourceImportResult(result);
}

export function getLiferayResourceImportStructuresExitCode(result: LiferayResourceImportStructuresResult): number {
  return getLiferayResourceImportExitCode(result);
}
