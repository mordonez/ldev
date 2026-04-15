import type {FragmentCollectionPayload, FragmentEntryPayload} from './liferay-resource-payloads.js';
import type {LocalFragment, LocalFragmentCollection} from './liferay-resource-sync-fragments-types.js';

export function normalizeFragmentCollectionForHash(
  collection: Pick<LocalFragmentCollection, 'slug' | 'name' | 'description'> | FragmentCollectionPayload,
): string {
  return JSON.stringify({
    key: String(('slug' in collection ? collection.slug : collection.fragmentCollectionKey) ?? ''),
    name: String(collection.name ?? ''),
    description: String(collection.description ?? ''),
  });
}

export function normalizeFragmentEntryForHash(
  fragment:
    | Pick<LocalFragment, 'slug' | 'name' | 'html' | 'css' | 'js' | 'configuration' | 'icon' | 'type'>
    | FragmentEntryPayload,
): string {
  return JSON.stringify({
    key: String(('slug' in fragment ? fragment.slug : fragment.fragmentEntryKey) ?? ''),
    name: String(fragment.name ?? ''),
    html: String(fragment.html ?? ''),
    css: String(fragment.css ?? ''),
    js: String(fragment.js ?? ''),
    configuration: normalizeConfigurationForHash(fragment.configuration),
    icon: String(fragment.icon ?? ''),
    type: Number(fragment.type ?? 0),
  });
}

export function canVerifyFragmentEntryContent(fragment: FragmentEntryPayload): boolean {
  return (
    fragment.html !== undefined ||
    fragment.css !== undefined ||
    fragment.js !== undefined ||
    fragment.configuration !== undefined
  );
}

function normalizeConfigurationForHash(value: string | undefined): string {
  const text = String(value ?? '').trim();
  if (text === '') {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}
