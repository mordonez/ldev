import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {
  resolvePortSet,
  resolveWorktreeContext,
  resolveWorktreeTarget,
} from '../../src/features/worktree/worktree-paths.js';

describe('worktree paths', () => {
  test('detects main checkout and nested worktree paths', () => {
    expect(resolveWorktreeContext('/repo')).toEqual({
      currentRepoRoot: path.resolve('/repo'),
      mainRepoRoot: path.resolve('/repo'),
      isWorktree: false,
      currentWorktreeName: null,
    });

    expect(resolveWorktreeContext('/repo/.worktrees/issue-123')).toEqual({
      currentRepoRoot: path.resolve('/repo/.worktrees/issue-123'),
      mainRepoRoot: path.resolve('/repo'),
      isWorktree: true,
      currentWorktreeName: 'issue-123',
    });
  });

  test('builds worktree target paths and stable port sets', () => {
    const target = resolveWorktreeTarget('/repo', 'issue-123');
    expect(path.normalize(target.worktreeDir)).toBe(
      path.normalize(path.join(path.resolve('/repo'), '.worktrees', 'issue-123')),
    );
    expect(target.branch).toBe('fix/issue-123');

    expect(resolvePortSet('issue-123')).toEqual(resolvePortSet('issue-123'));
    expect(resolvePortSet('issue-123').httpPort).not.toBe(resolvePortSet('issue-124').httpPort);
  });
});
