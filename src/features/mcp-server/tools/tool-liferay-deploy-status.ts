import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {AppConfig} from '../../../core/config/schema.js';
import {runDeployStatus} from '../../deploy/deploy-status.js';

export const TOOL_NAME = 'liferay_deploy_status';

export const inputSchema = {};

export const description = 'Show the status of locally deployed Liferay modules (artifact name, state, last deploy time).';

export async function handleTool(
  _input: Record<string, unknown>,
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const result = await runDeployStatus(config);
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
