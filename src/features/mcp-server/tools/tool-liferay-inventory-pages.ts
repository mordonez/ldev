import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventoryPages} from '../../liferay/inventory/liferay-inventory-pages.js';

export const TOOL_NAME = 'liferay_inventory_pages';

export const inputSchema = {
  site: z.string().optional().describe('Site friendly URL path (e.g. /guest)'),
  privateLayout: z.boolean().optional().describe('Inspect private pages instead of public pages'),
  maxDepth: z.number().optional().describe('Max recursion depth for nested pages'),
};

export const description = 'List the page tree for a Liferay site, including hierarchy and friendly URLs.';

export async function handleTool(
  input: {site?: string; privateLayout?: boolean; maxDepth?: number},
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const result = await runLiferayInventoryPages(config, {
      site: input.site,
      privateLayout: input.privateLayout,
      maxDepth: input.maxDepth,
    });
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
