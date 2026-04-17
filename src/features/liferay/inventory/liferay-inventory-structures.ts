import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import {fetchPagedItems, normalizeLocalizedName, resolveSite} from './liferay-inventory-shared.js';
import {runLiferayInventoryTemplates} from './liferay-inventory-templates.js';

export type LiferayStructureTemplateRef = {
  id: string;
  name: string;
  externalReferenceCode: string;
};

export type LiferayInventoryStructure = {
  id: number;
  key: string;
  name: string;
  templates?: LiferayStructureTemplateRef[];
};

type DataDefinition = {
  id?: number;
  dataDefinitionKey?: string;
  name?: string | Record<string, string>;
};

export async function runLiferayInventoryStructures(
  config: AppConfig,
  options?: {site?: string; pageSize?: number; withTemplates?: boolean},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventoryStructure[]> {
  const site = await resolveSite(config, options?.site ?? '/global', dependencies);
  const rows = await fetchPagedItems<DataDefinition>(
    config,
    `/o/data-engine/v2.0/sites/${site.id}/data-definitions/by-content-type/journal`,
    options?.pageSize ?? 200,
    dependencies,
  );

  const structures = rows.map((row) => ({
    id: row.id ?? -1,
    key: row.dataDefinitionKey ?? '',
    name: normalizeLocalizedName(row.name),
  }));

  if (!options?.withTemplates) {
    return structures;
  }

  const templates = await runLiferayInventoryTemplates(
    config,
    {site: options?.site ?? '/global', pageSize: options?.pageSize ?? 200},
    dependencies,
  );

  const templatesByStructureId = new Map<number, LiferayStructureTemplateRef[]>();

  for (const template of templates) {
    const refs = templatesByStructureId.get(template.contentStructureId) ?? [];
    refs.push({
      id: template.id,
      name: template.name,
      externalReferenceCode: template.externalReferenceCode,
    });
    templatesByStructureId.set(template.contentStructureId, refs);
  }

  return structures.map((structure) => ({
    ...structure,
    templates: templatesByStructureId.get(structure.id) ?? [],
  }));
}

export function formatLiferayInventoryStructures(rows: LiferayInventoryStructure[]): string {
  if (rows.length === 0) {
    return 'No structure data';
  }

  const lines = rows.map((row) => {
    if (!row.templates) {
      return `- id=${row.id} key=${row.key} name=${row.name}`;
    }

    return `- id=${row.id} key=${row.key} name=${row.name} templates=${row.templates.length}`;
  });
  lines.push(`total=${rows.length}`);
  return lines.join('\n');
}
