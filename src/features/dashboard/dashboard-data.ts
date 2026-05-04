import path from 'node:path';

import fs from 'fs-extra';

import {loadConfig} from '../../core/config/load-config.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {collectEnvRuntimeSummary, collectEnvStatus, type EnvServiceStatus} from '../../core/runtime/env-health.js';
import {listGitWorktreeDetails} from '../../core/platform/git.js';
import {runProcess} from '../../core/platform/process.js';
import {MCP_SETUP_TOOLS, type McpSetupTool, resolveMcpConfigPath} from '../mcp-server/mcp-server-setup.js';

export type DashboardGitCommit = {
  hash: string;
  subject: string;
  date: string;
};

export type DashboardAheadBehind = {
  ahead: number;
  behind: number;
  base: string;
};

export type DashboardEnv = {
  dockerDir: string;
  portalUrl: string;
  portalReachable: boolean | null;
  services: EnvServiceStatus[];
  liferay: EnvServiceStatus | null;
};

export type DashboardWorktree = {
  name: string;
  path: string;
  branch: string | null;
  isMain: boolean;
  detached: boolean;
  env: DashboardEnv | null;
  commits: DashboardGitCommit[];
  changedFiles: number;
  changedPaths: string[];
  aheadBehind: DashboardAheadBehind | null;
};

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

export type CollectDashboardStatusOptions = {
  includeGit?: boolean;
  includeRuntimeDetails?: boolean;
};

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

async function collectWorktreeEnv(
  worktreePath: string,
  options?: {includeRuntimeDetails?: boolean},
): Promise<DashboardEnv | null> {
  if (!(await fs.pathExists(path.join(worktreePath, 'docker')))) {
    return null;
  }

  try {
    const config = loadConfig({cwd: worktreePath});
    if (!config.repoRoot || !config.dockerDir || !config.liferayDir || !config.files.dockerEnv) {
      return null;
    }
    const context = resolveEnvContext(config);
    const composeEnv = buildComposeEnv(context);

    if (options?.includeRuntimeDetails !== true) {
      const runtime = await collectEnvRuntimeSummary(context, {processEnv: composeEnv});

      return {
        dockerDir: context.dockerDir,
        portalUrl: runtime.portalUrl,
        portalReachable: null,
        services: [],
        liferay: runtime.liferay,
      };
    }

    const status = await collectEnvStatus(context, {processEnv: composeEnv});

    return {
      dockerDir: context.dockerDir,
      portalUrl: status.portalUrl,
      portalReachable: status.portalReachable,
      services: status.services,
      liferay: status.liferay,
    };
  } catch {
    return null;
  }
}

async function collectWorktreeGit(worktreePath: string): Promise<{
  commits: DashboardGitCommit[];
  changedFiles: number;
  changedPaths: string[];
}> {
  const [logResult, statusResult] = await Promise.all([
    runProcess('git', ['log', '--format=%H\t%s\t%ci', '-8', 'HEAD'], {cwd: worktreePath, reject: false}),
    runProcess('git', ['status', '--porcelain'], {cwd: worktreePath, reject: false}),
  ]);

  const commits: DashboardGitCommit[] = [];
  if (logResult.ok) {
    for (const line of logResult.stdout.split('\n').filter(Boolean)) {
      const firstTab = line.indexOf('\t');
      const rest = line.slice(firstTab + 1);
      const secondTab = rest.indexOf('\t');
      const hash = line.slice(0, firstTab);
      const subject = secondTab !== -1 ? rest.slice(0, secondTab) : rest;
      const date = secondTab !== -1 ? rest.slice(secondTab + 1).split(' ')[0] : '';
      if (hash && subject) {
        commits.push({hash: hash.slice(0, 8), subject, date});
      }
    }
  }

  const changedPaths = statusResult.ok
    ? statusResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3).trim())
        .filter(Boolean)
    : [];
  const changedFiles = changedPaths.length;

  return {commits, changedFiles, changedPaths};
}

async function collectAheadBehind(worktreePath: string): Promise<DashboardAheadBehind | null> {
  for (const base of ['origin/main', 'main', 'origin/master', 'master']) {
    const check = await runProcess('git', ['rev-parse', '--verify', base], {cwd: worktreePath, reject: false});
    if (!check.ok) continue;

    const [aResult, bResult] = await Promise.all([
      runProcess('git', ['rev-list', '--count', `${base}..HEAD`], {cwd: worktreePath, reject: false}),
      runProcess('git', ['rev-list', '--count', `HEAD..${base}`], {cwd: worktreePath, reject: false}),
    ]);

    if (!aResult.ok || !bResult.ok) continue;

    const ahead = parseInt(aResult.stdout.trim(), 10);
    const behind = parseInt(bResult.stdout.trim(), 10);
    if (!isNaN(ahead) && !isNaN(behind)) {
      return {ahead, behind, base};
    }
  }

  return null;
}

export async function collectDashboardStatus(
  cwd: string,
  options?: CollectDashboardStatusOptions,
): Promise<DashboardStatus> {
  const mainRepoRoot = path.resolve(cwd);
  const worktreeInfos = await listGitWorktreeDetails(cwd);
  const includeGit = options?.includeGit === true;
  const includeRuntimeDetails = options?.includeRuntimeDetails === true;

  const [mcp, worktrees] = await Promise.all([
    collectMcpStatus(mainRepoRoot),
    Promise.all(
      worktreeInfos
        .filter((info) => !info.prunable)
        .map(async (info) => {
          const isMain = path.normalize(info.path) === path.normalize(mainRepoRoot);
          const name = isMain ? path.basename(mainRepoRoot) : path.basename(info.path);

          const [env, {commits, changedFiles, changedPaths}, aheadBehind] = await Promise.all([
            collectWorktreeEnv(info.path, {includeRuntimeDetails}),
            includeGit
              ? collectWorktreeGit(info.path)
              : Promise.resolve({commits: [], changedFiles: 0, changedPaths: []}),
            includeGit && !isMain ? collectAheadBehind(info.path) : Promise.resolve(null),
          ]);

          return {
            name,
            path: info.path,
            branch: info.branch,
            isMain,
            detached: info.detached,
            env,
            commits,
            changedFiles,
            changedPaths,
            aheadBehind,
          } satisfies DashboardWorktree;
        }),
    ),
  ]);

  return {
    cwd: mainRepoRoot,
    refreshedAt: new Date().toISOString(),
    mcp,
    worktrees,
  };
}
