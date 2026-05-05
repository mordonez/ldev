type QueuedDashboardOperation = {
  action: string;
  key:
    | 'repo-doctor'
    | 'worktree-delete'
    | 'worktree-deploy'
    | 'worktree-doctor'
    | 'worktree-env-init'
    | 'worktree-repair'
    | 'worktree-start'
    | 'worktree-stop';
  label: string;
  response: Record<string, unknown>;
  taskKind: string;
  worktreeName?: string;
};

export type DashboardQueuedOperation = QueuedDashboardOperation & {
  deployAction?: 'status' | 'cache-update';
  repairAction?: 'restart' | 'recreate';
};

type WorktreeActionDescriptor = {
  action: string;
  key: DashboardQueuedOperation['key'];
  label: (worktreeName: string, match: RegExpExecArray) => string;
  method: 'DELETE' | 'POST';
  pattern: RegExp;
  responseAction?: string;
  taskKind: (match: RegExpExecArray) => string;
};

const WORKTREE_ACTIONS: WorktreeActionDescriptor[] = [
  {
    action: 'start',
    key: 'worktree-start',
    label: (worktreeName) => `Starting environment for ${worktreeName}`,
    method: 'POST',
    pattern: /^\/api\/worktrees\/([^/]+)\/start$/,
    taskKind: () => 'worktree-start',
  },
  {
    action: 'env-init',
    key: 'worktree-env-init',
    label: (worktreeName) => `Initializing environment for ${worktreeName}`,
    method: 'POST',
    pattern: /^\/api\/worktrees\/([^/]+)\/env\/init$/,
    taskKind: () => 'worktree-env-init',
  },
  {
    action: 'doctor',
    key: 'worktree-doctor',
    label: (worktreeName) => `Running diagnosis for ${worktreeName}`,
    method: 'POST',
    pattern: /^\/api\/worktrees\/([^/]+)\/doctor$/,
    taskKind: () => 'doctor',
  },
  {
    action: 'repair',
    key: 'worktree-repair',
    label: (worktreeName, match) =>
      `${match[2] === 'restart' ? 'Restarting' : 'Recreating'} environment for ${worktreeName}`,
    method: 'POST',
    pattern: /^\/api\/worktrees\/([^/]+)\/env\/(restart|recreate)$/,
    responseAction: 'repair',
    taskKind: (match) => `env-${match[2]}`,
  },
  {
    action: 'deploy',
    key: 'worktree-deploy',
    label: (worktreeName, match) =>
      match[2] === 'status'
        ? `Checking deploy status for ${worktreeName}`
        : `Updating deploy cache for ${worktreeName}`,
    method: 'POST',
    pattern: /^\/api\/worktrees\/([^/]+)\/deploy\/(status|cache-update)$/,
    responseAction: 'deploy',
    taskKind: (match) => `deploy-${match[2]}`,
  },
  {
    action: 'stop',
    key: 'worktree-stop',
    label: (worktreeName) => `Stopping environment for ${worktreeName}`,
    method: 'POST',
    pattern: /^\/api\/worktrees\/([^/]+)\/stop$/,
    taskKind: () => 'worktree-stop',
  },
  {
    action: 'delete',
    key: 'worktree-delete',
    label: (worktreeName) => `Deleting worktree ${worktreeName}`,
    method: 'DELETE',
    pattern: /^\/api\/worktrees\/([^/]+)$/,
    taskKind: () => 'worktree-delete',
  },
];

export function matchQueuedDashboardOperation(method: string, url: string): DashboardQueuedOperation | null {
  if (method === 'POST' && url === '/api/doctor') {
    return {
      action: 'doctor',
      key: 'repo-doctor',
      label: 'Running repo diagnosis',
      response: {action: 'doctor'},
      taskKind: 'doctor',
    };
  }

  for (const descriptor of WORKTREE_ACTIONS) {
    if (method !== descriptor.method) continue;

    const match = descriptor.pattern.exec(url);
    if (!match) continue;

    const worktreeName = decodeURIComponent(match[1]);
    const operation: DashboardQueuedOperation = {
      action: descriptor.responseAction ?? descriptor.action,
      key: descriptor.key,
      label: descriptor.label(worktreeName, match),
      response:
        descriptor.key === 'worktree-delete'
          ? {deleted: worktreeName}
          : {worktree: worktreeName, action: descriptor.responseAction ?? descriptor.action},
      taskKind: descriptor.taskKind(match),
      worktreeName,
    };

    if (descriptor.key === 'worktree-repair') {
      operation.repairAction = match[2] as 'restart' | 'recreate';
      operation.action = operation.repairAction;
      operation.response.action = operation.repairAction;
    }
    if (descriptor.key === 'worktree-deploy') {
      operation.deployAction = match[2] as 'status' | 'cache-update';
      operation.action = `deploy-${operation.deployAction}`;
      operation.response.action = `deploy-${operation.deployAction}`;
    }

    return operation;
  }

  return null;
}
