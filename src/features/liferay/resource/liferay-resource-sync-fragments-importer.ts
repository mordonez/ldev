import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResolvedSite} from '../inventory/liferay-site-resolver.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {createFragmentSyncRuntimeState} from './liferay-resource-sync-fragments-api.js';
import {toErrorMessage} from './liferay-resource-sync-fragments-local.js';
import type {
  LiferayResourceSyncFragmentItemResult,
  LiferayResourceSyncFragmentsSingleResult,
  LocalFragment,
  LocalFragmentCollection,
  LocalFragmentsProject,
} from './liferay-resource-sync-fragments-types.js';
import {syncArtifact} from './sync-engine.js';
import {fragmentCollectionSyncStrategy} from './sync-strategies/fragment-collection-sync-strategy.js';
import {fragmentEntrySyncStrategy} from './sync-strategies/fragment-entry-sync-strategy.js';

export async function runFragmentsImport(
  config: AppConfig,
  groupId: number,
  siteFriendlyUrl: string,
  projectDir: string,
  project: LocalFragmentsProject,
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsSingleResult> {
  const site = toResolvedSite(groupId, siteFriendlyUrl);
  const runtimeState = createFragmentSyncRuntimeState();
  let imported = 0;
  let errors = 0;
  const fragmentResults: LiferayResourceSyncFragmentItemResult[] = [];

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

export const runFragmentsImportLegacy = runFragmentsImport;

async function syncFragmentCollection(
  config: AppConfig,
  site: ResolvedSite,
  collection: LocalFragmentCollection,
  runtimeState: ReturnType<typeof createFragmentSyncRuntimeState>,
  dependencies?: ResourceSyncDependencies,
): Promise<number> {
  const result = await syncArtifact(
    config,
    site,
    fragmentCollectionSyncStrategy,
    {
      createMissing: true,
      strategyOptions: {
        collection,
        runtimeState,
      },
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
  dependencies?: ResourceSyncDependencies,
): Promise<number> {
  const result = await syncArtifact(
    config,
    site,
    fragmentEntrySyncStrategy,
    {
      createMissing: true,
      strategyOptions: {
        collectionId,
        fragment,
        runtimeState,
      },
    },
    dependencies,
  );

  const fragmentEntryId = Number(result.id);
  return Number.isFinite(fragmentEntryId) ? fragmentEntryId : -1;
}

function toResolvedSite(groupId: number, siteFriendlyUrl: string): ResolvedSite {
  return {
    id: groupId,
    friendlyUrlPath: siteFriendlyUrl,
    name: siteFriendlyUrl,
  };
}
