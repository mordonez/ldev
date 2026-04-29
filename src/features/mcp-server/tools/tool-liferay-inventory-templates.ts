import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventoryTemplates} from '../../liferay/inventory/liferay-inventory-templates.js';

export const TOOL_NAME = 'liferay_inventory_templates';

export const inputSchema = {
  site: z.string().describe('Site friendly URL path (e.g. /guest)'),
};

export const description = 'List web content templates for a Liferay site, including structure associations.';

export async function handleTool(
  input: {site: string},
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const result = await runLiferayInventoryTemplates(config, {site: input.site});
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
