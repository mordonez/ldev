import worktreeActions from '../../dashboard-actions.json';

export const WORKTREE_ACTIONS = Object.fromEntries(worktreeActions.map((action) => [action.id, action]));

function renderRoute(route, name) {
  return route.replace('{worktree}', encodeURIComponent(name));
}

export function actionKind(action) {
  return WORKTREE_ACTIONS[action]?.taskKind ?? `worktree-${action}`;
}

export function actionUrl(name, action) {
  return WORKTREE_ACTIONS[action]?.route
    ? renderRoute(WORKTREE_ACTIONS[action].route, name)
    : `/api/worktrees/${encodeURIComponent(name)}/${action}`;
}

export function previewUrl(name, action) {
  const route = WORKTREE_ACTIONS[action]?.previewRoute;
  return route ? renderRoute(route, name) : actionUrl(name, action);
}

export function primaryActionForWorktree(wt, running, stopped) {
  if (!wt.env) return ['init-env', 'btn-start', 'Init env'];
  if (running && wt.env.portalReachable === false) return ['restart', 'btn-start', 'Restart'];
  if (stopped) return ['start', 'btn-start', 'Start'];
  return ['doctor', 'btn-ghost', 'Diagnose'];
}
