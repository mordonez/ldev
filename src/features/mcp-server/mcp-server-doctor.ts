import path from 'node:path';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs-extra';

import {runProcess, type RunProcessResult} from '../../core/platform/process.js';
import {
  getMcpConfigRoot,
  isMcpTool,
  MCP_SETUP_TOOLS,
  type McpServerConfig,
  type McpSetupTool,
  type McpTool,
  resolveMcpConfigPath,
} from './mcp-server-setup.js';

type McpDoctorToolResult = {
  tool: McpSetupTool;
  configPath: string;
  configExists: boolean;
  configValid: boolean;
  configFormat: 'mcpServers' | 'servers' | null;
  command?: string;
  args?: string[];
  commandCheck?: {
    ok: boolean;
    command: string;
    exitCode: number;
    stdout?: string;
    stderr?: string;
  };
  handshake?: {
    ok: boolean;
    serverName?: string;
    serverVersion?: string;
    toolCount?: number;
    tools?: string[];
    stderr?: string;
    error?: string;
  };
  error?: string;
};

export type McpDoctorResult = {
  ok: boolean;
  targetDir: string;
  checkedTools: McpSetupTool[];
  results: McpDoctorToolResult[];
};

type McpDoctorOptions = {
  targetDir: string;
  tool?: McpTool;
  handshake?: boolean;
  timeoutMs?: number;
};

export async function runMcpDoctor(options: McpDoctorOptions): Promise<McpDoctorResult> {
  const tool = options.tool ?? 'all';
  if (!isMcpTool(tool)) {
    throw new Error(`--tool must be one of: all, ${MCP_SETUP_TOOLS.join(', ')}`);
  }

  const checkedTools = tool === 'all' ? MCP_SETUP_TOOLS : [tool];
  const results = [];
  for (const checkedTool of checkedTools) {
    results.push(await checkToolConfig(options.targetDir, checkedTool, options));
  }

  return {
    ok: results.every((result) => result.configValid && result.commandCheck?.ok && result.handshake?.ok !== false),
    targetDir: options.targetDir,
    checkedTools,
    results,
  };
}

async function checkToolConfig(
  targetDir: string,
  tool: McpSetupTool,
  options: McpDoctorOptions,
): Promise<McpDoctorToolResult> {
  const configPath = resolveMcpConfigPath(targetDir, tool);
  const base: McpDoctorToolResult = {
    tool,
    configPath,
    configExists: false,
    configValid: false,
    configFormat: null,
  };

  if (!(await fs.pathExists(configPath))) {
    return {...base, error: 'Config file does not exist.'};
  }

  let serverConfig: McpServerConfig;
  try {
    const raw = (await fs.readJson(configPath)) as unknown;
    const extracted = extractLdevServerConfig(raw, tool);
    if (!extracted) {
      return {...base, configExists: true, error: 'Could not find ldev server config.'};
    }
    serverConfig = extracted.serverConfig;
    base.configFormat = extracted.configFormat;
  } catch (error) {
    return {...base, configExists: true, error: error instanceof Error ? error.message : String(error)};
  }

  const commandCheck = await checkCommand(targetDir, serverConfig, options.timeoutMs ?? 5000);
  const result: McpDoctorToolResult = {
    ...base,
    configExists: true,
    configValid: true,
    command: serverConfig.command,
    args: serverConfig.args,
    commandCheck: toCommandCheck(commandCheck),
  };

  if (options.handshake === false || !commandCheck.ok) {
    return result;
  }

  return {
    ...result,
    handshake: await listToolsViaHandshake(targetDir, serverConfig, options.timeoutMs ?? 10000),
  };
}

function extractLdevServerConfig(
  raw: unknown,
  tool: McpSetupTool,
): {configFormat: 'mcpServers' | 'servers'; serverConfig: McpServerConfig} | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const configFormat = getMcpConfigRoot(tool);
  const servers = (raw as Record<string, unknown>)[configFormat];
  if (servers && typeof servers === 'object') {
    const ldev = (servers as Record<string, unknown>).ldev;
    return isMcpServerConfig(ldev, configFormat) ? {configFormat, serverConfig: ldev} : null;
  }

  return null;
}

