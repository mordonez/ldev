import {describe, expect, test} from 'vitest';

import {matchQueuedDashboardOperation} from '../../src/features/dashboard/dashboard-operation-dispatcher.js';

describe('matchQueuedDashboardOperation', () => {
  test('normalizes repository diagnosis into a queued operation', () => {
    expect(matchQueuedDashboardOperation('POST', '/api/doctor')).toMatchObject({
      action: 'doctor',
      key: 'repo-doctor',
      label: 'Running repo diagnosis',
      response: {action: 'doctor'},
      taskKind: 'doctor',
    });
  });

  test('normalizes worktree lifecycle actions with decoded worktree names', () => {
    expect(matchQueuedDashboardOperation('POST', '/api/worktrees/feature%2Fone/start')).toMatchObject({
      action: 'start',
      key: 'worktree-start',
      label: 'Starting environment for feature/one',
      response: {worktree: 'feature/one', action: 'start'},
      taskKind: 'worktree-start',
      worktreeName: 'feature/one',
    });

    expect(matchQueuedDashboardOperation('POST', '/api/worktrees/demo/env/recreate')).toMatchObject({
      action: 'recreate',
      key: 'worktree-repair',
      repairAction: 'recreate',
      response: {worktree: 'demo', action: 'recreate'},
      taskKind: 'env-recreate',
      worktreeName: 'demo',
    });
  });

  test('normalizes deploy and delete operations', () => {
    expect(matchQueuedDashboardOperation('POST', '/api/worktrees/demo/deploy/cache-update')).toMatchObject({
      action: 'deploy-cache-update',
      deployAction: 'cache-update',
      key: 'worktree-deploy',
      response: {worktree: 'demo', action: 'deploy-cache-update'},
      taskKind: 'deploy-cache-update',
    });

    expect(matchQueuedDashboardOperation('DELETE', '/api/worktrees/demo')).toMatchObject({
      action: 'delete',
      key: 'worktree-delete',
      response: {deleted: 'demo'},
      taskKind: 'worktree-delete',
    });
  });

  test('ignores preview and unknown routes', () => {
    expect(matchQueuedDashboardOperation('GET', '/api/worktrees/demo/deploy/status')).toBeNull();
    expect(matchQueuedDashboardOperation('POST', '/api/worktrees/demo/logs')).toBeNull();
  });
});
