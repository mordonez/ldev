import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';

import {resolveProjectContext} from '../../core/config/project-context.js';
import {parseJsonUnknown} from '../../core/utils/json.js';
import {type McpToolModule, ALL_TOOLS} from './mcp-server-tools.js';
import type {AppConfig} from '../../core/config/schema.js';

// Isolated function to contain the eslint-disable scope to just the SDK interop call.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
function registerTool(server: McpServer, tool: McpToolModule, config: AppConfig, cwd: string): void {
  server.registerTool(
    tool.TOOL_NAME,
    {description: tool.description, inputSchema: tool.inputSchema as any},
    (input: Record<string, unknown>) => tool.handleTool(input, config, cwd),
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */

function readPackageVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = parseJsonUnknown(readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg && typeof pkg === 'object' && 'version' in pkg && typeof (pkg as {version: unknown}).version === 'string') {
        return (pkg as {version: string}).version;
      }
    } catch {
      // not found, go up
    }
    dir = path.dirname(dir);
  }
  return '0.0.0';
}

export async function startMcpServer(): Promise<void> {
  const {config, cwd} = resolveProjectContext();
  const server = new McpServer({name: 'ldev', version: readPackageVersion()});

  for (const tool of ALL_TOOLS) {
    registerTool(server, tool, config, cwd);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
