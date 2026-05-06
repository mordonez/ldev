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
  'cache-update': {action: 'deploy-cache-update', className: 'btn-ghost', label: 'Cache update', target: 'action'},
  db: {className: 'btn-ghost', label: 'DB sync', target: 'db'},
  delete: {className: 'btn-delete', label: 'Delete', target: 'delete'},
  'deploy-status': {action: 'deploy-status', className: 'btn-ghost', label: 'Deploy status', target: 'action'},
  logs: {className: 'btn-logs', label: 'Logs', target: 'logs'},
  'mcp-setup': {action: 'mcp-setup', className: 'btn-ghost', label: 'MCP setup', target: 'action'},
  recreate: {action: 'recreate', className: 'btn-ghost', label: 'Recreate', target: 'action'},
  resource: {className: 'btn-ghost', label: 'Resource export', target: 'resource'},
  start: {action: 'start', className: 'btn-start', label: 'Start', target: 'action'},
  stop: {action: 'stop', className: 'btn-stop', label: 'Stop', target: 'action'},
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

export function primaryActionForWorktree(
  wt: {env?: {portalReachable?: boolean | null} | null},
  running: boolean,
  stopped: boolean,
): [string, string, string] {
  if (!wt.env) return ['init-env', 'btn-start', 'Init env'];
  if (running && wt.env.portalReachable === false) return ['restart', 'btn-start', 'Restart'];
  if (stopped) return ['start', 'btn-start', 'Start'];
  return ['doctor', 'btn-ghost', 'Diagnose'];
}

export function worktreeButton(id: string, overrides: Partial<WorktreeButton> = {}): WorktreeButton {
  const button = WORKTREE_BUTTONS[id];
  if (!button) {
    throw new Error(`Unknown dashboard worktree button: ${id}`);
  }

  return {...button, ...overrides};
}
