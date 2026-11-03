import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {runLiferayResourceImportAdt} from './liferay-resource-import-adt.js';
import {runLiferayResourceImportStructure} from './liferay-resource-import-structure.js';
import {runLiferayResourceImportTemplate} from './liferay-resource-import-template.js';
import {
  normalizeImportKeys,
  resolveDefaultOrSiteBaseDir,
  runLiferayResourceFileImport,
  type LiferayResourceImportResult,
  unwrapLiferayResourceImportFailure,
} from './liferay-resource-import-shared.js';

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
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportResult> {
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
        runLiferayResourceImportStructure(
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

export async function runLiferayResourceImportTemplates(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    allSites?: boolean;
    apply?: boolean;
    templateKeys?: string[];
    checkOnly?: boolean;
    createMissing?: boolean;
    structureKey?: string;
    continueOnError?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportResult> {
  const templateKeys = normalizeImportKeys(options?.templateKeys);
  if (!options?.allSites && !options?.apply && templateKeys.length === 0) {
    throw LiferayErrors.resourceError(
      'resource import-templates requires --template <key> (repeatable), --apply for the resolved site, or --all-sites to avoid accidental mass imports.',
    );
  }

  try {
    return await runLiferayResourceFileImport(config, {
      artifactType: 'template',
      dir: options?.dir,
      site: options?.site,
      allSites: Boolean(options?.allSites),
      continueOnError: Boolean(options?.continueOnError),
      extension: '.ftl',
      allowedKeys: templateKeys,
      runEntry: (site, file) =>
        runLiferayResourceImportTemplate(
          config,
          {
            site,
            key: path.basename(file, '.ftl'),
            file,
            structureKey: options?.structureKey,
            checkOnly: Boolean(options?.checkOnly),
            createMissing: Boolean(options?.createMissing),
          },
          dependencies,
        ),
      formatFailure: (failure) =>
        `Import failed for template '${failure.entry}' in site '${failure.site}': ${failure.message}`,
    });
  } catch (error) {
    const failure = unwrapLiferayResourceImportFailure(error);
    if (failure) {
      throw LiferayErrors.resourceError(
        `Import failed for template '${failure.entry}' in site '${failure.site}': ${failure.message}`,
        {details: failure},
      );
    }
    throw error;
  }
}

export async function runLiferayResourceImportAdts(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    allSites?: boolean;
    apply?: boolean;
    adtKeys?: string[];
    checkOnly?: boolean;
    createMissing?: boolean;
    widgetType?: string;
    className?: string;
    continueOnError?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportResult> {
  const adtKeys = normalizeImportKeys(options?.adtKeys);
  const hasScopedFilter =
    adtKeys.length > 0 || Boolean(options?.widgetType?.trim()) || Boolean(options?.className?.trim());
  if (!options?.allSites && !options?.apply && !hasScopedFilter) {
    throw LiferayErrors.resourceError(
      'resource import-adts requires --adt <key> (repeatable), --widget-type, --class-name, --apply for the resolved site, or --all-sites to avoid accidental mass imports.',
    );
  }

  try {
    return await runLiferayResourceFileImport(config, {
      artifactType: 'adt',
      dir: options?.dir,
      site: options?.site,
      allSites: Boolean(options?.allSites),
      continueOnError: Boolean(options?.continueOnError),
      extension: '.ftl',
      allowedKeys: adtKeys,
      resolveSiteDirs: resolveDefaultOrSiteBaseDir,
      runEntry: (site, file) =>
        runLiferayResourceImportAdt(
          config,
          {
            site,
            file,
            widgetType: options?.widgetType,
            className: options?.className,
            checkOnly: Boolean(options?.checkOnly),
            createMissing: Boolean(options?.createMissing),
          },
          dependencies,
        ),
      formatFailure: (failure) =>
        `Import failed for ADT '${failure.entry}' in site '${failure.site}': ${failure.message}`,
    });
  } catch (error) {
    const failure = unwrapLiferayResourceImportFailure(error);
    if (failure) {
      throw LiferayErrors.resourceError(
        `Import failed for ADT '${failure.entry}' in site '${failure.site}': ${failure.message}`,
        {details: failure},
      );
    }
    throw error;
  }
}
