export {actionKind} from './actions.js';

type DashboardClientTask = {
  id: string;
  kind?: string;
  status: string;
  worktreeName?: string;
};

export function taskTime(value: string): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export function changedTaskState(previous: DashboardClientTask[], next: DashboardClientTask[]): boolean {
  if (previous.length !== next.length) return true;
  return next.some(
    (task, index) => !previous[index] || previous[index].id !== task.id || previous[index].status !== task.status,
  );
}

export function isActiveTask(task: DashboardClientTask): boolean {
  return task.status === 'running' || task.status === 'canceling';
}

export function shouldAutoCollapseTask(task: DashboardClientTask): boolean {
  return task.status === 'succeeded' || task.status === 'failed';
}

export function isTaskCollapsed(task: DashboardClientTask, collapsedTaskIds: Record<string, boolean> = {}): boolean {
  if (task.id in collapsedTaskIds) {
    return collapsedTaskIds[task.id];
  }

  return shouldAutoCollapseTask(task);
}

export function reconcileTaskViewState(
  tasks: DashboardClientTask[],
  dismissedTaskIds: string[] = [],
  collapsedTaskIds: Record<string, boolean> = {},
): {dismissedTaskIds: string[]; collapsedTaskIds: Record<string, boolean>} {
  const validTaskIds = new Set(tasks.map((task) => task.id));
  const nextDismissedTaskIds = dismissedTaskIds.filter((taskId) => validTaskIds.has(taskId));
  const nextCollapsedTaskIds = Object.fromEntries(
    Object.entries(collapsedTaskIds).filter(([taskId]) => validTaskIds.has(taskId)),
  );

  return {
    dismissedTaskIds: nextDismissedTaskIds,
    collapsedTaskIds: nextCollapsedTaskIds,
  };
}

export function mergeTask<T extends DashboardClientTask>(tasks: T[], task?: T | null): T[] {
  if (!task?.id) return tasks;
  const withoutTask = tasks.filter((item) => item.id !== task.id);
  return [task, ...withoutTask].slice(0, 30);
}
