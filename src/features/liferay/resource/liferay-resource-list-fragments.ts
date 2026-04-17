import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {listFragmentCollections, listFragments, resolveResourceSite} from './liferay-resource-shared.js';

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceFragmentRow = {
  fragmentId: number;
  fragmentKey: string;
  fragmentName: string;
  collectionId: number;
  collectionName: string;
  collectionKey: string;
  collectionDescription: string;
  icon: string;
  type: number;
};

export async function runLiferayResourceListFragments(
  config: AppConfig,
  options?: {site?: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceFragmentRow[]> {
  const site = await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const collections = await listFragmentCollections(config, site.id, dependencies);
  const rows: LiferayResourceFragmentRow[] = [];

  for (const collection of collections) {
    const collectionId = Number(collection.fragmentCollectionId ?? -1);
    if (collectionId <= 0) {
      continue;
    }

    const fragments = await listFragments(config, collectionId, dependencies);
    for (const fragment of fragments) {
      rows.push({
        fragmentId: Number(fragment.fragmentEntryId ?? -1),
        fragmentKey: String(fragment.fragmentEntryKey ?? ''),
        fragmentName: String(fragment.name ?? ''),
        collectionId,
        collectionName: String(collection.name ?? ''),
        collectionKey: String(collection.fragmentCollectionKey ?? ''),
        collectionDescription: String(collection.description ?? ''),
        icon: String(fragment.icon ?? ''),
        type: Number(fragment.type ?? 0),
      });
    }
  }

  return rows;
}

export function formatLiferayResourceFragments(rows: LiferayResourceFragmentRow[]): string {
  if (rows.length === 0) {
    return 'No fragments';
  }

  return rows.map((row) => `${row.fragmentId}\t${row.fragmentKey}\t${row.collectionName}`).join('\n');
}
