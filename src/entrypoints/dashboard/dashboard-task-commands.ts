import type http from 'node:http';

import {writeJson} from './dashboard-http.js';
import type {createDashboardTaskManager, DashboardTask} from './dashboard-tasks.js';

type DashboardTaskManager = ReturnType<typeof createDashboardTaskManager>;
type DashboardTaskRun = Parameters<DashboardTaskManager['startTask']>[1];

export type QueuedDashboardTask = {
  blocked: boolean;
  duplicate: boolean;
  task: DashboardTask;
};

export function serializeDashboardTask(task: DashboardTask): DashboardTask {
  return {
    ...task,
    logs: task.logs.map((entry) => ({...entry})),
  };
}

export function queueDashboardTaskOnce(
  taskManager: DashboardTaskManager,
  options: {kind: string; label: string; worktreeName?: string | null},
  run: DashboardTaskRun,
): QueuedDashboardTask {
  const existingTask = taskManager.findRunningTask(options);
  if (existingTask) {
    return {blocked: false, duplicate: true, task: existingTask};
  }

  const activeWorktreeTask = options.worktreeName ? taskManager.findActiveWorktreeTask(options.worktreeName) : null;
  if (activeWorktreeTask) {
    return {blocked: true, duplicate: false, task: activeWorktreeTask};
  }

  return {blocked: false, duplicate: false, task: taskManager.startTask(options, run)};
}

export function writeDashboardTaskBlocked(
  res: http.ServerResponse,
  queued: QueuedDashboardTask,
  worktreeName: string,
): void {
  writeJson(res, 409, {
    error: `Task already running for ${worktreeName}: ${queued.task.label}`,
    task: serializeDashboardTask(queued.task),
    taskId: queued.task.id,
  });
}

export function writeDashboardTaskAccepted(
  res: http.ServerResponse,
  queued: QueuedDashboardTask,
  response: Record<string, unknown>,
): void {
  writeJson(res, 202, {
    ok: true,
    task: serializeDashboardTask(queued.task),
    taskId: queued.task.id,
    ...response,
    duplicate: queued.duplicate,
  });
}

export function queueDashboardTaskResponse(options: {
  taskManager: DashboardTaskManager;
  res: http.ServerResponse;
  task: {kind: string; label: string; worktreeName?: string | null};
  run: DashboardTaskRun;
  response?: Record<string, unknown>;
  scopeLabel?: string;
}): QueuedDashboardTask {
  const queued = queueDashboardTaskOnce(options.taskManager, options.task, options.run);
  if (queued.blocked) {
    writeDashboardTaskBlocked(options.res, queued, options.scopeLabel ?? options.task.worktreeName ?? 'repository');
    return queued;
  }

  writeDashboardTaskAccepted(options.res, queued, options.response ?? {});
  return queued;
}