function isMcpServerConfig(value: unknown, configFormat: 'mcpServers' | 'servers'): value is McpServerConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const config = value as {command?: unknown; args?: unknown; type?: unknown};
  return (
    (configFormat !== 'servers' || config.type === 'stdio') &&
    typeof config.command === 'string' &&
    (config.args === undefined || (Array.isArray(config.args) && config.args.every((arg) => typeof arg === 'string')))
  );
}

async function checkCommand(
  targetDir: string,
  serverConfig: McpServerConfig,
  timeoutMs: number,
): Promise<RunProcessResult> {
  const scriptPath = getNodeScriptPath(targetDir, serverConfig);
  if (scriptPath && !(await fs.pathExists(scriptPath))) {
    return {
      command: [serverConfig.command, ...(serverConfig.args ?? [])].join(' '),
      stdout: '',
      stderr: `Configured MCP server script does not exist: ${scriptPath}`,
      exitCode: 1,
      ok: false,
    };
  }

  return runProcess(serverConfig.command, [...(serverConfig.args ?? []), '--version'], {timeoutMs, reject: false});
}

function getNodeScriptPath(targetDir: string, serverConfig: McpServerConfig): string | null {
  if (serverConfig.command !== 'node') {
    return null;
  }
  const [scriptArg] = serverConfig.args ?? [];
  if (!scriptArg || scriptArg.startsWith('-')) {
    return null;
  }
  return path.isAbsolute(scriptArg) ? scriptArg : path.resolve(targetDir, scriptArg);
}

function toCommandCheck(result: RunProcessResult): NonNullable<McpDoctorToolResult['commandCheck']> {
  return {
    ok: result.ok,
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout.trim() || undefined,
    stderr: result.stderr.trim() || undefined,
  };
}

async function listToolsViaHandshake(
  targetDir: string,
  serverConfig: McpServerConfig,
  timeoutMs: number,
): Promise<NonNullable<McpDoctorToolResult['handshake']>> {
  const client = new Client({name: 'ldev-mcp-doctor', version: '0.0.0'});
  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args ?? [],
    cwd: targetDir,
    stderr: 'pipe',
  });
  const stderrChunks: Buffer[] = [];
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  try {
    await client.connect(transport, {timeout: timeoutMs});
    const toolsResult = await client.listTools(undefined, {timeout: timeoutMs});
    const serverVersion = client.getServerVersion();
    return {
      ok: true,
      serverName: serverVersion?.name,
      serverVersion: serverVersion?.version,
      toolCount: toolsResult.tools.length,
      tools: toolsResult.tools.map((tool) => tool.name).sort(),
      stderr: formatStderr(stderrChunks),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stderr: formatStderr(stderrChunks),
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function formatStderr(chunks: Buffer[]): string | undefined {
  const stderr = Buffer.concat(chunks).toString('utf8').trim();
  return stderr.length > 0 ? stderr : undefined;
}

export function formatMcpDoctor(result: McpDoctorResult): string {
  const lines = [result.ok ? 'MCP doctor passed' : 'MCP doctor found issues', `  target: ${result.targetDir}`, ''];

  for (const item of result.results) {
    lines.push(`${item.tool}:`);
    lines.push(`  config: ${item.configExists ? 'found' : 'missing'} (${item.configPath})`);
    if (item.configFormat) {
      lines.push(`  format: ${item.configFormat}`);
    }
    if (item.command) {
      lines.push(`  command: ${[item.command, ...(item.args ?? [])].join(' ')}`);
    }
    if (item.commandCheck) {
      lines.push(`  command check: ${item.commandCheck.ok ? 'ok' : `failed (${item.commandCheck.exitCode})`}`);
    }
    if (item.handshake) {
      lines.push(`  handshake: ${item.handshake.ok ? 'ok' : 'failed'}`);
      if (item.handshake.ok) {
        lines.push(
          `  server: ${item.handshake.serverName ?? 'unknown'} ${item.handshake.serverVersion ?? ''}`.trimEnd(),
        );
        lines.push(`  tools: ${item.handshake.toolCount ?? 0}`);
      }
    }
    if (item.error) {
      lines.push(`  error: ${item.error}`);
    }
    if (item.handshake?.error) {
      lines.push(`  error: ${item.handshake.error}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
