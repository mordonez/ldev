import dashboardActions from './dashboard-actions.json';

export type DashboardOperationKey =
  | 'repo-doctor'
  | 'worktree-delete'
  | 'worktree-deploy'
  | 'worktree-doctor'
  | 'worktree-env-init'
  | 'worktree-oauth-install'
  | 'worktree-repair'
  | 'worktree-restore'
  | 'worktree-start'
  | 'worktree-stop';

export type DashboardActionDescriptor = {
  id: string;
  deployAction?: 'status' | 'cache-update';
  key: DashboardOperationKey;
  label: string;
  method: 'DELETE' | 'POST';
  previewRoute?: string;
  queueAction: string;
  repairAction?: 'restart' | 'recreate';
  route: string;
  taskKind: string;
};

export const DASHBOARD_WORKTREE_ACTIONS = dashboardActions as DashboardActionDescriptor[];

export function renderWorktreeActionRoute(route: string, worktreeName: string): string {
  return route.replace('{worktree}', encodeURIComponent(worktreeName));
}

export function renderWorktreeActionLabel(label: string, worktreeName: string): string {
  return label.replace('{worktree}', worktreeName);
}

export function worktreeActionPattern(route: string): RegExp {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{worktree\\}', '([^/]+)');
  return new RegExp(`^${escaped}$`);
}
