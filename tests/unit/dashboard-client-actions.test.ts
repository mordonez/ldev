import {describe, expect, test} from 'vitest';

import {
  buildDeleteWorktreeUrl,
  normalizeDeleteBranchCandidate,
} from '../../src/entrypoints/dashboard/client/lib/dashboard-action-utils';
import {
  actionKind,
  actionUrl,
  previewUrl,
  primaryActionForWorktree,
} from '../../src/entrypoints/dashboard/client/lib/actions.js';

describe('dashboard client actions', () => {
  test('maps UI actions to running task kinds', () => {
    expect(actionKind('init-env')).toBe('worktree-env-init');
    expect(actionKind('restart')).toBe('env-restart');
    expect(actionKind('deploy-cache-update')).toBe('deploy-cache-update');
    expect(actionKind('custom')).toBe('worktree-custom');
  });

  test('maps UI actions to dashboard API URLs', () => {
    expect(actionUrl('feature/demo', 'init-env')).toBe('/api/worktrees/feature%2Fdemo/env/init');
    expect(actionUrl('feature/demo', 'oauth-install')).toBe('/api/worktrees/feature%2Fdemo/oauth/install');
    expect(actionUrl('feature/demo', 'deploy-cache-update')).toBe('/api/worktrees/feature%2Fdemo/deploy/cache-update');
    expect(actionUrl('feature/demo', 'custom')).toBe('/api/worktrees/feature%2Fdemo/custom');
  });

  test('maps preview actions through the shared action catalog', () => {
    expect(previewUrl('feature/demo', 'doctor')).toBe('/api/worktrees/feature%2Fdemo/doctor');
    expect(previewUrl('feature/demo', 'deploy-status')).toBe('/api/worktrees/feature%2Fdemo/deploy/status');
    expect(previewUrl('feature/demo', 'start')).toBe('/api/worktrees/feature%2Fdemo/start');
  });

  test('selects the primary worktree action from runtime state', () => {
    expect(primaryActionForWorktree({}, false, false)).toEqual({
      action: 'init-env',
      className: 'btn-start',
      label: 'Init env',
    });
    expect(primaryActionForWorktree({env: {portalReachable: false}}, true, false)).toEqual({
      action: 'restart',
      className: 'btn-start',
      label: 'Restart',
    });
    expect(primaryActionForWorktree({env: {}}, false, true)).toEqual({
      action: 'start',
      className: 'btn-start',
      label: 'Start',
    });
    expect(primaryActionForWorktree({env: {}}, true, false)).toEqual({
      action: 'doctor',
      className: 'btn-ghost',
      label: 'Diagnose',
    });
  });

  test('builds the delete worktree URL with optional branch deletion', () => {
    expect(buildDeleteWorktreeUrl('feature/demo', false)).toBe('/api/worktrees/feature%2Fdemo');
    expect(buildDeleteWorktreeUrl('feature/demo', true)).toBe('/api/worktrees/feature%2Fdemo?deleteBranch=true');
  });

  test('normalizes the branch candidate shown in the delete modal', () => {
    expect(normalizeDeleteBranchCandidate(' fix/feature-demo ')).toBe('fix/feature-demo');
    expect(normalizeDeleteBranchCandidate('HEAD detached')).toBeNull();
    expect(normalizeDeleteBranchCandidate('   ')).toBeNull();
  });
});
