import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventoryTemplates} from '../../liferay/inventory/liferay-inventory-templates.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_inventory_templates';

export const inputSchema = {
  site: z.string().describe('Site friendly URL path (e.g. /guest)'),
};

export const description = 'List web content templates for a Liferay site, including structure associations.';

export async function handleTool(input: {site: string}, config: AppConfig) {
  return runJsonTool(() => runLiferayInventoryTemplates(config, {site: input.site}));
}
