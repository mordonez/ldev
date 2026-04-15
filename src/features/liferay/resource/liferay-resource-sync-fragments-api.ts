import {LiferayErrors} from '../errors/index.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {listFragmentCollections, listFragments} from './liferay-resource-shared.js';
import {postFormCandidates, type ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import type {LocalFragment, LocalFragmentCollection} from './liferay-resource-sync-fragments-types.js';
import {sanitizeFileToken} from './liferay-resource-sync-fragments-local.js';
import {
  toFragmentCollectionPayload,
  toFragmentEntryPayload,
  type FragmentCollectionPayload,
  type FragmentEntryPayload,
} from './liferay-resource-payloads.js';

export type FragmentSyncRuntimeState = {
  collectionsByKey?: Map<string, FragmentCollectionPayload>;
  fragmentsByCollectionId: Map<number, Map<string, FragmentEntryPayload>>;
};

export function createFragmentSyncRuntimeState(): FragmentSyncRuntimeState {
  return {
    fragmentsByCollectionId: new Map(),
  };
}

export async function listRuntimeCollectionsByKey(
  config: AppConfig,
  groupId: number,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<Map<string, FragmentCollectionPayload>> {
  if (runtimeState?.collectionsByKey) {
    return runtimeState.collectionsByKey;
  }

  const collections = await listFragmentCollections(config, groupId, dependencies);
  const byKey = new Map<string, FragmentCollectionPayload>();

  for (const collection of collections) {
    cacheRuntimeCollection(byKey, collection);
  }

  if (runtimeState) {
    runtimeState.collectionsByKey = byKey;
  }

  return byKey;
}

export async function findRuntimeCollection(
  config: AppConfig,
  groupId: number,
  collectionSlug: string,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<FragmentCollectionPayload | null> {
  const byKey = await listRuntimeCollectionsByKey(config, groupId, dependencies, runtimeState);
  return byKey.get(collectionSlug.toLowerCase()) ?? null;
}

export async function listRuntimeFragmentsByKey(
  config: AppConfig,
  fragmentCollectionId: number,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<Map<string, FragmentEntryPayload>> {
  const cached = runtimeState?.fragmentsByCollectionId.get(fragmentCollectionId);
  if (cached) {
    return cached;
  }

  const runtimeFragments = await listFragments(config, fragmentCollectionId, dependencies);
  const byKey = new Map<string, FragmentEntryPayload>();

  for (const runtimeFragment of runtimeFragments) {
    cacheRuntimeFragment(byKey, runtimeFragment);
  }

  if (runtimeState) {
    runtimeState.fragmentsByCollectionId.set(fragmentCollectionId, byKey);
  }

  return byKey;
}

export async function findRuntimeFragment(
  config: AppConfig,
  fragmentCollectionId: number,
  fragmentSlug: string,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<FragmentEntryPayload | null> {
  const byKey = await listRuntimeFragmentsByKey(config, fragmentCollectionId, dependencies, runtimeState);
  return byKey.get(fragmentSlug.toLowerCase()) ?? null;
}

export async function createFragmentCollection(
  config: AppConfig,
  groupId: number,
  collection: LocalFragmentCollection,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<FragmentCollectionPayload> {
  const base = {
    groupId: String(groupId),
    name: collection.name,
    description: collection.description,
  };

  const response = await postFormCandidates<FragmentCollectionPayload>(
    config,
    '/api/jsonws/fragment.fragmentcollection/add-fragment-collection',
    [
      {
        ...base,
        fragmentCollectionKey: collection.slug,
        serviceContext: '{}',
      },
      {
        ...base,
        fragmentCollectionKey: collection.slug,
      },
      {
        ...base,
        serviceContext: '{}',
      },
    ],
    'fragment-collection-create',
    dependencies,
  );

  const payload = toFragmentCollectionPayload({
    ...response,
    fragmentCollectionKey: collection.slug,
    name: collection.name,
    description: collection.description,
  });
  cacheRuntimeCollection(ensureCollectionRuntimeCache(runtimeState), payload);
  return payload;
}

export async function updateFragmentCollection(
  config: AppConfig,
  fragmentCollectionId: number,
  collection: LocalFragmentCollection,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<void> {
  if (fragmentCollectionId <= 0) {
    return;
  }

  const base = {
    fragmentCollectionId: String(fragmentCollectionId),
    name: collection.name,
    description: collection.description,
  };

  try {
    await postFormCandidates<FragmentCollectionPayload>(
      config,
      '/api/jsonws/fragment.fragmentcollection/update-fragment-collection',
      [
        base,
        {
          ...base,
          serviceContext: '{}',
        },
      ],
      'fragment-collection-update',
      dependencies,
    );
    cacheRuntimeCollection(ensureCollectionRuntimeCache(runtimeState), {
      fragmentCollectionId,
      fragmentCollectionKey: collection.slug,
      name: collection.name,
      description: collection.description,
    });
  } catch {
    // Legacy command ignored collection metadata update failures.
  }
}

export async function createFragmentEntry(
  config: AppConfig,
  groupId: number,
  fragmentCollectionId: number,
  fragment: LocalFragment,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<FragmentEntryPayload> {
  const base = fragmentEntryBaseForm(groupId, fragmentCollectionId, fragment);

  const response = await postFormCandidates<FragmentEntryPayload>(
    config,
    '/api/jsonws/fragment.fragmententry/add-fragment-entry',
    [
      {
        ...base,
        serviceContext: '{}',
        cacheable: 'false',
        readOnly: 'false',
        typeOptions: '{}',
      },
      base,
    ],
    'fragment-entry-create',
    dependencies,
  );

  const payload = toFragmentEntryPayload({
    ...response,
    fragmentEntryKey: fragment.slug,
    name: fragment.name,
  });
  cacheFragmentInRuntimeState(runtimeState, fragmentCollectionId, payload);
  return payload;
}

export async function updateFragmentEntry(
  config: AppConfig,
  groupId: number,
  fragmentCollectionId: number,
  fragmentEntryId: number,
  fragment: LocalFragment,
  dependencies?: ResourceSyncDependencies,
  runtimeState?: FragmentSyncRuntimeState,
): Promise<FragmentEntryPayload> {
  if (fragmentEntryId <= 0) {
    throw LiferayErrors.resourceError(`fragmentEntryId invalido para ${fragment.slug}`);
  }

  const base = {
    groupId: String(groupId),
    fragmentCollectionId: String(fragmentCollectionId),
    fragmentEntryKey: fragment.slug,
    fragmentEntryId: String(fragmentEntryId),
    name: fragment.name,
    css: fragment.css,
    html: fragment.html,
    js: fragment.js,
    configuration: fragment.configuration,
    icon: fragment.icon,
    type: String(fragment.type),
  };

  const response = await postFormCandidates<FragmentEntryPayload>(
    config,
    '/api/jsonws/fragment.fragmententry/update-fragment-entry',
    [
      {
        ...base,
        serviceContext: '{}',
        cacheable: 'false',
        readOnly: 'false',
      },
      base,
    ],
    'fragment-entry-update',
    dependencies,
  );

  const payload = toFragmentEntryPayload({
    ...response,
    fragmentEntryId,
    fragmentEntryKey: fragment.slug,
    name: fragment.name,
  });
  cacheFragmentInRuntimeState(runtimeState, fragmentCollectionId, payload);
  return payload;
}

function cacheRuntimeCollection(
  byKey: Map<string, FragmentCollectionPayload> | undefined,
  collection: FragmentCollectionPayload,
): void {
  if (!byKey) {
    return;
  }

  const key = String(collection.fragmentCollectionKey ?? '').trim();
  const name = String(collection.name ?? '').trim();
  if (key !== '') {
    byKey.set(key.toLowerCase(), collection);
  }
  if (name !== '') {
    byKey.set(sanitizeFileToken(name).toLowerCase(), collection);
  }
}

function ensureCollectionRuntimeCache(
  runtimeState: FragmentSyncRuntimeState | undefined,
): Map<string, FragmentCollectionPayload> | undefined {
  if (!runtimeState) {
    return undefined;
  }

  runtimeState.collectionsByKey ??= new Map<string, FragmentCollectionPayload>();
  return runtimeState.collectionsByKey;
}

function cacheFragmentInRuntimeState(
  runtimeState: FragmentSyncRuntimeState | undefined,
  fragmentCollectionId: number,
  fragment: FragmentEntryPayload,
): void {
  if (!runtimeState) {
    return;
  }

  const byKey =
    runtimeState.fragmentsByCollectionId.get(fragmentCollectionId) ?? new Map<string, FragmentEntryPayload>();
  cacheRuntimeFragment(byKey, fragment);
  runtimeState.fragmentsByCollectionId.set(fragmentCollectionId, byKey);
}

function cacheRuntimeFragment(byKey: Map<string, FragmentEntryPayload>, fragment: FragmentEntryPayload): void {
  const runtimeKey = String(fragment.fragmentEntryKey ?? '').trim();
  const runtimeName = String(fragment.name ?? '').trim();
  if (runtimeKey !== '') {
    byKey.set(runtimeKey.toLowerCase(), fragment);
  }
  if (runtimeName !== '') {
    byKey.set(sanitizeFileToken(runtimeName).toLowerCase(), fragment);
  }
}

function fragmentEntryBaseForm(
  groupId: number,
  fragmentCollectionId: number,
  fragment: LocalFragment,
): Record<string, string> {
  return {
    groupId: String(groupId),
    fragmentCollectionId: String(fragmentCollectionId),
    fragmentEntryKey: fragment.slug,
    name: fragment.name,
    css: fragment.css,
    html: fragment.html,
    js: fragment.js,
    configuration: fragment.configuration,
    icon: fragment.icon,
    type: String(fragment.type),
  };
}
