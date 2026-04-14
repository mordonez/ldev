import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import {fetchPagedItems, resolveSite} from './liferay-inventory-shared.js';
import {listDdmTemplates, resolveResourceSite} from '../resource/liferay-resource-shared.js';
import {getOperationPolicy} from './capabilities.js';

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
  const policy = getOperationPolicy('inventory.listTemplates');
  const pageSize = options?.pageSize ?? 200;

  for (const surface of policy.surfaces) {
    if (surface === 'headless-delivery') {
      const rows = await fetchPagedItems<ContentTemplate>(
        config,
        `/o/headless-delivery/v1.0/sites/${site.id}/content-templates`,
        pageSize,
        dependencies,
      );

      if (rows.length > 0) {
        return rows.map(normalizeContentTemplate);
      }
      // Empty result: continue to next surface (jsonws)
    }

    if (surface === 'jsonws') {
      const resourceSite = await resolveResourceSite(config, options?.site ?? '/global', dependencies);
      const ddmRows = await listDdmTemplates(config, resourceSite, dependencies);

      return ddmRows.map(normalizeDdmTemplate);
    }
  }

  return [];
}

function normalizeContentTemplate(row: ContentTemplate): LiferayInventoryTemplate {
  return {
    id: String(row.id ?? ''),
    name: row.name ?? String(row.id ?? ''),
    contentStructureId: row.contentStructureId ?? -1,
    externalReferenceCode: String(row.externalReferenceCode ?? row.id ?? ''),
    templateScript: typeof row.templateScript === 'string' ? row.templateScript : undefined,
  };
}

function normalizeDdmTemplate(row: {
  id?: string | number;
  nameCurrentValue?: string;
  name?: string;
  templateKey?: string;
  templateId?: string | number;
  classPK?: string | number;
  externalReferenceCode?: string;
  script?: string;
}): LiferayInventoryTemplate {
  return {
    id: String(row.id ?? ''),
    name: String(row.nameCurrentValue ?? row.name ?? row.templateKey ?? row.templateId ?? ''),
    contentStructureId: Number(row.classPK ?? -1),
    externalReferenceCode: String(row.externalReferenceCode ?? row.templateKey ?? row.templateId ?? ''),
    templateScript: typeof row.script === 'string' ? row.script : undefined,
  };
}

export function formatLiferayInventoryTemplates(rows: LiferayInventoryTemplate[]): string {
  if (rows.length === 0) {
    return 'No template data';
  }

  const lines = rows.map((row) => `- key=${row.id} structureId=${row.contentStructureId} name=${row.name}`);
  lines.push(`total=${rows.length}`);
  return lines.join('\n');
}
