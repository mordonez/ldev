import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventorySites} from '../../liferay/inventory/liferay-inventory-sites.js';

export const TOOL_NAME = 'liferay_inventory_sites';

export const inputSchema = {
  pageSize: z.number().optional().describe('Max sites per request (default 200)'),
};

export const description = 'List all accessible Liferay sites with their group IDs and friendly URLs.';

export async function handleTool(
  input: {pageSize?: number},
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const result = await runLiferayInventorySites(config, {pageSize: input.pageSize});
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
