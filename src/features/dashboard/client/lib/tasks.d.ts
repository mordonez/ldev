type DashboardClientTask = {
  id: string;
  kind?: string;
  status: string;
  worktreeName?: string;
};

export function changedTaskState(previous: DashboardClientTask[], next: DashboardClientTask[]): boolean;
export function mergeTask<T extends DashboardClientTask>(tasks: T[], task?: T | null): T[];
