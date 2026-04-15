import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {
  createFragmentCollection,
  createFragmentEntry,
  listRuntimeCollectionsByKey,
  listRuntimeFragmentsByKey,
  updateFragmentCollection,
  updateFragmentEntry,
} from './liferay-resource-sync-fragments-api.js';
import {toErrorMessage} from './liferay-resource-sync-fragments-local.js';
import type {
  LiferayResourceSyncFragmentItemResult,
  LiferayResourceSyncFragmentsSingleResult,
  LocalFragmentsProject,
} from './liferay-resource-sync-fragments-types.js';

export async function runFragmentsImportLegacy(
  config: AppConfig,
  groupId: number,
  siteFriendlyUrl: string,
  projectDir: string,
  project: LocalFragmentsProject,
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsSingleResult> {
  const collectionByKey = await listRuntimeCollectionsByKey(config, groupId, dependencies);

  let imported = 0;
  let errors = 0;
  const fragmentResults: LiferayResourceSyncFragmentItemResult[] = [];

  for (const localCollection of project.collections) {
    try {
      let runtimeCollection = collectionByKey.get(localCollection.slug.toLowerCase());
      if (!runtimeCollection) {
        runtimeCollection = await createFragmentCollection(config, groupId, localCollection, dependencies);
        collectionByKey.set(localCollection.slug.toLowerCase(), runtimeCollection);
      } else {
        await updateFragmentCollection(
          config,
          Number(runtimeCollection.fragmentCollectionId ?? -1),
          localCollection,
          dependencies,
        );
      }

      const collectionId = Number(runtimeCollection.fragmentCollectionId ?? -1);
      if (collectionId <= 0) {
        throw LiferayErrors.resourceError(`fragmentCollectionId invalido para ${localCollection.slug}`);
      }

      const runtimeByKey = await listRuntimeFragmentsByKey(config, collectionId, dependencies);

      for (const localFragment of localCollection.fragments) {
        try {
          const runtimeFragment = runtimeByKey.get(localFragment.slug.toLowerCase());
          const syncedFragment = runtimeFragment
            ? await updateFragmentEntry(
                config,
                groupId,
                collectionId,
                Number(runtimeFragment.fragmentEntryId ?? -1),
                localFragment,
                dependencies,
              )
            : await createFragmentEntry(config, groupId, collectionId, localFragment, dependencies);

          fragmentResults.push({
            collection: localCollection.slug,
            fragment: localFragment.slug,
            status: 'imported',
            fragmentEntryId: Number(syncedFragment.fragmentEntryId ?? -1),
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
