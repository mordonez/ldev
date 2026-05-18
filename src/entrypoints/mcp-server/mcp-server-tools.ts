import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {z} from 'zod';
import type {AppConfig} from '../../core/config/schema.js';
import {
  agentContextReportSchema,
  aiBootstrapResultSchema,
  deployStatusResultSchema,
  doctorReportSchema,
  envLogsDiagnoseResultSchema,
  envStatusReportSchema,
  liferayHealthResultSchema,
  liferayInventoryPageJsonSchema,
  liferayInventoryPagesResultSchema,
  liferayInventorySitesSchema,
  liferayInventoryStructuresResultSchema,
  liferayInventoryTemplatesSchema,
  liferayPreflightResultSchema,
  mcpCheckResultSchema,
  osgiDiagResultSchema,
  osgiStatusResultSchema,
  osgiThreadDumpResultSchema,
  whereUsedPlanResultSchema,
  whereUsedResultSchema,
} from '../../core/contracts/index.js';
import * as aiBootstrapTool from './tools/tool-ldev-ai-bootstrap.js';
import * as contextTool from './tools/tool-ldev-context.js';
import * as statusTool from './tools/tool-ldev-status.js';
import * as logsDiagnoseTool from './tools/tool-ldev-logs-diagnose.js';
import * as sitesTool from './tools/tool-liferay-inventory-sites.js';
import * as preflightTool from './tools/tool-liferay-inventory-preflight.js';
import * as structuresTool from './tools/tool-liferay-inventory-structures.js';
import * as pagesTool from './tools/tool-liferay-inventory-pages.js';
import * as pageTool from './tools/tool-liferay-inventory-page.js';
import * as whereUsedTool from './tools/tool-liferay-inventory-where-used.js';
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
  outputSchema?: z.ZodType<unknown>;
  risk: 'read' | 'artifact' | 'mutating';
  writesFiles: boolean;
  fallbackCli: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleTool: (input: any, config: AppConfig, cwd: string) => Promise<CallToolResult>;
};

type ToolCatalogEntry = Omit<McpToolModule, 'TOOL_NAME' | 'description' | 'inputSchema' | 'handleTool'> & {
  module: Pick<McpToolModule, 'TOOL_NAME' | 'description' | 'inputSchema' | 'handleTool'>;
};

const whereUsedOutputSchema = whereUsedResultSchema.or(whereUsedPlanResultSchema);

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    module: contextTool,
    outputSchema: agentContextReportSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev context --json',
  },
  {
    module: aiBootstrapTool,
    outputSchema: aiBootstrapResultSchema,
    risk: 'read',
    writesFiles: true,
    fallbackCli: 'ldev ai bootstrap --intent <intent> --json',
  },
  {
    module: checkTool,
    outputSchema: liferayHealthResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal check --json',
  },
  {
    module: statusTool,
    outputSchema: envStatusReportSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev status --json',
  },
  {
    module: logsDiagnoseTool,
    outputSchema: envLogsDiagnoseResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev logs diagnose --since 10m --json',
  },
  {
    module: sitesTool,
    outputSchema: liferayInventorySitesSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal inventory sites --json',
  },
  {
    module: preflightTool,
    outputSchema: liferayPreflightResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal inventory preflight --json',
  },
  {
    module: structuresTool,
    outputSchema: liferayInventoryStructuresResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal inventory structures --site <site> --json',
  },
  {
    module: pagesTool,
    outputSchema: liferayInventoryPagesResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal inventory pages --site <site> --json',
  },
  {
    module: pageTool,
    outputSchema: liferayInventoryPageJsonSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal inventory page --url <url> --json',
  },
  {
    module: whereUsedTool,
    outputSchema: whereUsedOutputSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal inventory where-used --type <type> --key <key> --json',
  },
  {
    module: doctorTool,
    outputSchema: doctorReportSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev doctor --json',
  },
  {
    module: templatesTool,
    outputSchema: liferayInventoryTemplatesSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev portal inventory templates --site <site> --json',
  },
  {
    module: deployStatusTool,
    outputSchema: deployStatusResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev deploy status --json',
  },
  {
    module: osgiStatusTool,
    outputSchema: osgiStatusResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev osgi status <bundle> --json',
  },
  {
    module: osgiDiagTool,
    outputSchema: osgiDiagResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev osgi diag <bundle> --json',
  },
  {
    module: osgiThreadDumpTool,
    outputSchema: osgiThreadDumpResultSchema,
    risk: 'artifact',
    writesFiles: true,
    fallbackCli: 'ldev osgi thread-dump --json',
  },
  {
    module: mcpCheckTool,
    outputSchema: mcpCheckResultSchema,
    risk: 'read',
    writesFiles: false,
    fallbackCli: 'ldev mcp check --json',
  },
];

export const ALL_TOOLS: McpToolModule[] = TOOL_CATALOG.map(({module, ...metadata}) => ({
  ...module,
  ...metadata,
}));
