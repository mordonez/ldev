import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import {isCliError} from '../../../core/errors.js';
import {fetchPagedItems} from './liferay-inventory-shared.js';
import {normalizeLocalizedName, resolveSite} from '../portal/site-resolution.js';
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

export type LiferayInventoryStructuresSite = {
  siteGroupId: number;
  siteFriendlyUrl: string;
  siteName: string;
  structures: LiferayInventoryStructure[];
};

export type LiferayInventoryStructuresResult = {
  sites: LiferayInventoryStructuresSite[];
  summary: {
    totalSites: number;
    totalStructures: number;
  };
};

type DataDefinition = {
  id?: number;
  dataDefinitionKey?: string;
  name?: string | Record<string, string>;
};

export async function runLiferayInventoryStructures(
  config: AppConfig,
  options?: {site?: string; pageSize?: number; withTemplates?: boolean},
  dependencies?: {apiClient?: HttpApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventoryStructuresResult> {
  const site = await resolveSite(config, options?.site ?? '/global', dependencies);
  const structures = await runLiferayInventoryStructuresForSiteId(config, site.id, options, dependencies);

  return {
    sites: [
      {
        siteGroupId: site.id,
        siteFriendlyUrl: site.friendlyUrlPath,
        siteName: site.name,
        structures,
      },
    ],
    summary: {
      totalSites: 1,
      totalStructures: structures.length,
    },
  };
}

export async function runLiferayInventoryStructuresAllSites(
  config: AppConfig,
  options?: {pageSize?: number; withTemplates?: boolean},
  dependencies?: {apiClient?: HttpApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventoryStructuresResult> {
  const sites = await runLiferayInventorySitesIncludingGlobal(
    config,
    {pageSize: options?.pageSize ?? 200},
    dependencies,
  );

  const rows = (
    await Promise.all(
      sites.map(async (site) => {
        try {
          return {
            siteGroupId: site.groupId,
            siteFriendlyUrl: site.siteFriendlyUrl,
            siteName: site.name,
            structures: await runLiferayInventoryStructuresForSiteId(
              config,
              site.groupId,
              {site: site.siteFriendlyUrl, pageSize: options?.pageSize, withTemplates: options?.withTemplates},
              dependencies,
            ),
          };
        } catch (error) {
          if (isSkippableStructureInventoryError(error)) {
            return null;
          }

          throw error;
        }
      }),
    )
  ).filter((row): row is LiferayInventoryStructuresSite => row !== null);

  return {
    sites: rows,
    summary: {
      totalSites: rows.length,
      totalStructures: rows.reduce((acc, row) => acc + row.structures.length, 0),
    },
  };
}

function isSkippableStructureInventoryError(error: unknown): boolean {
  if (!isCliError(error) || error.code !== 'LIFERAY_INVENTORY_ERROR') {
    return false;
  }

  return error.message.includes('status=400') && error.message.includes('/data-definitions/by-content-type/journal');
}

async function runLiferayInventoryStructuresForSiteId(
  config: AppConfig,
  siteId: number,
  options?: {site?: string; pageSize?: number; withTemplates?: boolean},
  dependencies?: {apiClient?: HttpApiClient; tokenClient?: OAuthTokenClient},
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
    {site: options.site ?? '/global', pageSize: options.pageSize ?? 200},
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

export function formatLiferayInventoryStructures(result: LiferayInventoryStructuresResult): string {
  if (result.sites.length === 0) {
    return 'No structure data';
  }

  if (hasTemplateDetails(result)) {
    return formatLiferayInventoryStructuresTree(result);
  }

  return formatLiferayInventoryStructuresCompact(result);
}

function hasTemplateDetails(result: LiferayInventoryStructuresResult): boolean {
  return result.sites.some((site) => site.structures.some((structure) => structure.templates !== undefined));
}

function formatLiferayInventoryStructuresCompact(result: LiferayInventoryStructuresResult): string {
  const lines: string[] = [];

  for (const site of result.sites) {
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

  lines.push(`totalSites=${result.summary.totalSites}`);
  lines.push(`totalStructures=${result.summary.totalStructures}`);
  return lines.join('\n');
}

function formatLiferayInventoryStructuresTree(result: LiferayInventoryStructuresResult): string {
  const lines: string[] = [];
  const sites = result.sites.length > 1 ? result.sites.filter((site) => site.structures.length > 0) : result.sites;

  if (sites.length === 0) {
    return 'No structure data';
  }

  for (const site of sites) {
    lines.push(`site=${site.siteFriendlyUrl} name=${site.siteName} groupId=${site.siteGroupId}`);

    for (const structure of site.structures) {
      lines.push(`  structure=${structure.key} name=${structure.name} id=${structure.id}`);

      if (!structure.templates || structure.templates.length === 0) {
        lines.push('    template=(none)');
      } else {
        for (const template of structure.templates) {
          lines.push(`    template=${template.name} erc=${template.externalReferenceCode} id=${template.id}`);
        }
      }
    }

    lines.push('');
  }

  if (lines.at(-1) === '') {
    lines.pop();
  }

  lines.push(`totalSites=${result.summary.totalSites}`);
  lines.push(`totalStructures=${result.summary.totalStructures}`);
  return lines.join('\n');
}
