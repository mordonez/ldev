import path from 'node:path';

import {loadConfig, type AppConfig} from '../../core/config/load-config.js';
import {listGitWorktreeDetails} from '../../core/platform/git.js';

export type DashboardWorktreeResolver = {
  resolveConfig(worktreeName: string): Promise<AppConfig>;
  resolvePath(worktreeName: string): Promise<string | null>;
  resolveScopedConfig(worktreeName?: string): Promise<{cwd: string; config: AppConfig}>;
};

export function createDashboardWorktreeResolver(cwd: string): DashboardWorktreeResolver {
  return {
    resolveConfig: (worktreeName) => resolveWorktreeConfig(cwd, worktreeName),
    resolvePath: (worktreeName) => resolveWorktreePath(cwd, worktreeName),
    resolveScopedConfig: (worktreeName) => resolveScopedConfig(cwd, worktreeName),
  };
}

async function resolveWorktreePath(cwd: string, worktreeName: string): Promise<string | null> {
  const worktreeInfos = await listGitWorktreeDetails(cwd);
  const mainRepoRoot = path.resolve(cwd);
  const target = worktreeInfos.find((info) => {
    const isMain = path.normalize(info.path) === path.normalize(mainRepoRoot);
    const name = isMain ? path.basename(mainRepoRoot) : path.basename(info.path);
    return name === worktreeName;
  });
  return target?.path ?? null;
}

async function resolveWorktreeConfig(cwd: string, worktreeName: string): Promise<AppConfig> {
  const worktreePath = await resolveWorktreePath(cwd, worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  const config = loadConfig({cwd: worktreePath});
  if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
    throw new Error('No docker environment configured for this worktree');
  }

  return config;
}

async function resolveScopedConfig(cwd: string, worktreeName?: string): Promise<{cwd: string; config: AppConfig}> {
  if (!worktreeName) {
    return {
      cwd,
      config: loadConfig({cwd}),
    };
  }

  const worktreePath = await resolveWorktreePath(cwd, worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  return {
    cwd: worktreePath,
    config: loadConfig({cwd: worktreePath}),
  };
}
