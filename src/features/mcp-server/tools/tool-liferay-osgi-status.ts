import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runOsgiStatus} from '../../osgi/osgi-status.js';

export const TOOL_NAME = 'liferay_osgi_status';

export const inputSchema = {
  bundle: z.string().describe('Bundle symbolic name or partial name to filter (e.g. com.example.mymodule)'),
};

export const description = 'Query the OSGi runtime for bundle state via the Gogo shell (lb -s filter).';

export async function handleTool(
  input: {bundle: string},
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const result = await runOsgiStatus(config, {bundle: input.bundle});
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
