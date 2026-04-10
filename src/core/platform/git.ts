import path from 'node:path';

import {CliError} from '../../core/errors.js';
import {runProcess} from './process.js';

export async function getRepoRoot(cwd: string): Promise<string | null> {
  const result = await runProcess('git', ['rev-parse', '--show-toplevel'], {cwd});
  return result.ok ? result.stdout.trim() : null;
}

export async function getGitCommonDir(cwd: string): Promise<string | null> {
  const result = await runProcess('git', ['rev-parse', '--git-common-dir'], {cwd});
  return result.ok ? result.stdout.trim() : null;
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  const result = await runProcess('git', ['rev-parse', '--is-inside-work-tree'], {cwd});
  return result.ok && result.stdout.trim() === 'true';
}

export async function isWorktree(cwd: string): Promise<boolean> {
  const repoRoot = await getRepoRoot(cwd);
  if (!repoRoot) {
    return false;
  }

  const normalized = path.normalize(repoRoot);
  return normalized.includes(`${path.sep}.worktrees${path.sep}`);
}

export async function initializeGitRepository(cwd: string): Promise<void> {
  await runGit(cwd, ['init']);
}

export async function getGitRemoteUrl(cwd: string, remote: string): Promise<string | null> {
  const result = await runProcess('git', ['remote', 'get-url', remote], {cwd});
  return result.ok ? result.stdout.trim() : null;
}

export async function getCurrentBranchName(cwd: string): Promise<string | null> {
  const result = await runProcess('git', ['branch', '--show-current'], {cwd});
  if (!result.ok) {
    return null;
  }

  const branch = result.stdout.trim();
  return branch === '' ? null : branch;
}

export async function ensureGitRemote(cwd: string, remote: string, url: string): Promise<'created' | 'existing'> {
  const existing = await getGitRemoteUrl(cwd, remote);
  if (existing) {
    return 'existing';
  }

  await runGit(cwd, ['remote', 'add', remote, url]);
  return 'created';
}

export async function gitAddAll(cwd: string): Promise<void> {
  await runGit(cwd, ['add', '-A']);
}

export async function gitAddPaths(cwd: string, paths: string[]): Promise<void> {
  const uniquePaths = Array.from(new Set(paths.map((item) => item.trim()).filter((item) => item !== '')));

  if (uniquePaths.length === 0) {
    return;
  }

  await runGit(cwd, ['add', '--', ...uniquePaths]);
}

export async function hasStagedChanges(cwd: string): Promise<boolean> {
  const result = await runProcess('git', ['diff', '--cached', '--quiet'], {cwd});
  return !result.ok;
}

export async function gitCommit(cwd: string, message: string): Promise<void> {
  await runGit(cwd, ['commit', '-m', message]);
}

export async function gitSubtreeAdd(options: {
  cwd: string;
  prefix: string;
  remote: string;
  ref: string;
  squash?: boolean;
}): Promise<void> {
  const args = ['subtree', 'add', `--prefix=${options.prefix}`, options.remote, options.ref];

  if (options.squash ?? true) {
    args.push('--squash');
  }

  await runGit(options.cwd, args);
}

export async function addGitWorktree(options: {
  cwd: string;
  path: string;
  branch: string;
  startRef?: string;
}): Promise<void> {
  const branchExists = await runProcess('git', ['show-ref', '--verify', '--quiet', `refs/heads/${options.branch}`], {
    cwd: options.cwd,
  });

  const args = branchExists.ok
    ? ['worktree', 'add', options.path, options.branch]
    : ['worktree', 'add', '-b', options.branch, options.path, options.startRef ?? 'HEAD'];

  await runGit(options.cwd, args);
}

export async function listGitWorktrees(cwd: string): Promise<string[]> {
  const result = await runProcess('git', ['worktree', 'list', '--porcelain'], {cwd});
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => path.normalize(line.slice('worktree '.length).trim()));
}

export async function removeGitWorktree(cwd: string, worktreePath: string): Promise<void> {
  await runGit(cwd, ['worktree', 'remove', '--force', worktreePath]);
}

export async function pruneGitWorktrees(cwd: string): Promise<void> {
  await runGit(cwd, ['worktree', 'prune']);
}

export async function deleteGitBranch(cwd: string, branch: string): Promise<void> {
  await runGit(cwd, ['branch', '-D', branch]);
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  const result = await runProcess('git', args, {cwd});
  if (!result.ok) {
    const detail = result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')}`;
    throw new CliError(detail, {code: 'GIT_ERROR'});
  }
}
