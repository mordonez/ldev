import type {AppConfig} from '../../../../core/config/load-config.js';
import type {ResolvedSite} from '../../portal/site-resolution.js';
import type {FragmentCollectionPayload} from '../liferay-resource-payloads.js';
import {
  createFragmentCollection,
  findRuntimeCollection,
  updateFragmentCollection,
  type FragmentSyncRuntimeState,
} from '../liferay-resource-sync-fragments-api.js';
import {normalizeFragmentCollectionForHash} from '../liferay-resource-sync-fragments-hash.js';
import type {LocalFragmentCollection} from '../liferay-resource-sync-fragments-types.js';
import {sha256, type ResourceSyncDependencies} from '../liferay-resource-sync-shared.js';
import type {LocalArtifact, RemoteArtifact, SyncStrategy} from '../sync-engine.js';

type FragmentCollectionLocalData = {
  collection: LocalFragmentCollection;
};

type FragmentCollectionRemoteData = FragmentCollectionPayload;

type FragmentCollectionSyncOptions = {
  collection: LocalFragmentCollection;
  runtimeState: FragmentSyncRuntimeState;
};

export const fragmentCollectionSyncStrategy: SyncStrategy<FragmentCollectionLocalData, FragmentCollectionRemoteData> = {
  resolveLocal(
    _config: AppConfig,
    _site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<FragmentCollectionLocalData>> {
    const opts = options as FragmentCollectionSyncOptions;
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
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<FragmentCollectionRemoteData> | null> {
    const opts = options as FragmentCollectionSyncOptions;
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
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<FragmentCollectionRemoteData>> {
    const opts = options as FragmentCollectionSyncOptions;

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
