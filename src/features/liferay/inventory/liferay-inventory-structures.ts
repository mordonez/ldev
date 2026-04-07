import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import {fetchPagedItems, normalizeLocalizedName, resolveSite} from './liferay-inventory-shared.js';

export type LiferayInventoryStructure = {
  id: number;
  key: string;
  name: string;
};

type DataDefinition = {
  id?: number;
  dataDefinitionKey?: string;
  name?: string | Record<string, string>;
};

export async function runLiferayInventoryStructures(
  config: AppConfig,
  options?: {site?: string; pageSize?: number},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventoryStructure[]> {
  const site = await resolveSite(config, options?.site ?? '/global', dependencies);
  const rows = await fetchPagedItems<DataDefinition>(
    config,
    `/o/data-engine/v2.0/sites/${site.id}/data-definitions/by-content-type/journal`,
    options?.pageSize ?? 200,
    dependencies,
  );

  return rows.map((row) => ({
    id: row.id ?? -1,
    key: row.dataDefinitionKey ?? '',
    name: normalizeLocalizedName(row.name),
  }));
}

export function formatLiferayInventoryStructures(rows: LiferayInventoryStructure[]): string {
  if (rows.length === 0) {
    return 'No structure data';
  }

  const lines = rows.map((row) => `- id=${row.id} key=${row.key} name=${row.name}`);
  lines.push(`total=${rows.length}`);
  return lines.join('\n');
}
