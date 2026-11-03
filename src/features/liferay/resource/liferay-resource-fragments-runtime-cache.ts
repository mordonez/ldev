import {sanitizeFileToken} from './liferay-resource-import-fragments-local.js';
import type {FragmentCollectionPayload, FragmentEntryPayload} from './liferay-resource-payloads.js';

export type FragmentSyncRuntimeState = {
  collectionsByKey?: Map<string, FragmentCollectionPayload>;
  fragmentsByCollectionId: Map<number, Map<string, FragmentEntryPayload>>;
};

export function createFragmentSyncRuntimeState(): FragmentSyncRuntimeState {
  return {
    fragmentsByCollectionId: new Map(),
  };
}

export function cacheRuntimeCollection(
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

export function ensureCollectionRuntimeCache(
  runtimeState: FragmentSyncRuntimeState | undefined,
): Map<string, FragmentCollectionPayload> | undefined {
  if (!runtimeState) {
    return undefined;
  }

  runtimeState.collectionsByKey ??= new Map<string, FragmentCollectionPayload>();
  return runtimeState.collectionsByKey;
}

export function cacheFragmentInRuntimeState(
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

export function cacheRuntimeFragment(byKey: Map<string, FragmentEntryPayload>, fragment: FragmentEntryPayload): void {
  const runtimeKey = String(fragment.fragmentEntryKey ?? '').trim();
  const runtimeName = String(fragment.name ?? '').trim();
  if (runtimeKey !== '') {
    byKey.set(runtimeKey.toLowerCase(), fragment);
  }
  if (runtimeName !== '') {
    byKey.set(sanitizeFileToken(runtimeName).toLowerCase(), fragment);
  }
}
