import worktreeActions from '../../dashboard-actions.json';

type WorktreeActionDescriptor = (typeof worktreeActions)[number];
type WorktreeButton = {
  action?: string;
  className: string;
  disabled?: boolean;
  label: string;
  target: string;
};

export const WORKTREE_ACTIONS = Object.fromEntries(worktreeActions.map((action) => [action.id, action])) as Record<
  string,
  WorktreeActionDescriptor | undefined
>;

const WORKTREE_BUTTONS: Partial<Record<string, WorktreeButton>> = {
  db: {className: 'btn-ghost', label: 'DB sync', target: 'db'},
  logs: {className: 'btn-logs', label: 'Logs', target: 'logs'},
  resource: {className: 'btn-ghost', label: 'Resource export', target: 'resource'},
};

const ACTION_BUTTONS: Partial<Record<string, Pick<WorktreeButton, 'className' | 'label' | 'target'>>> = {
  'deploy-cache-update': {className: 'btn-ghost', label: 'Cache update', target: 'action'},
  'deploy-status': {className: 'btn-ghost', label: 'Deploy status', target: 'action'},
  delete: {className: 'btn-delete', label: 'Delete', target: 'delete'},
  'oauth-install': {className: 'btn-ghost', label: 'OAuth install', target: 'action'},
  recreate: {className: 'btn-ghost', label: 'Recreate', target: 'action'},
  restore: {className: 'btn-ghost', label: 'Restore', target: 'restore'},
  start: {className: 'btn-start', label: 'Start', target: 'action'},
  stop: {className: 'btn-stop', label: 'Stop', target: 'action'},
};

function renderRoute(route: string, name: string): string {
  return route.replace('{worktree}', encodeURIComponent(name));
}

export function actionKind(action: string): string {
  return WORKTREE_ACTIONS[action]?.taskKind ?? `worktree-${action}`;
}

export function actionUrl(name: string, action: string): string {
  return WORKTREE_ACTIONS[action]?.route
    ? renderRoute(WORKTREE_ACTIONS[action].route, name)
    : `/api/worktrees/${encodeURIComponent(name)}/${action}`;
}

export function previewUrl(name: string, action: string): string {
  const route = WORKTREE_ACTIONS[action]?.previewRoute;
  return route ? renderRoute(route, name) : actionUrl(name, action);
}

export type PrimaryAction = {action: string; className: string; label: string};

export function primaryActionForWorktree(
  wt: {env?: {portalReachable?: boolean | null} | null},
  running: boolean,
  stopped: boolean,
): PrimaryAction {
  if (!wt.env) return {action: 'init-env', className: 'btn-start', label: 'Init env'};
  if (running && wt.env.portalReachable === false) return {action: 'restart', className: 'btn-start', label: 'Restart'};
  if (stopped) return {action: 'start', className: 'btn-start', label: 'Start'};
  return {action: 'doctor', className: 'btn-ghost', label: 'Diagnose'};
}

export function worktreeButton(id: string, overrides: Partial<WorktreeButton> = {}): WorktreeButton {
  const action = WORKTREE_ACTIONS[id];
  const actionButton = action ? ACTION_BUTTONS[action.queueAction] : undefined;
  const button = action && actionButton ? {action: action.queueAction, ...actionButton} : WORKTREE_BUTTONS[id];
  if (!button) {
    throw new Error(`Unknown dashboard worktree button: ${id}`);
  }

  return {...button, ...overrides};
}
