import {describe, expect, test} from 'vitest';

import type {WorktreeEnvResult} from '../../src/features/worktree/worktree-env.js';
import {formatWorktreeEnv} from '../../src/features/worktree/worktree-env.js';

// ---------------------------------------------------------------------------
// formatWorktreeEnv — pure output formatter
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<WorktreeEnvResult> = {}): WorktreeEnvResult {
  return {
    ok: true,
    worktreeName: 'issue-123',
    worktreeDir: '/repo/.worktrees/issue-123',
    dockerDir: '/repo/.worktrees/issue-123/docker',
    envFile: '/repo/.worktrees/issue-123/docker/.env',
    composeProjectName: 'liferay-issue-123',
    portalUrl: 'http://127.0.0.1:8342',
    dataRoot: '/repo/.worktrees/issue-123/docker/data/default',
    ports: {
      httpPort: '8342',
      debugPort: '9342',
      gogoPort: '12342',
      postgresPort: '5742',
      esHttpPort: '9543',
    },
    createdEnvFile: false,
    clonedState: false,
    btrfsEnabled: false,
    ...overrides,
  };
}

describe('formatWorktreeEnv', () => {
  test('includes worktree name in output', () => {
    const out = formatWorktreeEnv(makeResult());
    expect(out).toContain('issue-123');
  });

  test('includes portal URL', () => {
    const out = formatWorktreeEnv(makeResult());
    expect(out).toContain('http://127.0.0.1:8342');
  });

  test('includes compose project name', () => {
    const out = formatWorktreeEnv(makeResult());
    expect(out).toContain('liferay-issue-123');
  });

  test('includes data root path', () => {
    const out = formatWorktreeEnv(makeResult());
    expect(out).toContain('/repo/.worktrees/issue-123/docker/data/default');
  });

  test('shows cloned state as no when false', () => {
    const out = formatWorktreeEnv(makeResult({clonedState: false}));
    expect(out).toContain('no');
  });

  test('shows cloned state as yes when true', () => {
    const out = formatWorktreeEnv(makeResult({clonedState: true}));
    expect(out).toContain('yes');
  });

  test('outputs a multi-line string', () => {
    const out = formatWorktreeEnv(makeResult());
    expect(out.split('\n').length).toBeGreaterThan(1);
  });

  test('uses the custom worktree name from result', () => {
    const out = formatWorktreeEnv(makeResult({worktreeName: 'my-feature', portalUrl: 'http://127.0.0.1:9000'}));
    expect(out).toContain('my-feature');
    expect(out).toContain('http://127.0.0.1:9000');
  });
});
