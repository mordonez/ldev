import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import {fetchPagedItems, normalizeLocalizedName, resolveSite} from './liferay-inventory-shared.js';
import {runLiferayInventoryTemplates} from './liferay-inventory-templates.js';
import {runLiferayInventorySitesIncludingGlobal} from './liferay-inventory-sites.js';

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

export type LiferayInventoryStructuresBySite = {
  siteGroupId: number;
  siteFriendlyUrl: string;
  siteName: string;
  structures: LiferayInventoryStructure[];
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
  return runLiferayInventoryStructuresForSiteId(config, site.id, options, dependencies);
}

export async function runLiferayInventoryStructuresAllSites(
  config: AppConfig,
  options?: {pageSize?: number; withTemplates?: boolean},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventoryStructuresBySite[]> {
  const sites = await runLiferayInventorySitesIncludingGlobal(
    config,
    {pageSize: options?.pageSize ?? 200},
    dependencies,
  );

  const rows = await Promise.all(
    sites.map(async (site) => ({
      siteGroupId: site.groupId,
      siteFriendlyUrl: site.siteFriendlyUrl,
      siteName: site.name,
      structures: await runLiferayInventoryStructuresForSiteId(
        config,
        site.groupId,
        {site: site.siteFriendlyUrl, pageSize: options?.pageSize, withTemplates: options?.withTemplates},
        dependencies,
      ),
    })),
  );

  return rows;
}

async function runLiferayInventoryStructuresForSiteId(
  config: AppConfig,
  siteId: number,
  options?: {site?: string; pageSize?: number; withTemplates?: boolean},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventoryStructure[]> {
  const rows = await fetchPagedItems<DataDefinition>(
    config,
    `/o/data-engine/v2.0/sites/${siteId}/data-definitions/by-content-type/journal`,
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

export function formatLiferayInventoryStructuresBySite(rows: LiferayInventoryStructuresBySite[]): string {
  if (rows.length === 0) {
    return 'No structure data';
  }

  const lines: string[] = [];

  for (const site of rows) {
    lines.push(
      `site=${site.siteFriendlyUrl} groupId=${site.siteGroupId} name=${site.siteName} structures=${site.structures.length}`,
    );
    for (const structure of site.structures) {
      if (!structure.templates) {
        lines.push(`  - id=${structure.id} key=${structure.key} name=${structure.name}`);
      } else {
        lines.push(
          `  - id=${structure.id} key=${structure.key} name=${structure.name} templates=${structure.templates.length}`,
        );
      }
    }
  }

  lines.push(`totalSites=${rows.length}`);
  return lines.join('\n');
}
