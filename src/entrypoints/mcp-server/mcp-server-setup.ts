import path from 'node:path';

import fs from 'fs-extra';

import {runProcess} from '../../core/platform/process.js';

export type McpSetupTool = 'claude-code' | 'cursor' | 'vscode';
export type McpTool = McpSetupTool | 'all';
export type McpStrategy = 'global' | 'local' | 'npx';

export const MCP_SETUP_TOOLS: McpSetupTool[] = ['claude-code', 'cursor', 'vscode'];

export type McpSetupResult = {
  ok: true;
  tool: McpSetupTool;
  configPath: string;
  strategy: McpStrategy;
  merged: boolean;
};

export type McpSetupAllResult = {
  ok: true;
  tool: 'all';
  strategy: McpStrategy;
  results: McpSetupResult[];
};

export type McpSetupCommandResult = McpSetupResult | McpSetupAllResult;

export type McpServerConfig = {
  command: string;
  args?: string[];
};

export type McpConfigRoot = 'mcpServers' | 'servers';

type VsCodeMcpServerConfig = McpServerConfig & {
  type: 'stdio';
};

type ToolServerConfig = McpServerConfig | VsCodeMcpServerConfig;

async function resolveStrategy(targetDir: string, requestedStrategy?: McpStrategy): Promise<McpStrategy> {
  if (requestedStrategy) {
    return requestedStrategy;
  }

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

export function buildMcpServerConfig(strategy: McpStrategy): McpServerConfig {
  if (strategy === 'global') {
    return {command: 'ldev-mcp-server'};
  }
  if (strategy === 'local') {
    return {command: 'node', args: ['./node_modules/@mordonezdev/ldev/dist/mcp-server.js']};
  }
  return {command: 'npx', args: ['--package', '@mordonezdev/ldev', '-y', 'ldev-mcp-server']};
}

export function buildVsCodeServerConfig(strategy: McpStrategy): VsCodeMcpServerConfig {
  return {type: 'stdio', ...buildMcpServerConfig(strategy)};
}

export function resolveMcpConfigPath(targetDir: string, tool: McpSetupTool): string {
  if (tool === 'claude-code') {
    return path.join(targetDir, '.claude', 'mcp.json');
  }
  if (tool === 'vscode') {
    return path.join(targetDir, '.vscode', 'mcp.json');
  }
  return path.join(targetDir, '.cursor', 'mcp.json');
}

export function runMcpSetup(options: {
  targetDir: string;
  tool: McpSetupTool;
  strategy?: McpStrategy;
}): Promise<McpSetupResult>;
export function runMcpSetup(options: {
  targetDir: string;
  tool: 'all';
  strategy?: McpStrategy;
}): Promise<McpSetupAllResult>;
export function runMcpSetup(options: {
  targetDir: string;
  tool: McpTool;
  strategy?: McpStrategy;
}): Promise<McpSetupCommandResult>;
export async function runMcpSetup(options: {
  targetDir: string;
  tool: McpTool;
  strategy?: McpStrategy;
}): Promise<McpSetupCommandResult> {
  const {targetDir, tool} = options;
  if (!isMcpTool(tool)) {
    throw new Error(`--tool must be one of: all, ${MCP_SETUP_TOOLS.join(', ')}`);
  }
  if (options.strategy && !isMcpStrategy(options.strategy)) {
    throw new Error('--strategy must be one of: global, local, npx');
  }

  const strategy = await resolveStrategy(targetDir, options.strategy);

  if (tool === 'all') {
    const results = [];
    for (const setupTool of MCP_SETUP_TOOLS) {
      results.push(await writeMcpSetupForTool({targetDir, tool: setupTool, strategy}));
    }
    return {ok: true, tool, strategy, results};
  }

  return writeMcpSetupForTool({targetDir, tool, strategy});
}

export function isMcpTool(value: string): value is McpTool {
  return value === 'all' || MCP_SETUP_TOOLS.includes(value as McpSetupTool);
}

export function isMcpStrategy(value: string): value is McpStrategy {
  return ['global', 'local', 'npx'].includes(value);
}

async function writeMcpSetupForTool(options: {
  targetDir: string;
  tool: McpSetupTool;
  strategy: McpStrategy;
}): Promise<McpSetupResult> {
  const {targetDir, tool, strategy} = options;
  const configPath = resolveMcpConfigPath(targetDir, tool);

  await fs.ensureDir(path.dirname(configPath));

  const rootKey = getMcpConfigRoot(tool);
  const serverConfig = tool === 'vscode' ? buildVsCodeServerConfig(strategy) : buildMcpServerConfig(strategy);
  const merged = await writeMcpConfig(configPath, rootKey, serverConfig);

  return {ok: true, tool, configPath, strategy, merged};
}

export function getMcpConfigRoot(tool: McpSetupTool): McpConfigRoot {
  return tool === 'vscode' ? 'servers' : 'mcpServers';
}

async function writeMcpConfig(
  configPath: string,
  rootKey: McpConfigRoot,
  serverConfig: ToolServerConfig,
): Promise<boolean> {
  let merged = false;
  let existing: Record<string, unknown> = {[rootKey]: {}};

  if (await fs.pathExists(configPath)) {
    try {
      const raw: unknown = await fs.readJson(configPath);
      if (raw && typeof raw === 'object' && rootKey in raw) {
        existing = raw as Record<string, unknown>;
        merged = true;
      }
    } catch {
      // overwrite corrupt file
    }
  }

  const servers = existing[rootKey];
  const updated = {
    ...existing,
    [rootKey]: {
      ...(servers && typeof servers === 'object' ? (servers as Record<string, unknown>) : {}),
      ldev: serverConfig,
    },
  };

  await fs.writeJson(configPath, updated, {spaces: 2});

  return merged;
}

export function formatMcpSetup(result: McpSetupCommandResult): string {
  if (result.tool === 'all') {
    return [
      `Configured ${result.results.length} MCP client configs`,
      `  strategy: ${formatStrategyLabel(result.strategy)}`,
      '',
      ...result.results.map((entry) => {
        const action = entry.merged ? 'Updated' : 'Created';
        return `${action} ${entry.configPath} (${entry.tool})`;
      }),
      '',
      'Restart your AI assistant to pick up the new MCP server.',
    ].join('\n');
  }

  const action = result.merged ? 'Updated' : 'Created';
  return [
    `${action} ${result.configPath}`,
    `  tool: ${result.tool}`,
    `  strategy: ${formatStrategyLabel(result.strategy)}`,
    '',
    'Restart your AI assistant to pick up the new MCP server.',
  ].join('\n');
}

function formatStrategyLabel(strategy: McpStrategy): string {
  if (strategy === 'global') {
    return 'ldev-mcp-server (global)';
  }
  if (strategy === 'local') {
    return 'node ./node_modules/... (local devDependency)';
  }
  return 'npx --package @mordonezdev/ldev';
}
