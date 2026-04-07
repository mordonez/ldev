import {describe, expect, test} from 'vitest';

import {resolveWorktreeTarget} from '../../src/features/worktree/worktree-paths.js';

describe('cleanup guardrails', () => {
  test('worktree target stays inside the .worktrees perimeter', () => {
    const target = resolveWorktreeTarget('/repo', 'issue-42');
    expect(target.worktreeDir).toContain('/repo/.worktrees/issue-42');
  });
});
