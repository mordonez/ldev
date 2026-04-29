import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {AppConfig} from '../../core/config/schema.js';
import * as sitesTool from './tools/tool-liferay-inventory-sites.js';
import * as structuresTool from './tools/tool-liferay-inventory-structures.js';
import * as pagesTool from './tools/tool-liferay-inventory-pages.js';
import * as pageTool from './tools/tool-liferay-inventory-page.js';
import * as doctorTool from './tools/tool-liferay-doctor.js';
import * as templatesTool from './tools/tool-liferay-inventory-templates.js';
import * as deployStatusTool from './tools/tool-liferay-deploy-status.js';
import * as osgiStatusTool from './tools/tool-liferay-osgi-status.js';
import * as mcpCheckTool from './tools/tool-liferay-mcp-check.js';

export type McpToolModule = {
  TOOL_NAME: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleTool: (input: any, config: AppConfig, cwd: string) => Promise<CallToolResult>;
};

export const ALL_TOOLS: McpToolModule[] = [
  sitesTool,
  structuresTool,
  pagesTool,
  pageTool,
  doctorTool,
  templatesTool,
  deployStatusTool,
  osgiStatusTool,
  mcpCheckTool,
];
