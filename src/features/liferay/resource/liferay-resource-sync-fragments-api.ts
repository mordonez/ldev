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

export async function listRuntimeCollectionsByKey(
  config: AppConfig,
  groupId: number,
  dependencies?: ResourceSyncDependencies,
): Promise<Map<string, FragmentCollectionPayload>> {
  const collections = await listFragmentCollections(config, groupId, dependencies);
  const byKey = new Map<string, FragmentCollectionPayload>();

  for (const collection of collections) {
    const key = String(collection.fragmentCollectionKey ?? '').trim();
    const name = String(collection.name ?? '').trim();
    if (key !== '') {
      byKey.set(key.toLowerCase(), collection);
    }
    if (name !== '') {
      byKey.set(sanitizeFileToken(name).toLowerCase(), collection);
    }
  }

  return byKey;
}

export async function listRuntimeFragmentsByKey(
  config: AppConfig,
  fragmentCollectionId: number,
  dependencies?: ResourceSyncDependencies,
): Promise<Map<string, FragmentEntryPayload>> {
  const runtimeFragments = await listFragments(config, fragmentCollectionId, dependencies);
  const byKey = new Map<string, FragmentEntryPayload>();

  for (const runtimeFragment of runtimeFragments) {
    const runtimeKey = String(runtimeFragment.fragmentEntryKey ?? '').trim();
    const runtimeName = String(runtimeFragment.name ?? '').trim();
    if (runtimeKey !== '') {
      byKey.set(runtimeKey.toLowerCase(), runtimeFragment);
    }
    if (runtimeName !== '') {
      byKey.set(sanitizeFileToken(runtimeName).toLowerCase(), runtimeFragment);
    }
  }

  return byKey;
}

export async function createFragmentCollection(
  config: AppConfig,
  groupId: number,
  collection: LocalFragmentCollection,
  dependencies?: ResourceSyncDependencies,
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

  return toFragmentCollectionPayload(response);
}

export async function updateFragmentCollection(
  config: AppConfig,
  fragmentCollectionId: number,
  collection: LocalFragmentCollection,
  dependencies?: ResourceSyncDependencies,
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

  return toFragmentEntryPayload(response);
}

export async function updateFragmentEntry(
  config: AppConfig,
  groupId: number,
  fragmentCollectionId: number,
  fragmentEntryId: number,
  fragment: LocalFragment,
  dependencies?: ResourceSyncDependencies,
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

  return toFragmentEntryPayload(response);
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
