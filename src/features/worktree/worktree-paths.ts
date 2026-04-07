import path from 'node:path';

import {CliError} from '../../core/errors.js';

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

  return {
    name: normalizedName,
    branch: `fix/${normalizedName}`,
    worktreeDir,
    dockerDir: path.join(worktreeDir, 'docker'),
    envFile: path.join(worktreeDir, 'docker', '.env'),
  };
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
