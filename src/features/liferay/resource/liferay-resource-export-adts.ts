import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {runLiferayResourceListAdts} from './liferay-resource-list-adts.js';
import {
  resolveAdtsBaseDir,
  resolveRepoPath,
  resolveSiteToken,
  ADT_WIDGET_DIR_BY_TYPE,
} from './liferay-resource-paths.js';
import {resolveResourceSite} from './liferay-resource-shared.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceExportAdtsResult = {
  mode?: 'all-sites';
  site: string;
  siteToken: string;
  exported: number;
  failed: number;
  outputDir: string;
  scannedSites?: number;
  siteResults?: LiferayResourceExportAdtsResult[];
};

export async function runLiferayResourceExportAdts(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    widgetType?: string;
    className?: string;
    key?: string;
    name?: string;
    continueOnError?: boolean;
    allSites?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportAdtsResult> {
  const baseDir = path.resolve(
    options?.dir?.trim() ? resolveRepoPath(config, options.dir) : resolveAdtsBaseDir(config),
  );

  if (options?.allSites) {
    const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
    const siteResults: LiferayResourceExportAdtsResult[] = [];
    let exported = 0;
    let failed = 0;

    for (const site of sites) {
      const result = await runLiferayResourceExportAdts(
        config,
        {
          site: site.siteFriendlyUrl,
          dir: options.dir,
          widgetType: options.widgetType,
          className: options.className,
          key: options.key,
          name: options.name,
          continueOnError: options.continueOnError,
        },
        dependencies,
      );
      siteResults.push(result);
      exported += result.exported;
      failed += result.failed;
    }

    return {
      mode: 'all-sites',
      site: 'all-sites',
      siteToken: 'all-sites',
      exported,
      failed,
      outputDir: baseDir,
      scannedSites: siteResults.length,
      siteResults,
    };
  }

  const site = await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const siteToken = resolveSiteToken(site.friendlyUrlPath);
  const outputDir = path.join(baseDir, siteToken);
  const rows = await runLiferayResourceListAdts(
    config,
    {
      site: site.friendlyUrlPath,
      widgetType: options?.widgetType,
      className: options?.className,
      includeScript: true,
    },
    dependencies,
  );
  const filteredRows = rows.filter((row) => {
    if (options?.key && row.templateKey !== options.key) {
      return false;
    }
    if (options?.name && ![row.adtName, row.displayName].includes(options.name)) {
      return false;
    }
    return true;
  });

  let exported = 0;
  let failed = 0;

  for (const row of filteredRows) {
    try {
      const widgetDir = ADT_WIDGET_DIR_BY_TYPE[row.widgetType];
      const target = path.join(
        outputDir,
        widgetDir ?? row.widgetType.replaceAll('-', '_'),
        `${sanitizeFileToken(row.templateKey || row.adtName)}.ftl`,
      );
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, `${row.script ?? ''}`);
      exported += 1;
    } catch (error) {
      failed += 1;
      if (!options?.continueOnError) {
        throw error;
      }
    }
  }

  if (exported === 0 && failed === 0 && (await fs.pathExists(outputDir))) {
    await fs.remove(outputDir);
  }

  return {
    site: site.friendlyUrlPath,
    siteToken,
    exported,
    failed,
    outputDir,
  };
}

export function formatLiferayResourceExportAdts(result: LiferayResourceExportAdtsResult): string {
  if (result.mode === 'all-sites') {
    return `EXPORTED mode=all-sites scanned=${result.scannedSites ?? 0} exported=${result.exported} failed=${result.failed} dir=${result.outputDir}`;
  }

  return `EXPORTED site=${result.site} exported=${result.exported} failed=${result.failed} dir=${result.outputDir}`;
}

function sanitizeFileToken(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9_.-]+/g, '_')
    .replaceAll(/_+/g, '_');
  return normalized === '' ? 'unnamed' : normalized;
}
