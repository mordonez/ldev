import path from 'node:path';

import fs from 'fs-extra';

import {loadConfig} from '../../core/config/load-config.js';
import {runProcess} from '../../core/platform/process.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {collectEnvRuntimeSummary, collectEnvStatus, type EnvServiceStatus} from '../../core/runtime/env-health.js';
import {listDashboardWorktreeRefs} from './dashboard-worktree-resolver.js';

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
  error: string | null;
  portalUrl: string;
  portalReachable: boolean | null;
  services: EnvServiceStatus[];
  liferay: EnvServiceStatus | null;
  status: 'ok' | 'error';
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

export type CollectDashboardWorktreeOptions = {
  includeGit?: boolean;
  includeRuntimeDetails?: boolean;
};

export async function collectDashboardWorktrees(
  cwd: string,
  options?: CollectDashboardWorktreeOptions,
): Promise<DashboardWorktree[]> {
  const worktrees = await listDashboardWorktreeRefs(cwd);
  const includeGit = options?.includeGit === true;
  const includeRuntimeDetails = options?.includeRuntimeDetails === true;
  const aheadBehindBaseCandidates = buildAheadBehindBaseCandidates(
    worktrees.find((info) => info.isMain)?.branch ?? worktrees[0]?.branch,
  );

  return Promise.all(
    worktrees.map(async (info) => {
      const [env, {commits, changedFiles, changedPaths}, aheadBehind] = await Promise.all([
        collectWorktreeEnv(info.path, {includeRuntimeDetails}),
        includeGit
          ? collectWorktreeGit(info.path, info.isMain ? undefined : aheadBehindBaseCandidates)
          : Promise.resolve({commits: [], changedFiles: 0, changedPaths: []}),
        includeGit && !info.isMain ? collectAheadBehind(info.path, aheadBehindBaseCandidates) : Promise.resolve(null),
      ]);

      return {
        name: info.name,
        path: info.path,
        branch: info.branch,
        isMain: info.isMain,
        detached: info.detached,
        env,
        commits,
        changedFiles,
        changedPaths,
        aheadBehind,
      } satisfies DashboardWorktree;
    }),
  );
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
        error: null,
        portalUrl: runtime.portalUrl,
        portalReachable: null,
        services: [],
        liferay: runtime.liferay,
        status: 'ok',
      };
    }

    const status = await collectEnvStatus(context, {processEnv: composeEnv});

    return {
      dockerDir: context.dockerDir,
      error: null,
      portalUrl: status.portalUrl,
      portalReachable: status.portalReachable,
      services: status.services,
      liferay: status.liferay,
      status: 'ok',
    };
  } catch (err) {
    return {
      dockerDir: path.join(worktreePath, 'docker'),
      error: err instanceof Error ? err.message : String(err),
      portalUrl: '',
      portalReachable: null,
      services: [],
      liferay: null,
      status: 'error',
    };
  }
}

async function collectWorktreeGit(
  worktreePath: string,
  baseCandidates?: string[],
): Promise<{
  commits: DashboardGitCommit[];
  changedFiles: number;
  changedPaths: string[];
}> {
  const base = baseCandidates ? await resolveFirstExistingBase(worktreePath, baseCandidates) : null;
  const logRef = base ? `${base}..HEAD` : 'HEAD';
  const [logResult, statusResult] = await Promise.all([
    runProcess('git', ['log', '--format=%H\t%s\t%ci', '-8', logRef], {cwd: worktreePath, reject: false}),
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

  return {commits, changedFiles: changedPaths.length, changedPaths};
}

function buildAheadBehindBaseCandidates(primaryBranch: string | null | undefined): string[] {
  const candidates = primaryBranch ? [primaryBranch, `origin/${primaryBranch}`] : [];

  for (const fallback of ['main', 'origin/main', 'master', 'origin/master']) {
    if (!candidates.includes(fallback)) {
      candidates.push(fallback);
    }
  }

  return candidates;
}

async function resolveFirstExistingBase(worktreePath: string, baseCandidates: string[]): Promise<string | null> {
  for (const base of baseCandidates) {
    const check = await runProcess('git', ['rev-parse', '--verify', base], {cwd: worktreePath, reject: false});
    if (check.ok) {
      return base;
    }
  }

  return null;
}

async function collectAheadBehind(
  worktreePath: string,
  baseCandidates: string[],
): Promise<DashboardAheadBehind | null> {
  for (const base of baseCandidates) {
    const check = await runProcess('git', ['rev-parse', '--verify', base], {cwd: worktreePath, reject: false});
    if (!check.ok) {
      continue;
    }

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
