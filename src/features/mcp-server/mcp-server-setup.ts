import path from 'node:path';

import fs from 'fs-extra';

import {runProcess} from '../../core/platform/process.js';

export type McpTool = 'claude-code' | 'cursor';

export type McpSetupResult = {
  ok: true;
  tool: McpTool;
  configPath: string;
  strategy: 'global' | 'local' | 'npx';
  merged: boolean;
};

type McpServerConfig = {
  command: string;
  args?: string[];
};

type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

async function resolveStrategy(targetDir: string): Promise<'global' | 'local' | 'npx'> {
  const result = await runProcess('ldev-mcp-server', ['--version'], {timeoutMs: 3000, reject: false});
  if (result.ok) {
    return 'global';
  }
  const localBin = path.join(targetDir, 'node_modules', '@mordonezdev', 'ldev', 'dist', 'mcp-server.js');
  if (fs.existsSync(localBin)) {
    return 'local';
  }
  return 'npx';
}

function buildServerConfig(strategy: 'global' | 'local' | 'npx'): McpServerConfig {
  if (strategy === 'global') {
    return {command: 'ldev-mcp-server'};
  }
  if (strategy === 'local') {
    return {command: 'node', args: ['./node_modules/@mordonezdev/ldev/dist/mcp-server.js']};
  }
  return {command: 'npx', args: ['--package', '@mordonezdev/ldev', '-y', 'ldev-mcp-server']};
}

function resolveConfigPath(targetDir: string, tool: McpTool): string {
  if (tool === 'claude-code') {
    return path.join(targetDir, '.claude', 'mcp.json');
  }
  return path.join(targetDir, '.cursor', 'mcp.json');
}

export async function runMcpSetup(options: {targetDir: string; tool: McpTool}): Promise<McpSetupResult> {
  const {targetDir, tool} = options;
  const strategy = await resolveStrategy(targetDir);
  const configPath = resolveConfigPath(targetDir, tool);
  const serverConfig = buildServerConfig(strategy);

  await fs.ensureDir(path.dirname(configPath));

  let merged = false;
  let existing: McpConfig = {mcpServers: {}};

  if (await fs.pathExists(configPath)) {
    try {
      const raw: unknown = await fs.readJson(configPath);
      if (raw && typeof raw === 'object' && 'mcpServers' in raw) {
        existing = raw as McpConfig;
        merged = true;
      }
    } catch {
      // overwrite corrupt file
    }
  }

  const updated: McpConfig = {
    ...existing,
    mcpServers: {
      ...existing.mcpServers,
      ldev: serverConfig,
    },
  };

  await fs.writeJson(configPath, updated, {spaces: 2});

  return {ok: true, tool, configPath, strategy, merged};
}

export function formatMcpSetup(result: McpSetupResult): string {
  const action = result.merged ? 'Updated' : 'Created';
  const strategyLabel =
    result.strategy === 'global'
      ? 'ldev-mcp-server (global)'
      : result.strategy === 'local'
        ? 'node ./node_modules/... (local devDependency)'
        : 'npx --package @mordonezdev/ldev';
  return [
    `${action} ${result.configPath}`,
    `  tool: ${result.tool}`,
    `  strategy: ${strategyLabel}`,
    '',
    'Restart your AI assistant to pick up the new MCP server.',
  ].join('\n');
}
