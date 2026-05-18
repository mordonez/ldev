import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayPreflight} from '../../../features/liferay/liferay-preflight.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_inventory_preflight';

export const inputSchema = {
  forceRefresh: z.boolean().optional().describe('Bypass the short-lived preflight cache and probe Liferay again.'),
};

export const description =
  'Check Liferay API surface availability for inventory/resource workflows: headless admin site, admin user, and JSONWS.';

export async function handleTool(input: {forceRefresh?: boolean}, config: AppConfig) {
  return runJsonTool(() => runLiferayPreflight(config, {forceRefresh: Boolean(input.forceRefresh)}));
}
