import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {AppConfig} from '../../../core/config/schema.js';
import {runMcpCheck} from '../../mcp/mcp.js';

export const TOOL_NAME = 'liferay_mcp_check';

export const inputSchema = {};

export const description =
  "Check whether Liferay's built-in MCP server is reachable and the feature flag is enabled.";

export async function handleTool(
  _input: Record<string, unknown>,
  config: AppConfig,
): Promise<CallToolResult> {
  try {
    const result = await runMcpCheck(config);
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    return {isError: true, content: [{type: 'text', text: err instanceof Error ? err.message : String(err)}]};
  }
}
