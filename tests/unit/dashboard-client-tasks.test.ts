import {describe, expect, test} from 'vitest';

import {changedTaskState, mergeTask} from '../../src/features/dashboard/client/lib/tasks.js';

describe('dashboard client tasks', () => {
  test('detects newly queued running tasks as state changes', () => {
    expect(changedTaskState([], [{id: 'task-1', status: 'running'}])).toBe(true);
  });

  test('merges a queued task immediately and keeps latest state first', () => {
    const existing = [{id: 'task-1', status: 'running', kind: 'worktree-start'}];
    const queued = {id: 'task-2', status: 'running', kind: 'worktree-stop', worktreeName: 'demo'};

    expect(mergeTask(existing, queued)).toEqual([queued, ...existing]);
    expect(mergeTask([queued, ...existing], {...queued, status: 'succeeded'})).toEqual([
      {...queued, status: 'succeeded'},
      ...existing,
    ]);
  });
});
