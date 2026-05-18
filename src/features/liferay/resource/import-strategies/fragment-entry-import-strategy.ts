import type {AppConfig} from '../../../../core/config/load-config.js';
import {LiferayErrors} from '../../errors/index.js';
import type {ResolvedSite} from '../../portal/site-resolution.js';
import type {FragmentEntryPayload} from '../liferay-resource-payloads.js';
import {
  createFragmentEntry,
  findRuntimeFragment,
  updateFragmentEntry,
  type FragmentSyncRuntimeState,
} from '../liferay-resource-import-fragments-api.js';
import {
  canVerifyFragmentEntryContent,
  normalizeFragmentEntryForHash,
} from '../liferay-resource-import-fragments-hash.js';
import type {LocalFragment} from '../liferay-resource-import-fragments-types.js';
import {sha256, type ResourceImportDependencies} from '../liferay-resource-artifact-shared.js';
import type {LocalArtifact, RemoteArtifact, ImportStrategy} from '../import-engine.js';

type FragmentEntryLocalData = {
  collectionId: number;
  fragment: LocalFragment;
};

type FragmentEntryRemoteData = FragmentEntryPayload & {
  collectionId: number;
};

type FragmentEntryImportOptions = {
  collectionId: number;
  fragment: LocalFragment;
  runtimeState: FragmentSyncRuntimeState;
};

export const fragmentEntryImportStrategy: ImportStrategy<FragmentEntryLocalData, FragmentEntryRemoteData> = {
  resolveLocal(
    _config: AppConfig,
    _site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<FragmentEntryLocalData>> {
    const opts = options as FragmentEntryImportOptions;
    const normalizedContent = normalizeFragmentEntryForHash(opts.fragment);

    return Promise.resolve({
      id: opts.fragment.slug,
      normalizedContent,
      contentHash: sha256(normalizedContent),
      data: {
        collectionId: opts.collectionId,
        fragment: opts.fragment,
      },
    });
  },

  async findRemote(
    config: AppConfig,
    _site: ResolvedSite,
    localArtifact: LocalArtifact<FragmentEntryLocalData>,
    options: Record<string, unknown>,
    dependencies?: ResourceImportDependencies,
  ): Promise<RemoteArtifact<FragmentEntryRemoteData> | null> {
    const opts = options as FragmentEntryImportOptions;
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
    dependencies?: ResourceImportDependencies,
  ): Promise<RemoteArtifact<FragmentEntryRemoteData>> {
    const opts = options as FragmentEntryImportOptions;

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

  verify(
    _config: AppConfig,
    _site: ResolvedSite,
    localArtifact: LocalArtifact<FragmentEntryLocalData>,
    remoteArtifact: RemoteArtifact<FragmentEntryRemoteData>,
  ): Promise<void> {
    if (!canVerifyFragmentEntryContent(remoteArtifact.data)) {
      return Promise.resolve();
    }

    const runtimeHash = sha256(normalizeFragmentEntryForHash(remoteArtifact.data));
    if (runtimeHash !== localArtifact.contentHash) {
      return Promise.reject(
        LiferayErrors.resourceError(
          `Fragment read-back mismatch after import for '${remoteArtifact.name}': runtime content does not match local fragment source. This is not a local checksum file, hidden ldev cache, or force-import problem; verify the active fragment source directory, fragment key, site, and Liferay-normalized html/css/js/configuration.`,
        ),
      );
    }

    return Promise.resolve();
  },
};
