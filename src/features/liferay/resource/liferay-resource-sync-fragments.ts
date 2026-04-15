import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {resolveSiteToken} from './liferay-resource-paths.js';
import {resolveResourceSite} from './liferay-resource-shared.js';
import {readLocalFragmentsProject, resolveFragmentsProjectDir} from './liferay-resource-sync-fragments-local.js';
import {runFragmentsImportLegacy} from './liferay-resource-sync-fragments-importer.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import type {
  LiferayResourceSyncFragmentsAllSitesResult,
  LiferayResourceSyncFragmentsResult,
  LiferayResourceSyncFragmentsSingleResult,
} from './liferay-resource-sync-fragments-types.js';

export type {
  LiferayResourceSyncFragmentItemResult,
  LiferayResourceSyncFragmentsAllSitesResult,
  LiferayResourceSyncFragmentsResult,
  LiferayResourceSyncFragmentsSingleResult,
} from './liferay-resource-sync-fragments-types.js';

export async function runLiferayResourceSyncFragments(
  config: AppConfig,
  options?: {
    site?: string;
    groupId?: string;
    allSites?: boolean;
    dir?: string;
    fragment?: string;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsResult> {
  if (options?.allSites && (options?.fragment ?? '').trim() !== '') {
    throw LiferayErrors.resourceError('--fragment requires --site or --site-id');
  }

  if (options?.allSites) {
    return runAllSitesImport(config, options?.dir, dependencies);
  }

  const site = options?.groupId?.trim()
    ? await resolveResourceSite(config, options.groupId, dependencies)
    : await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const projectDir = resolveFragmentsProjectDir(config, options?.dir, resolveSiteToken(site.friendlyUrlPath));

  return runFragmentsImport(config, site.id, site.friendlyUrlPath, projectDir, options?.fragment ?? '', dependencies);
}

export function formatLiferayResourceSyncFragments(result: LiferayResourceSyncFragmentsResult): string {
  if (result.mode === 'all-sites') {
    return `sites=${result.sites} imported=${result.imported} errors=${result.errors} mode=all-sites`;
  }

  return `imported=${result.summary.importedFragments} errors=${result.summary.errors}`;
}

export function getLiferayResourceSyncFragmentsExitCode(result: LiferayResourceSyncFragmentsResult): number {
  return result.mode === 'all-sites' ? (result.errors > 0 ? 1 : 0) : result.summary.errors > 0 ? 1 : 0;
}

async function runAllSitesImport(
  config: AppConfig,
  dir: string | undefined,
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsAllSitesResult> {
  const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
  const siteResults: LiferayResourceSyncFragmentsSingleResult[] = [];
  let imported = 0;
  let errors = 0;

  for (const site of sites) {
    const projectDir = resolveFragmentsProjectDir(config, dir, resolveSiteToken(site.siteFriendlyUrl));
    if (!(await fs.pathExists(projectDir + '/src'))) {
      continue;
    }

    const siteResult = await runFragmentsImport(
      config,
      site.groupId,
      site.siteFriendlyUrl,
      projectDir,
      '',
      dependencies,
    );
    siteResults.push(siteResult);
    imported += siteResult.summary.importedFragments;
    errors += siteResult.summary.errors;
  }

  return {
    mode: 'all-sites',
    sites: siteResults.length,
    imported,
    errors,
    siteResults,
  };
}

async function runFragmentsImport(
  config: AppConfig,
  groupId: number,
  siteFriendlyUrl: string,
  projectDir: string,
  fragmentFilter: string,
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsSingleResult> {
  const project = await readLocalFragmentsProject(projectDir, fragmentFilter);
  return runFragmentsImportLegacy(config, groupId, siteFriendlyUrl, projectDir, project, dependencies);
}
