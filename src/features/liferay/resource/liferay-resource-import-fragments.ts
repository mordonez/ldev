import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResolvedSite} from '../portal/site-resolution.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {resolveSiteToken} from '../portal/artifact-paths.js';
import {resolveResourceSite} from './liferay-resource-shared.js';
import {
  readLocalFragmentsProject,
  resolveFragmentsProjectDir,
  toErrorMessage,
} from './liferay-resource-import-fragments-local.js';
import {createFragmentSyncRuntimeState} from './liferay-resource-import-fragments-api.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import type {
  LiferayResourceImportFragmentItemResult,
  LiferayResourceImportFragmentsAllSitesResult,
  LiferayResourceImportFragmentsResult,
  LiferayResourceImportFragmentsSingleResult,
  LocalFragment,
  LocalFragmentCollection,
} from './liferay-resource-import-fragments-types.js';
import {runImportArtifact} from './import-engine.js';
import {fragmentCollectionImportStrategy} from './import-strategies/fragment-collection-import-strategy.js';
import {fragmentEntryImportStrategy} from './import-strategies/fragment-entry-import-strategy.js';

export type {
  LiferayResourceImportFragmentItemResult,
  LiferayResourceImportFragmentsAllSitesResult,
  LiferayResourceImportFragmentsResult,
  LiferayResourceImportFragmentsSingleResult,
} from './liferay-resource-import-fragments-types.js';

export async function runLiferayResourceImportFragments(
  config: AppConfig,
  options?: {
    site?: string;
    groupId?: string;
    allSites?: boolean;
    dir?: string;
    fragment?: string;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportFragmentsResult> {
  if (options?.allSites && (options.fragment?.trim() ?? '') !== '') {
    throw LiferayErrors.resourceError('--fragment requires --site or --site-id');
  }

  if (options?.allSites) {
    return runAllSitesImport(config, options.dir, dependencies);
  }

  const site = options?.groupId?.trim()
    ? await resolveResourceSite(config, options.groupId, dependencies)
    : await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const projectDir = resolveFragmentsProjectDir(config, options?.dir, resolveSiteToken(site.friendlyUrlPath));

  return runFragmentsImport(config, site.id, site.friendlyUrlPath, projectDir, options?.fragment ?? '', dependencies);
}

export function formatLiferayResourceImportFragments(result: LiferayResourceImportFragmentsResult): string {
  if (result.mode === 'all-sites') {
    return `sites=${result.sites} imported=${result.imported} errors=${result.errors} mode=all-sites`;
  }

  return `imported=${result.summary.importedFragments} errors=${result.summary.errors}`;
}

export function getLiferayResourceImportFragmentsExitCode(result: LiferayResourceImportFragmentsResult): number {
  return result.mode === 'all-sites' ? (result.errors > 0 ? 1 : 0) : result.summary.errors > 0 ? 1 : 0;
}

async function runAllSitesImport(
  config: AppConfig,
  dir: string | undefined,
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportFragmentsAllSitesResult> {
  const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
  const siteResults: LiferayResourceImportFragmentsSingleResult[] = [];
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
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportFragmentsSingleResult> {
  const project = await readLocalFragmentsProject(projectDir, fragmentFilter);
  const site = toResolvedSite(groupId, siteFriendlyUrl);
  const runtimeState = createFragmentSyncRuntimeState();
  let imported = 0;
  let errors = 0;
  const fragmentResults: LiferayResourceImportFragmentItemResult[] = [];

  for (const localCollection of project.collections) {
    try {
      const collectionId = await syncFragmentCollection(config, site, localCollection, runtimeState, dependencies);
      if (!Number.isFinite(collectionId) || collectionId <= 0) {
        throw LiferayErrors.resourceError(`fragmentCollectionId invalido para ${localCollection.slug}`);
      }

      for (const localFragment of localCollection.fragments) {
        try {
          const syncedFragmentId = await syncFragmentEntry(
            config,
            site,
            collectionId,
            localFragment,
            runtimeState,
            dependencies,
          );

          fragmentResults.push({
            collection: localCollection.slug,
            fragment: localFragment.slug,
            status: 'imported',
            fragmentEntryId: syncedFragmentId,
          });
          imported += 1;
        } catch (error) {
          fragmentResults.push({
            collection: localCollection.slug,
            fragment: localFragment.slug,
            status: 'error',
            error: toErrorMessage(error),
          });
          errors += 1;
        }
      }
    } catch (error) {
      for (const localFragment of localCollection.fragments) {
        fragmentResults.push({
          collection: localCollection.slug,
          fragment: localFragment.slug,
          status: 'error',
          error: toErrorMessage(error),
        });
        errors += 1;
      }
    }
  }

  return {
    mode: 'oauth-jsonws-import',
    site: siteFriendlyUrl,
    siteId: groupId,
    projectDir,
    summary: {
      importedFragments: imported,
      fragmentResults: fragmentResults.length,
      pageTemplateResults: 0,
      errors,
    },
    fragmentResults,
    pageTemplateResults: [],
  };
}

async function syncFragmentCollection(
  config: AppConfig,
  site: ResolvedSite,
  collection: LocalFragmentCollection,
  runtimeState: ReturnType<typeof createFragmentSyncRuntimeState>,
  dependencies?: ResourceDependencies,
): Promise<number> {
  const result = await runImportArtifact(
    config,
    site,
    fragmentCollectionImportStrategy,
    {
      createMissing: true,
      strategyOptions: {collection, runtimeState},
    },
    dependencies,
  );

  return Number(result.id);
}

async function syncFragmentEntry(
  config: AppConfig,
  site: ResolvedSite,
  collectionId: number,
  fragment: LocalFragment,
  runtimeState: ReturnType<typeof createFragmentSyncRuntimeState>,
  dependencies?: ResourceDependencies,
): Promise<number> {
  const result = await runImportArtifact(
    config,
    site,
    fragmentEntryImportStrategy,
    {
      createMissing: true,
      strategyOptions: {collectionId, fragment, runtimeState},
    },
    dependencies,
  );

  const fragmentEntryId = Number(result.id);
  return Number.isFinite(fragmentEntryId) ? fragmentEntryId : -1;
}

function toResolvedSite(groupId: number, siteFriendlyUrl: string): ResolvedSite {
  return {id: groupId, friendlyUrlPath: siteFriendlyUrl, name: siteFriendlyUrl};
}
