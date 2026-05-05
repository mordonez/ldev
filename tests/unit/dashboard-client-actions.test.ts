/* eslint-disable @typescript-eslint/no-unsafe-call */
import {describe, expect, test} from 'vitest';

// @ts-expect-error Dashboard client modules are plain browser JavaScript.
import {actionKind, actionUrl, primaryActionForWorktree} from '../../src/features/dashboard/client/lib/actions.js';

describe('dashboard client actions', () => {
  test('maps UI actions to running task kinds', () => {
    expect(actionKind('init-env')).toBe('worktree-env-init');
    expect(actionKind('restart')).toBe('env-restart');
    expect(actionKind('deploy-cache-update')).toBe('deploy-cache-update');
    expect(actionKind('custom')).toBe('worktree-custom');
  });

  test('maps UI actions to dashboard API URLs', () => {
    expect(actionUrl('feature/demo', 'init-env')).toBe('/api/worktrees/feature%2Fdemo/env/init');
    expect(actionUrl('feature/demo', 'mcp-setup')).toBe('/api/worktrees/feature%2Fdemo/mcp/setup');
    expect(actionUrl('feature/demo', 'deploy-cache-update')).toBe('/api/worktrees/feature%2Fdemo/deploy/cache-update');
    expect(actionUrl('feature/demo', 'custom')).toBe('/api/worktrees/feature%2Fdemo/custom');
  });

  test('selects the primary worktree action from runtime state', () => {
    expect(primaryActionForWorktree({}, false, false)).toEqual(['init-env', 'btn-start', 'Init env']);
    expect(primaryActionForWorktree({env: {portalReachable: false}}, true, false)).toEqual([
      'restart',
      'btn-start',
      'Restart',
    ]);
    expect(primaryActionForWorktree({env: {}}, false, true)).toEqual(['start', 'btn-start', 'Start']);
    expect(primaryActionForWorktree({env: {}}, true, false)).toEqual(['doctor', 'btn-ghost', 'Diagnose']);
  });
});
