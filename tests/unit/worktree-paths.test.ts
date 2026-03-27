import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {resolvePortSet, resolveWorktreeContext, resolveWorktreeTarget} from '../../src/features/worktree/worktree-paths.js';

describe('worktree paths', () => {
  test('detects main checkout and nested worktree paths', () => {
    expect(resolveWorktreeContext('/repo')).toEqual({
      currentRepoRoot: '/repo',
      mainRepoRoot: '/repo',
      isWorktree: false,
      currentWorktreeName: null,
    });

    expect(resolveWorktreeContext('/repo/.worktrees/issue-123')).toEqual({
      currentRepoRoot: '/repo/.worktrees/issue-123',
      mainRepoRoot: '/repo',
      isWorktree: true,
      currentWorktreeName: 'issue-123',
    });
  });

  test('builds worktree target paths and stable port sets', () => {
    const target = resolveWorktreeTarget('/repo', 'issue-123');
    expect(target.worktreeDir).toBe(path.join('/repo', '.worktrees', 'issue-123'));
    expect(target.branch).toBe('fix/issue-123');

    expect(resolvePortSet('issue-123')).toEqual(resolvePortSet('issue-123'));
    expect(resolvePortSet('issue-123').httpPort).not.toBe(resolvePortSet('issue-124').httpPort);
  });
});
