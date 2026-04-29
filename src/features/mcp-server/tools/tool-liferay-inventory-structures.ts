import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {
  runLiferayInventoryStructures,
  runLiferayInventoryStructuresAllSites,
} from '../../liferay/inventory/liferay-inventory-structures.js';

export const TOOL_NAME = 'liferay_inventory_structures';

export const inputSchema = {
  site: z.string().optional().describe('Site friendly URL path (e.g. /guest). Omit to scan all sites.'),
  withTemplates: z.boolean().optional().describe('Include associated templates in the result'),
};

export const description = 'List journal structures for a site or all sites, optionally including template references.';

export async function handleTool(
  input: {site?: string; withTemplates?: boolean},
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const options = {withTemplates: input.withTemplates};
    const result = input.site
      ? await runLiferayInventoryStructures(config, {...options, site: input.site})
      : await runLiferayInventoryStructuresAllSites(config, options);
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
