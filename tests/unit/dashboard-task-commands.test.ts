import {describe, expect, test} from 'vitest';

import {queueDashboardTaskOnce, serializeDashboardTask} from '../../src/entrypoints/dashboard/dashboard-task-commands.js';
import {createDashboardTaskManager} from '../../src/entrypoints/dashboard/dashboard-tasks.js';

describe('dashboard task commands', () => {
  test('deduplicates the same active task kind for the same worktree', () => {
    const taskManager = createDashboardTaskManager();
    const first = queueDashboardTaskOnce(
      taskManager,
      {kind: 'worktree-start', label: 'Start demo', worktreeName: 'demo'},
      () => new Promise(() => {}),
    );

    const second = queueDashboardTaskOnce(
      taskManager,
      {kind: 'worktree-start', label: 'Start demo', worktreeName: 'demo'},
      () => Promise.resolve(),
    );

    expect(first.blocked).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.task.id).toBe(first.task.id);
  });

  test('blocks a different active task for the same worktree', () => {
    const taskManager = createDashboardTaskManager();
    const first = queueDashboardTaskOnce(
      taskManager,
      {kind: 'db-sync', label: 'DB sync for demo', worktreeName: 'demo'},
      () => new Promise(() => {}),
    );

    const second = queueDashboardTaskOnce(
      taskManager,
      {kind: 'worktree-start', label: 'Start demo', worktreeName: 'demo'},
      () => Promise.resolve(),
    );

    expect(second.blocked).toBe(true);
    expect(second.duplicate).toBe(false);
    expect(second.task.id).toBe(first.task.id);
  });

  test('serializes task logs by value', () => {
    const taskManager = createDashboardTaskManager();
    const queued = queueDashboardTaskOnce(taskManager, {kind: 'instant', label: 'Instant'}, async (printer) => {
      await Promise.resolve();
      printer.info('hello');
    });

    const snapshot = serializeDashboardTask(queued.task);
    expect(snapshot.logs).not.toBe(queued.task.logs);
  });
});
