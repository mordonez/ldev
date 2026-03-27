import type {AppConfig} from '../../core/config/load-config.js';
import type {LiferayApiClient} from '../../core/liferay/client.js';
import type {OAuthTokenClient} from '../../core/liferay/auth.js';
import {fetchPagedItems, resolveSite} from './liferay-inventory-shared.js';

export type LiferayInventoryTemplate = {
  id: string;
  name: string;
  contentStructureId: number;
  externalReferenceCode: string;
  templateScript?: string;
};

type ContentTemplate = {
  id?: string | number;
  name?: string;
  contentStructureId?: number;
  externalReferenceCode?: string;
  templateScript?: string;
};

export async function runLiferayInventoryTemplates(
  config: AppConfig,
  options?: {site?: string; pageSize?: number},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventoryTemplate[]> {
  const site = await resolveSite(config, options?.site ?? '/global', dependencies);
  const rows = await fetchPagedItems<ContentTemplate>(
    config,
    `/o/headless-delivery/v1.0/sites/${site.id}/content-templates`,
    options?.pageSize ?? 200,
    dependencies,
  );

  return rows.map((row) => ({
    id: String(row.id ?? ''),
    name: row.name ?? String(row.id ?? ''),
    contentStructureId: row.contentStructureId ?? -1,
    externalReferenceCode: String(row.externalReferenceCode ?? row.id ?? ''),
    templateScript: typeof row.templateScript === 'string' ? row.templateScript : undefined,
  }));
}

export function formatLiferayInventoryTemplates(rows: LiferayInventoryTemplate[]): string {
  if (rows.length === 0) {
    return 'Sin datos de templates';
  }

  const lines = rows.map(
    (row) => `- key=${row.id} structureId=${row.contentStructureId} name=${row.name}`,
  );
  lines.push(`total=${rows.length}`);
  return lines.join('\n');
}
