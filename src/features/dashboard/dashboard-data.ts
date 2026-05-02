import path from 'node:path';

import fs from 'fs-extra';

import {loadConfig} from '../../core/config/load-config.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {collectEnvStatus, type EnvServiceStatus} from '../../core/runtime/env-health.js';
import {listGitWorktreeDetails} from '../../core/platform/git.js';
import {runProcess} from '../../core/platform/process.js';

export type DashboardGitCommit = {
  hash: string;
  subject: string;
  date: string;
};

export type DashboardEnv = {
  dockerDir: string;
  portalUrl: string;
  portalReachable: boolean;
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
};

export type DashboardStatus = {
  cwd: string;
  refreshedAt: string;
  worktrees: DashboardWorktree[];
};

async function collectWorktreeEnv(worktreePath: string): Promise<DashboardEnv | null> {
  if (!(await fs.pathExists(path.join(worktreePath, 'docker')))) {
    return null;
  }

  try {
    const config = loadConfig({cwd: worktreePath});
    if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
      return null;
    }
    const context = resolveEnvContext(config);
    const composeEnv = buildComposeEnv(context);
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

  const changedFiles = statusResult.ok ? statusResult.stdout.split('\n').filter(Boolean).length : 0;

  return {commits, changedFiles};
}

export async function collectDashboardStatus(cwd: string): Promise<DashboardStatus> {
  const mainRepoRoot = path.resolve(cwd);
  const worktreeInfos = await listGitWorktreeDetails(cwd);

  const worktrees = await Promise.all(
    worktreeInfos
      .filter((info) => !info.prunable)
      .map(async (info) => {
        const isMain = path.normalize(info.path) === path.normalize(mainRepoRoot);
        const name = isMain ? path.basename(mainRepoRoot) : path.basename(info.path);

        const [env, {commits, changedFiles}] = await Promise.all([
          collectWorktreeEnv(info.path),
          collectWorktreeGit(info.path),
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
        } satisfies DashboardWorktree;
      }),
  );

  return {
    cwd: mainRepoRoot,
    refreshedAt: new Date().toISOString(),
    worktrees,
  };
}
