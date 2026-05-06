import {
  DASHBOARD_WORKTREE_ACTIONS,
  renderWorktreeActionLabel,
  worktreeActionPattern,
  type DashboardOperationKey,
} from './dashboard-action-catalog.js';

export type DashboardOperationMode = 'preview' | 'queue';

export type DashboardOperation = {
  action: string;
  deployAction?: 'status' | 'cache-update';
  key: DashboardOperationKey;
  label?: string;
  mode: DashboardOperationMode;
  repairAction?: 'restart' | 'recreate';
  response?: Record<string, unknown>;
  taskKind?: string;
  worktreeName?: string;
};

type DashboardRouteMatcher = {
  descriptor: (typeof DASHBOARD_WORKTREE_ACTIONS)[number];
  method: 'DELETE' | 'GET' | 'POST';
  mode: DashboardOperationMode;
  pattern: RegExp;
};

const routeMatchers: DashboardRouteMatcher[] = DASHBOARD_WORKTREE_ACTIONS.flatMap((descriptor) => {
  const matchers: DashboardRouteMatcher[] = [
    {
      descriptor,
      method: descriptor.method,
      mode: 'queue' as const,
      pattern: worktreeActionPattern(descriptor.route),
    },
  ];

  if (descriptor.previewRoute) {
    matchers.push({
      descriptor,
      method: 'GET' as const,
      mode: 'preview' as const,
      pattern: worktreeActionPattern(descriptor.previewRoute),
    });
  }

  return matchers;
});

export function matchDashboardOperation(method: string, url: string): DashboardOperation | null {
  if (method === 'POST' && url === '/api/doctor') {
    return {
      action: 'doctor',
      key: 'repo-doctor',
      label: 'Running repo diagnosis',
      mode: 'queue',
      response: {action: 'doctor'},
      taskKind: 'doctor',
    };
  }

  if (method === 'GET' && url === '/api/doctor') {
    return {
      action: 'doctor',
      key: 'repo-doctor',
      mode: 'preview',
    };
  }

  for (const matcher of routeMatchers) {
    if (method !== matcher.method) continue;

    const match = matcher.pattern.exec(url);
    if (!match) continue;

    const worktreeName = decodeURIComponent(match[1]);
    const response =
      matcher.descriptor.key === 'worktree-delete'
        ? {deleted: worktreeName}
        : {worktree: worktreeName, action: matcher.descriptor.queueAction};

    return {
      action: matcher.descriptor.queueAction,
      deployAction: matcher.descriptor.deployAction,
      key: matcher.descriptor.key,
      label: renderWorktreeActionLabel(matcher.descriptor.label, worktreeName),
      mode: matcher.mode,
      repairAction: matcher.descriptor.repairAction,
      response,
      taskKind: matcher.descriptor.taskKind,
      worktreeName,
    };
  }

  return null;
}

export const matchQueuedDashboardOperation = (method: string, url: string): DashboardOperation | null => {
  const operation = matchDashboardOperation(method, url);
  return operation?.mode === 'queue' ? operation : null;
};
