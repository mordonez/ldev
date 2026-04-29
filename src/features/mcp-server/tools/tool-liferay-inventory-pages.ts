import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventoryPages} from '../../liferay/inventory/liferay-inventory-pages.js';
import {runJsonTool} from './tool-result.js';

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
) {
  return runJsonTool(() =>
    runLiferayInventoryPages(config, {
      site: input.site,
      privateLayout: input.privateLayout,
      maxDepth: input.maxDepth,
    }),
  );
}
