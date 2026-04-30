import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventorySites} from '../../liferay/inventory/liferay-inventory-sites.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_inventory_sites';

export const inputSchema = {
  pageSize: z.number().optional().describe('Max sites per request (default 200)'),
};

export const description = 'List all accessible Liferay sites with their group IDs and friendly URLs.';

export async function handleTool(input: {pageSize?: number}, config: AppConfig) {
  return runJsonTool(() => runLiferayInventorySites(config, {pageSize: input.pageSize}));
}
