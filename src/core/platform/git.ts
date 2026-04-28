import fs from 'node:fs';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import {runProcess} from './process.js';

export type LinkedGitWorktree = {
  mainRepoRoot: string;
  worktreeName: string;
  worktreeRoot: string;
  gitDir: string;
};

export type GitWorktreeInfo = {
  path: string;
  branch: string | null;
  detached: boolean;
  prunable: boolean;
};

export function resolveLinkedGitWorktree(repoRoot: string): LinkedGitWorktree | null {
  const worktreeRoot = path.resolve(repoRoot);
  const gitEntry = path.join(worktreeRoot, '.git');

  let stat: fs.Stats;
  try {
    stat = fs.statSync(gitEntry);
  } catch {
    return null;
  }

  if (!stat.isFile()) {
    return null;
  }

  const content = fs.readFileSync(gitEntry, 'utf8').trim();
  const match = /^gitdir:\s*(.+)$/i.exec(content);
  if (!match) {
    return null;
  }

  const gitDir = path.resolve(worktreeRoot, match[1].trim());
  const parts = path.normalize(gitDir).split(path.sep);
  const gitIndex = parts.lastIndexOf('.git');

  if (gitIndex <= 0 || parts[gitIndex + 1] !== 'worktrees' || gitIndex + 2 >= parts.length) {
    return null;
  }

  return {
    mainRepoRoot: path.resolve(parts.slice(0, gitIndex).join(path.sep) || path.sep),
    worktreeName: path.basename(worktreeRoot),
    worktreeRoot,
    gitDir,
  };
}

export function areSamePath(left: string, right: string): boolean {
  return normalizePathForComparison(left) === normalizePathForComparison(right);
}

export function normalizePathForComparison(value: string): string {
  let resolved = path.resolve(value);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch {
    // Missing paths can still be compared lexically during worktree creation.
  }

  const normalized = path.normalize(resolved);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

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
  if (resolveLinkedGitWorktree(cwd)) {
    return true;
  }

  if (path.normalize(cwd).includes(`${path.sep}.worktrees${path.sep}`)) {
    return true;
  }

  const repoRoot = await getRepoRoot(cwd);
  if (!repoRoot) {
    return false;
  }

  const normalized = path.normalize(repoRoot);
  return resolveLinkedGitWorktree(repoRoot) !== null || normalized.includes(`${path.sep}.worktrees${path.sep}`);
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
  return (await listGitWorktreeDetails(cwd)).map((worktree) => worktree.path);
}

export async function listGitWorktreeDetails(cwd: string): Promise<GitWorktreeInfo[]> {
  const result = await runProcess('git', ['worktree', 'list', '--porcelain'], {cwd});
  if (!result.ok) {
    return [];
  }

  const worktrees: GitWorktreeInfo[] = [];
  let current: GitWorktreeInfo | null = null;

  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) {
        worktrees.push(current);
      }
      current = {
        path: path.normalize(line.slice('worktree '.length).trim()),
        branch: null,
        detached: false,
        prunable: false,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim();
      current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }

  if (current) {
    worktrees.push(current);
  }

  return worktrees;
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
