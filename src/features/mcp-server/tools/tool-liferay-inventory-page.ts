import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventoryPage} from '../../liferay/inventory/liferay-inventory-page.js';

export const TOOL_NAME = 'liferay_inventory_page';

export const inputSchema = {
  url: z.string().optional().describe('Full page URL or path (e.g. http://localhost:8080/web/guest/home)'),
  site: z.string().optional().describe('Site friendly URL path (e.g. /guest)'),
  friendlyUrl: z.string().optional().describe('Page friendly URL relative to site (e.g. /home)'),
  privateLayout: z.boolean().optional().describe('True if the page is a private layout'),
  verbose: z.boolean().optional().describe('Include fragment and widget details'),
};

export const description =
  'Inspect a specific Liferay page: returns portlets, fragments, configuration tabs, and SEO settings.';

export async function handleTool(
  input: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean; verbose?: boolean},
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const result = await runLiferayInventoryPage(config, {
      url: input.url,
      site: input.site,
      friendlyUrl: input.friendlyUrl,
      privateLayout: input.privateLayout,
      verbose: input.verbose,
    });
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
