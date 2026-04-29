import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {
  runLiferayInventoryStructures,
  runLiferayInventoryStructuresAllSites,
} from '../../liferay/inventory/liferay-inventory-structures.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_inventory_structures';

export const inputSchema = {
  site: z.string().optional().describe('Site friendly URL path (e.g. /guest). Omit to scan all sites.'),
  withTemplates: z.boolean().optional().describe('Include associated templates in the result'),
};

export const description = 'List journal structures for a site or all sites, optionally including template references.';

export async function handleTool(input: {site?: string; withTemplates?: boolean}, config: AppConfig) {
  return runJsonTool(async () => {
    const options = {withTemplates: input.withTemplates};
    return input.site
      ? await runLiferayInventoryStructures(config, {...options, site: input.site})
      : await runLiferayInventoryStructuresAllSites(config, options);
  });
}
