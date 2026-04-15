import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {runLiferayInventoryStructures} from '../inventory/liferay-inventory-structures.js';
import {runLiferayResourceGetStructure} from './liferay-resource-get-structure.js';
import {writeLiferayResourceFile} from './liferay-resource-export-shared.js';
import {resolveSiteToken} from './liferay-resource-paths.js';
import {resolveArtifactSiteDir} from './artifact-paths.js';
import {normalizeLiferayStructurePayload} from './liferay-resource-structure-normalize.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceExportStructuresSiteResult = {
  site: string;
  siteToken: string;
  outputDir: string;
  processed: number;
  diffs: number;
};

export type LiferayResourceExportStructuresResult = {
  mode: 'single-site' | 'all-sites';
  checkOnly: boolean;
  scannedSites: number;
  processed: number;
  diffs: number;
  siteResults: LiferayResourceExportStructuresSiteResult[];
};

export async function runLiferayResourceExportStructures(
  config: AppConfig,
  options?: {site?: string; dir?: string; allSites?: boolean; checkOnly?: boolean},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportStructuresResult> {
  if (options?.allSites) {
    const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
    const siteResults: LiferayResourceExportStructuresSiteResult[] = [];
    let processed = 0;
    let diffs = 0;

    for (const site of sites) {
      const result = await exportStructuresForSite(
        config,
        site.siteFriendlyUrl,
        options?.dir,
        Boolean(options?.checkOnly),
        dependencies,
      );
      siteResults.push(result);
      processed += result.processed;
      diffs += result.diffs;
    }

    return {
      mode: 'all-sites',
      checkOnly: Boolean(options?.checkOnly),
      scannedSites: siteResults.length,
      processed,
      diffs,
      siteResults,
    };
  }

  const result = await exportStructuresForSite(
    config,
    options?.site ?? '/global',
    options?.dir,
    Boolean(options?.checkOnly),
    dependencies,
  );
  return {
    mode: 'single-site',
    checkOnly: Boolean(options?.checkOnly),
    scannedSites: 1,
    processed: result.processed,
    diffs: result.diffs,
    siteResults: [result],
  };
}

export function formatLiferayResourceExportStructures(result: LiferayResourceExportStructuresResult): string {
  if (result.mode === 'all-sites') {
    return result.checkOnly
      ? `CHECK_ONLY mode=all-sites scanned=${result.scannedSites} diffs=${result.diffs}`
      : `EXPORTED mode=all-sites scanned=${result.scannedSites} count=${result.processed}`;
  }

  const site = result.siteResults[0];
  if (!site) {
    return result.checkOnly ? 'CHECK_ONLY site=? diffs=0' : 'EXPORTED site=? count=0';
  }

  return result.checkOnly
    ? `CHECK_ONLY site=${site.site} diffs=${site.diffs}`
    : `EXPORTED site=${site.site} count=${site.processed} dir=${site.outputDir}`;
}

async function exportStructuresForSite(
  config: AppConfig,
  site: string,
  dir: string | undefined,
  checkOnly: boolean,
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportStructuresSiteResult> {
  const rows = await runLiferayInventoryStructures(config, {site}, dependencies);
  const siteToken = resolveSiteToken(site);
  const outputDir = resolveArtifactSiteDir(config, 'structure', siteToken, dir);
  let processed = 0;
  let diffs = 0;

  for (const row of rows) {
    if (!row.key) {
      continue;
    }

    const structure = await runLiferayResourceGetStructure(config, {site, key: row.key}, dependencies);
    const normalizedPayload = normalizeLiferayStructurePayload(structure.raw);
    const filePath = path.join(outputDir, `${row.key}.json`);
    processed += 1;

    if (checkOnly) {
      if (await fileDiffers(filePath, normalizedPayload)) {
        diffs += 1;
      }
      continue;
    }

    await writeLiferayResourceFile(normalizedPayload, filePath, {pretty: true});
  }

  if (!checkOnly && processed === 0 && (await fs.pathExists(outputDir))) {
    await fs.remove(outputDir);
  }

  return {
    site,
    siteToken,
    outputDir,
    processed,
    diffs,
  };
}

async function fileDiffers(filePath: string, payload: unknown): Promise<boolean> {
  if (!(await fs.pathExists(filePath))) {
    return true;
  }

  const current = await fs.readFile(filePath, 'utf8');
  return current !== `${JSON.stringify(payload, null, 2)}\n`;
}
