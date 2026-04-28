import path from 'node:path';

import {CliError} from '../../core/errors.js';
import {areSamePath, resolveLinkedGitWorktree, type GitWorktreeInfo} from '../../core/platform/git.js';

export type WorktreeContext = {
  currentRepoRoot: string;
  mainRepoRoot: string;
  isWorktree: boolean;
  currentWorktreeName: string | null;
};

export type WorktreeTarget = {
  name: string;
  branch: string;
  worktreeDir: string;
  dockerDir: string;
  envFile: string;
};

export function resolveWorktreeContext(repoRoot: string): WorktreeContext {
  const normalized = path.resolve(repoRoot);
  const linkedWorktree = resolveLinkedGitWorktree(normalized);

  if (linkedWorktree) {
    return {
      currentRepoRoot: normalized,
      mainRepoRoot: linkedWorktree.mainRepoRoot,
      isWorktree: true,
      currentWorktreeName: linkedWorktree.worktreeName,
    };
  }

  const marker = `${path.sep}.worktrees${path.sep}`;
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex === -1) {
    return {
      currentRepoRoot: normalized,
      mainRepoRoot: normalized,
      isWorktree: false,
      currentWorktreeName: null,
    };
  }

  const mainRepoRoot = normalized.slice(0, markerIndex);
  const remainder = normalized.slice(markerIndex + marker.length);
  const currentWorktreeName = remainder.split(path.sep)[0] || null;

  return {
    currentRepoRoot: normalized,
    mainRepoRoot,
    isWorktree: true,
    currentWorktreeName,
  };
}

export function resolveWorktreeTarget(mainRepoRoot: string, name: string): WorktreeTarget {
  if (name.trim() === '') {
    throw new CliError('The worktree name cannot be empty.', {code: 'WORKTREE_NAME_REQUIRED'});
  }

  const normalizedName = name.trim();
  const worktreeDir = path.join(path.resolve(mainRepoRoot), '.worktrees', normalizedName);

  return resolveWorktreeTargetFromDir(worktreeDir, normalizedName);
}

export function resolveWorktreeTargetFromDir(
  worktreeDir: string,
  name: string,
  branch?: string | null,
): WorktreeTarget {
  if (name.trim() === '') {
    throw new CliError('The worktree name cannot be empty.', {code: 'WORKTREE_NAME_REQUIRED'});
  }

  const normalizedName = name.trim();
  const normalizedDir = path.resolve(worktreeDir);

  return {
    name: normalizedName,
    branch: branch ?? `fix/${normalizedName}`,
    worktreeDir: normalizedDir,
    dockerDir: path.join(normalizedDir, 'docker'),
    envFile: path.join(normalizedDir, 'docker', '.env'),
  };
}

export function resolveExistingWorktreeTarget(
  mainRepoRoot: string,
  name: string,
  registeredWorktrees: WorktreeRegistration[],
): WorktreeTarget | null {
  const normalizedName = name.trim();
  if (normalizedName === '') {
    return null;
  }

  const normalizedMainRepoRoot = path.resolve(mainRepoRoot);
  const matches = registeredWorktrees
    .map(normalizeWorktreeRegistration)
    .filter(
      (worktree) =>
        !areSamePath(worktree.path, normalizedMainRepoRoot) &&
        !worktree.prunable &&
        path.basename(worktree.path) === normalizedName,
    );

  if (matches.length === 0) {
    return null;
  }

  const managedPath = path.join(normalizedMainRepoRoot, '.worktrees', normalizedName);
  const managedMatch = matches.find((worktree) => areSamePath(worktree.path, managedPath));
  if (managedMatch) {
    return resolveWorktreeTargetFromDir(managedMatch.path, normalizedName, managedMatch.branch);
  }

  if (matches.length > 1) {
    throw new CliError(
      `More than one registered worktree is named '${normalizedName}': ${matches.map((item) => item.path).join(', ')}`,
      {
        code: 'WORKTREE_NAME_AMBIGUOUS',
      },
    );
  }

  return resolveWorktreeTargetFromDir(matches[0].path, normalizedName, matches[0].branch);
}

export function resolveWorktreeTargetByName(
  mainRepoRoot: string,
  name: string,
  registeredWorktrees?: WorktreeRegistration[],
): WorktreeTarget {
  const existingTarget = registeredWorktrees
    ? resolveExistingWorktreeTarget(mainRepoRoot, name, registeredWorktrees)
    : null;

  return existingTarget ?? resolveWorktreeTarget(mainRepoRoot, name);
}

export function resolveWorktreeTargetForContext(
  context: WorktreeContext,
  name?: string,
  registeredWorktrees?: WorktreeRegistration[],
): WorktreeTarget | null {
  const explicitName = name?.trim();

  if (explicitName) {
    if (context.isWorktree && context.currentWorktreeName === explicitName) {
      const current = findRegisteredWorktreeByPath(context.currentRepoRoot, registeredWorktrees);
      return resolveWorktreeTargetFromDir(context.currentRepoRoot, explicitName, current?.branch);
    }

    return resolveWorktreeTargetByName(context.mainRepoRoot, explicitName, registeredWorktrees);
  }

  if (!context.isWorktree || !context.currentWorktreeName) {
    return null;
  }

  const current = findRegisteredWorktreeByPath(context.currentRepoRoot, registeredWorktrees);
  return resolveWorktreeTargetFromDir(context.currentRepoRoot, context.currentWorktreeName, current?.branch);
}

export function resolvePortSet(name: string): {
  httpPort: string;
  debugPort: string;
  gogoPort: string;
  postgresPort: string;
  esHttpPort: string;
} {
  const hash = checksum(name);
  const offset = hash % 800;

  return {
    httpPort: String(8100 + offset),
    debugPort: String(9000 + offset),
    gogoPort: String(12000 + offset),
    postgresPort: String(5400 + offset),
    esHttpPort: String(9201 + offset),
  };
}

function checksum(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

type WorktreeRegistration = string | GitWorktreeInfo;

function normalizeWorktreeRegistration(registration: WorktreeRegistration): GitWorktreeInfo {
  if (typeof registration === 'string') {
    return {
      path: path.resolve(registration),
      branch: null,
      detached: false,
      prunable: false,
    };
  }

  return {
    ...registration,
    path: path.resolve(registration.path),
  };
}

function findRegisteredWorktreeByPath(
  worktreePath: string,
  registeredWorktrees?: WorktreeRegistration[],
): GitWorktreeInfo | null {
  if (!registeredWorktrees) {
    return null;
  }

  return (
    registeredWorktrees
      .map(normalizeWorktreeRegistration)
      .find((worktree) => areSamePath(worktree.path, worktreePath)) ?? null
  );
}
