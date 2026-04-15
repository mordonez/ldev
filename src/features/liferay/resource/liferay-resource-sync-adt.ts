import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResourceSyncDependencies, ResourceSyncResult} from './liferay-resource-sync-shared.js';
import {resolveResourceSite} from './liferay-resource-shared.js';
import {
  ADT_CLASS_BY_WIDGET_TYPE,
  normalizeAdtWidgetType,
  runLiferayResourceListAdts,
} from './liferay-resource-list-adts.js';
import {resolveAdtFile, ADT_WIDGET_DIR_BY_TYPE} from './liferay-resource-paths.js';
import {syncArtifact} from './sync-engine.js';
import {adtSyncStrategy} from './sync-strategies/adt-sync-strategy.js';
import {matchesAdtRow} from '../liferay-identifiers.js';

export type LiferayResourceSyncAdtResult = ResourceSyncResult & {
  adtFile: string;
  widgetType: string;
  siteId: number;
  siteFriendlyUrl: string;
};

export async function runLiferayResourceSyncAdt(
  config: AppConfig,
  options: {
    site?: string;
    key?: string;
    widgetType?: string;
    className?: string;
    file?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncAdtResult> {
  // Resolve widget type and class name
  const resolvedWidget = normalizeAdtWidgetType(options.widgetType ?? inferAdtWidgetType(options.file ?? ''));
  const resolvedClassName = options.className?.trim() || ADT_CLASS_BY_WIDGET_TYPE[resolvedWidget];
  if (!resolvedWidget || !resolvedClassName) {
    throw LiferayErrors.resourceError(`widget-type ADT no soportado: ${resolvedWidget || options.widgetType || ''}`);
  }

  const name = options.key?.trim() || inferAdtName(options.file ?? '');

  // Resolve initial site
  let site = await resolveResourceSite(config, options.site ?? '/global', dependencies);

  // ADT-specific: global fallback
  // Check if ADT exists in requested site, fall back to global if not found
  const existsInSite = await findAdtInSite(
    config,
    site.friendlyUrlPath,
    resolvedWidget,
    resolvedClassName,
    name,
    dependencies,
  );
  if (!existsInSite && site.friendlyUrlPath !== '/global') {
    const globalSite = await resolveResourceSite(config, '/global', dependencies);
    const existsInGlobal = await findAdtInSite(
      config,
      '/global',
      resolvedWidget,
      resolvedClassName,
      name,
      dependencies,
    );
    if (existsInGlobal) {
      site = globalSite;
    }
  }

  // Use SyncEngine with ADT strategy
  const engineResult = await syncArtifact(
    config,
    site,
    adtSyncStrategy,
    {
      checkOnly: options.checkOnly,
      createMissing: options.createMissing,
      strategyOptions: {
        key: name,
        widgetType: resolvedWidget,
        className: resolvedClassName,
        file: options.file,
      },
    },
    dependencies,
  );

  // Resolve adtFile from strategy options
  const adtFile = await resolveAdtFile(config, name, resolvedWidget, options.file);

  // Return result with extended fields for backward compatibility
  return {
    ...engineResult,
    extra: resolvedWidget,
    adtFile,
    widgetType: resolvedWidget,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
  };
}

export function formatLiferayResourceSyncAdt(result: LiferayResourceSyncAdtResult): string {
  return [
    `${result.status}\t${result.widgetType}\t${result.name}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.adtFile}`,
  ].join('\n');
}

/**
 * Helper: Infer ADT widget type from file path directory.
 */
function inferAdtWidgetType(file: string): string {
  if (!file) {
    return '';
  }
  const dir = path.basename(path.dirname(file));
  const match = Object.entries(ADT_WIDGET_DIR_BY_TYPE).find(([, value]) => value === dir);
  return match?.[0] ?? '';
}

/**
 * Helper: Infer ADT name from file path basename.
 */
function inferAdtName(file: string): string {
  if (!file) {
    throw LiferayErrors.resourceError(
      "ADT requires --file or (--key and --widget-type). Use 'resource adt --display-style ddmTemplate_<ID>' if you need to inspect it first.",
    );
  }
  return path.basename(file, path.extname(file));
}

/**
 * Helper: Check if an ADT exists in a given site.
 * Returns the ADT row if found, null if not found.
 */
async function findAdtInSite(
  config: AppConfig,
  site: string,
  widgetType: string,
  className: string,
  name: string,
  dependencies?: ResourceSyncDependencies,
) {
  const adts = await runLiferayResourceListAdts(
    config,
    {site, widgetType, className, includeScript: true},
    dependencies,
  );
  return adts.find((item) => matchesAdtRow(item, name)) ?? null;
}
