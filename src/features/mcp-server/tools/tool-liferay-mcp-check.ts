import type {AppConfig} from '../../../core/config/schema.js';
import {runMcpCheck} from '../../mcp/mcp.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_mcp_check';

export const inputSchema = {};

export const description = "Check whether Liferay's built-in MCP server is reachable and the feature flag is enabled.";

export async function handleTool(_input: Record<string, unknown>, config: AppConfig) {
  return runJsonTool(() => runMcpCheck(config));
}
