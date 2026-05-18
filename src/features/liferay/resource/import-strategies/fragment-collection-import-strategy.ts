import type {AppConfig} from '../../../../core/config/load-config.js';
import type {ResolvedSite} from '../../portal/site-resolution.js';
import type {FragmentCollectionPayload} from '../liferay-resource-payloads.js';
import {
  createFragmentCollection,
  findRuntimeCollection,
  updateFragmentCollection,
  type FragmentSyncRuntimeState,
} from '../liferay-resource-import-fragments-api.js';
import {normalizeFragmentCollectionForHash} from '../liferay-resource-import-fragments-hash.js';
import type {LocalFragmentCollection} from '../liferay-resource-import-fragments-types.js';
import {sha256, type ResourceImportDependencies} from '../liferay-resource-artifact-shared.js';
import type {LocalArtifact, RemoteArtifact, ImportStrategy} from '../import-engine.js';

type FragmentCollectionLocalData = {
  collection: LocalFragmentCollection;
};

type FragmentCollectionRemoteData = FragmentCollectionPayload;

type FragmentCollectionImportOptions = {
  collection: LocalFragmentCollection;
  runtimeState: FragmentSyncRuntimeState;
};

export const fragmentCollectionImportStrategy: ImportStrategy<
  FragmentCollectionLocalData,
  FragmentCollectionRemoteData
> = {
  resolveLocal(
    _config: AppConfig,
    _site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<FragmentCollectionLocalData>> {
    const opts = options as FragmentCollectionImportOptions;
    const normalizedContent = normalizeFragmentCollectionForHash(opts.collection);

    return Promise.resolve({
      id: opts.collection.slug,
      normalizedContent,
      contentHash: sha256(normalizedContent),
      data: {collection: opts.collection},
    });
  },

  async findRemote(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<FragmentCollectionLocalData>,
    options: Record<string, unknown>,
    dependencies?: ResourceImportDependencies,
  ): Promise<RemoteArtifact<FragmentCollectionRemoteData> | null> {
    const opts = options as FragmentCollectionImportOptions;
    const runtimeCollection = await findRuntimeCollection(
      config,
      site.id,
      localArtifact.id,
      dependencies,
      opts.runtimeState,
    );

    if (!runtimeCollection) {
      return null;
    }

    return {
      id: String(runtimeCollection.fragmentCollectionId ?? ''),
      name: localArtifact.id,
      data: runtimeCollection,
    };
  },

  async upsert(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<FragmentCollectionLocalData>,
    remoteArtifact: RemoteArtifact<FragmentCollectionRemoteData> | null,
    options: Record<string, unknown>,
    dependencies?: ResourceImportDependencies,
  ): Promise<RemoteArtifact<FragmentCollectionRemoteData>> {
    const opts = options as FragmentCollectionImportOptions;

    if (!remoteArtifact) {
      const created = await createFragmentCollection(
        config,
        site.id,
        localArtifact.data.collection,
        dependencies,
        opts.runtimeState,
      );

      return {
        id: String(created.fragmentCollectionId ?? ''),
        name: localArtifact.id,
        data: created,
      };
    }

    await updateFragmentCollection(
      config,
      Number(remoteArtifact.data.fragmentCollectionId ?? -1),
      localArtifact.data.collection,
      dependencies,
      opts.runtimeState,
    );

    return remoteArtifact;
  },

  async verify(): Promise<void> {
    // Collection metadata updates remain best-effort for backward compatibility.
  },
};
