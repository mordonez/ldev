export const WORKTREE_ACTIONS = {
  'init-env': {
    taskKind: 'worktree-env-init',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/env/init`,
  },
  start: {
    taskKind: 'worktree-start',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/start`,
  },
  stop: {
    taskKind: 'worktree-stop',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/stop`,
  },
  doctor: {
    taskKind: 'doctor',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/doctor`,
  },
  'mcp-setup': {
    taskKind: 'mcp-setup',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/mcp/setup`,
  },
  restart: {
    taskKind: 'env-restart',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/env/restart`,
  },
  recreate: {
    taskKind: 'env-recreate',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/env/recreate`,
  },
  'deploy-status': {
    taskKind: 'deploy-status',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/deploy/status`,
  },
  'deploy-cache-update': {
    taskKind: 'deploy-cache-update',
    url: (name) => `/api/worktrees/${encodeURIComponent(name)}/deploy/cache-update`,
  },
};

export function actionKind(action) {
  return WORKTREE_ACTIONS[action]?.taskKind ?? `worktree-${action}`;
}

export function actionUrl(name, action) {
  return WORKTREE_ACTIONS[action]?.url(name) ?? `/api/worktrees/${encodeURIComponent(name)}/${action}`;
}

export function primaryActionForWorktree(wt, running, stopped) {
  if (!wt.env) return ['init-env', 'btn-start', 'Init env'];
  if (running && wt.env.portalReachable === false) return ['restart', 'btn-start', 'Restart'];
  if (stopped) return ['start', 'btn-start', 'Start'];
  return ['doctor', 'btn-ghost', 'Diagnose'];
}
