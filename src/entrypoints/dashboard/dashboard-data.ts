import path from 'node:path';

import fs from 'fs-extra';

import {MCP_SETUP_TOOLS, type McpSetupTool, resolveMcpConfigPath} from '../mcp-server/mcp-server-setup.js';
import {
  collectDashboardWorktrees,
  type CollectDashboardWorktreeOptions,
  type DashboardWorktree,
} from './dashboard-worktree-snapshot.js';

export type DashboardMcpClientStatus = {
  tool: McpSetupTool;
  configPath: string;
  configExists: boolean;
};

export type DashboardMcpStatus = {
  targetDir: string;
  clients: DashboardMcpClientStatus[];
};

export type DashboardStatus = {
  cwd: string;
  refreshedAt: string;
  mcp: DashboardMcpStatus;
  worktrees: DashboardWorktree[];
};

export type CollectDashboardStatusOptions = CollectDashboardWorktreeOptions;

async function collectMcpStatus(cwd: string): Promise<DashboardMcpStatus> {
  const clients = await Promise.all(
    MCP_SETUP_TOOLS.map(async (tool) => {
      const configPath = resolveMcpConfigPath(cwd, tool);

      return {
        tool,
        configPath,
        configExists: await fs.pathExists(configPath),
      } satisfies DashboardMcpClientStatus;
    }),
  );

  return {
    targetDir: cwd,
    clients,
  };
}

export async function collectDashboardStatus(
  cwd: string,
  options?: CollectDashboardStatusOptions,
): Promise<DashboardStatus> {
  const mainRepoRoot = path.resolve(cwd);
  const [mcp, worktrees] = await Promise.all([collectMcpStatus(mainRepoRoot), collectDashboardWorktrees(cwd, options)]);

  return {
    cwd: mainRepoRoot,
    refreshedAt: new Date().toISOString(),
    mcp,
    worktrees,
  };
}
