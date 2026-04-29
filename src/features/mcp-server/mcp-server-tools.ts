import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {AppConfig} from '../../core/config/schema.js';
import * as contextTool from './tools/tool-ldev-context.js';
import * as statusTool from './tools/tool-ldev-status.js';
import * as logsDiagnoseTool from './tools/tool-ldev-logs-diagnose.js';
import * as sitesTool from './tools/tool-liferay-inventory-sites.js';
import * as structuresTool from './tools/tool-liferay-inventory-structures.js';
import * as pagesTool from './tools/tool-liferay-inventory-pages.js';
import * as pageTool from './tools/tool-liferay-inventory-page.js';
import * as checkTool from './tools/tool-liferay-check.js';
import * as doctorTool from './tools/tool-liferay-doctor.js';
import * as templatesTool from './tools/tool-liferay-inventory-templates.js';
import * as deployStatusTool from './tools/tool-liferay-deploy-status.js';
import * as osgiDiagTool from './tools/tool-liferay-osgi-diag.js';
import * as osgiStatusTool from './tools/tool-liferay-osgi-status.js';
import * as osgiThreadDumpTool from './tools/tool-liferay-osgi-thread-dump.js';
import * as mcpCheckTool from './tools/tool-liferay-mcp-check.js';

export type McpToolModule = {
  TOOL_NAME: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleTool: (input: any, config: AppConfig, cwd: string) => Promise<CallToolResult>;
};

export const ALL_TOOLS: McpToolModule[] = [
  contextTool,
  checkTool,
  statusTool,
  logsDiagnoseTool,
  sitesTool,
  structuresTool,
  pagesTool,
  pageTool,
  doctorTool,
  templatesTool,
  deployStatusTool,
  osgiStatusTool,
  osgiDiagTool,
  osgiThreadDumpTool,
  mcpCheckTool,
];
