import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {
  formatLiferayResourceImportResult,
  getLiferayResourceImportExitCode,
  normalizeImportKeys,
  resolveDefaultOrSiteBaseDir,
  runLiferayResourceFileImport,
  unwrapLiferayResourceImportFailure,
  type LiferayResourceImportResult,
} from './liferay-resource-import-shared.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {runLiferayResourceSyncAdt} from './liferay-resource-sync-adt.js';

export type LiferayResourceImportAdtsResult = LiferayResourceImportResult;

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
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceImportAdtsResult> {
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
        runLiferayResourceSyncAdt(
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

export function formatLiferayResourceImportAdts(result: LiferayResourceImportAdtsResult): string {
  return formatLiferayResourceImportResult(result);
}

export function getLiferayResourceImportAdtsExitCode(result: LiferayResourceImportAdtsResult): number {
  return getLiferayResourceImportExitCode(result);
}
