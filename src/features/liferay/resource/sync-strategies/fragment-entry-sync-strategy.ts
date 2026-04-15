import type {AppConfig} from '../../../../core/config/load-config.js';
import {LiferayErrors} from '../../errors/index.js';
import type {ResolvedSite} from '../../inventory/liferay-site-resolver.js';
import type {FragmentEntryPayload} from '../liferay-resource-payloads.js';
import {
  createFragmentEntry,
  findRuntimeFragment,
  updateFragmentEntry,
  type FragmentSyncRuntimeState,
} from '../liferay-resource-sync-fragments-api.js';
import {canVerifyFragmentEntryContent, normalizeFragmentEntryForHash} from '../liferay-resource-sync-fragments-hash.js';
import type {LocalFragment} from '../liferay-resource-sync-fragments-types.js';
import {sha256, type ResourceSyncDependencies} from '../liferay-resource-sync-shared.js';
import type {LocalArtifact, RemoteArtifact, SyncStrategy} from '../sync-engine.js';

type FragmentEntryLocalData = {
  collectionId: number;
  fragment: LocalFragment;
};

type FragmentEntryRemoteData = FragmentEntryPayload & {
  collectionId: number;
};

type FragmentEntrySyncOptions = {
  collectionId: number;
  fragment: LocalFragment;
  runtimeState: FragmentSyncRuntimeState;
};

export const fragmentEntrySyncStrategy: SyncStrategy<FragmentEntryLocalData, FragmentEntryRemoteData> = {
  async resolveLocal(
    _config: AppConfig,
    _site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<FragmentEntryLocalData>> {
    const opts = options as FragmentEntrySyncOptions;
    const normalizedContent = normalizeFragmentEntryForHash(opts.fragment);

    return {
      id: opts.fragment.slug,
      normalizedContent,
      contentHash: sha256(normalizedContent),
      data: {
        collectionId: opts.collectionId,
        fragment: opts.fragment,
      },
    };
  },

  async findRemote(
    config: AppConfig,
    _site: ResolvedSite,
    localArtifact: LocalArtifact<FragmentEntryLocalData>,
    options: Record<string, unknown>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<FragmentEntryRemoteData> | null> {
    const opts = options as FragmentEntrySyncOptions;
    const runtimeFragment = await findRuntimeFragment(
      config,
      opts.collectionId,
      localArtifact.id,
      dependencies,
      opts.runtimeState,
    );

    if (!runtimeFragment) {
      return null;
    }

    return {
      id: String(runtimeFragment.fragmentEntryId ?? ''),
      name: localArtifact.id,
      data: {
        ...runtimeFragment,
        collectionId: opts.collectionId,
      },
    };
  },

  async upsert(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<FragmentEntryLocalData>,
    remoteArtifact: RemoteArtifact<FragmentEntryRemoteData> | null,
    options: Record<string, unknown>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<FragmentEntryRemoteData>> {
    const opts = options as FragmentEntrySyncOptions;

    if (!remoteArtifact) {
      const created = await createFragmentEntry(
        config,
        site.id,
        opts.collectionId,
        localArtifact.data.fragment,
        dependencies,
        opts.runtimeState,
      );

      return {
        id: String(created.fragmentEntryId ?? ''),
        name: localArtifact.id,
        data: {
          ...created,
          collectionId: opts.collectionId,
        },
      };
    }

    const fragmentEntryId = Number(remoteArtifact.data.fragmentEntryId ?? -1);
    const updated = await updateFragmentEntry(
      config,
      site.id,
      opts.collectionId,
      fragmentEntryId,
      localArtifact.data.fragment,
      dependencies,
      opts.runtimeState,
    );

    return {
      id: String(updated.fragmentEntryId ?? fragmentEntryId),
      name: localArtifact.id,
      data: {
        ...updated,
        collectionId: opts.collectionId,
      },
    };
  },

  async verify(
    _config: AppConfig,
    _site: ResolvedSite,
    localArtifact: LocalArtifact<FragmentEntryLocalData>,
    remoteArtifact: RemoteArtifact<FragmentEntryRemoteData>,
  ): Promise<void> {
    if (!canVerifyFragmentEntryContent(remoteArtifact.data)) {
      return;
    }

    const runtimeHash = sha256(normalizeFragmentEntryForHash(remoteArtifact.data));
    if (runtimeHash !== localArtifact.contentHash) {
      throw LiferayErrors.resourceError(`Hash mismatch fragment '${remoteArtifact.name}'`);
    }
  },
};
