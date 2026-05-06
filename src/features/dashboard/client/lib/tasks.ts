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

export function mergeTask<T extends DashboardClientTask>(tasks: T[], task?: T | null): T[] {
  if (!task?.id) return tasks;
  const withoutTask = tasks.filter((item) => item.id !== task.id);
  return [task, ...withoutTask].slice(0, 30);
}
