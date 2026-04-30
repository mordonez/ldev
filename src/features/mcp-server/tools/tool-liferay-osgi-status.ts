import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runOsgiStatus} from '../../osgi/osgi-status.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_osgi_status';

export const inputSchema = {
  bundle: z.string().describe('Bundle symbolic name or partial name to filter (e.g. com.example.mymodule)'),
};

export const description = 'Query the OSGi runtime for bundle state via the Gogo shell (lb -s filter).';

export async function handleTool(input: {bundle: string}, config: AppConfig) {
  return runJsonTool(() => runOsgiStatus(config, {bundle: input.bundle}));
}
