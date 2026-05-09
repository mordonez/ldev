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
import {runLiferayResourceSyncTemplate} from './liferay-resource-sync-template.js';

export type LiferayResourceImportTemplatesResult = LiferayResourceImportResult;

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
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceImportTemplatesResult> {
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
        runLiferayResourceSyncTemplate(
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

export function formatLiferayResourceImportTemplates(result: LiferayResourceImportTemplatesResult): string {
  return formatLiferayResourceImportResult(result);
}

export function getLiferayResourceImportTemplatesExitCode(result: LiferayResourceImportTemplatesResult): number {
  return getLiferayResourceImportExitCode(result);
}
