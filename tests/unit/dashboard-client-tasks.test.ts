import {describe, expect, test} from 'vitest';

import {
  changedTaskState,
  isTaskCollapsed,
  mergeTask,
  reconcileTaskViewState,
  shouldAutoCollapseTask,
} from '../../src/entrypoints/dashboard/client/lib/tasks.js';

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

  test('collapses success and failed tasks by default but keeps active and canceled tasks open', () => {
    expect(isTaskCollapsed({id: 'task-1', status: 'running'})).toBe(false);
    expect(isTaskCollapsed({id: 'task-2', status: 'succeeded'})).toBe(true);
    expect(isTaskCollapsed({id: 'task-3', status: 'failed'})).toBe(true);
    expect(isTaskCollapsed({id: 'task-4', status: 'canceled'})).toBe(false);
    expect(isTaskCollapsed({id: 'task-2', status: 'succeeded'}, {'task-2': false})).toBe(false);
    expect(shouldAutoCollapseTask({id: 'task-4', status: 'canceled'})).toBe(false);
  });

  test('prunes dismissed and collapsed ids that no longer exist', () => {
    expect(
      reconcileTaskViewState(
        [
          {id: 'task-1', status: 'running'},
          {id: 'task-2', status: 'failed'},
        ],
        ['task-2', 'task-3'],
        {'task-1': true, 'task-3': false},
      ),
    ).toEqual({
      dismissedTaskIds: ['task-2'],
      collapsedTaskIds: {'task-1': true},
    });
  });
});
