import path from 'node:path';

import {beforeEach, describe, expect, test, vi} from 'vitest';

const loadConfigMock = vi.fn();
const detectCapabilitiesMock = vi.fn();
const getRepoRootMock = vi.fn();
const isGitRepositoryMock = vi.fn();

vi.mock('../../src/core/config/load-config.js', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('../../src/core/platform/capabilities.js', () => ({
  detectCapabilities: detectCapabilitiesMock,
}));

vi.mock('../../src/core/platform/git.js', () => ({
  getRepoRoot: getRepoRootMock,
  isGitRepository: isGitRepositoryMock,
  resolveLinkedGitWorktree: () => null,
}));

const {prepareWorktreeFlow} = await import('../../src/features/worktree/worktree-flow.js');

describe('prepareWorktreeFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detectCapabilitiesMock.mockResolvedValue({supportsWorktrees: true});
    isGitRepositoryMock.mockResolvedValue(true);
  });

  test('falls back to git repo root when ldev config has no repo root', async () => {
    loadConfigMock.mockReturnValue({cwd: '/repo/subdir', repoRoot: null});
    getRepoRootMock.mockResolvedValue('/repo');

    const result = await prepareWorktreeFlow({cwd: '/repo/subdir', commandName: 'list'});

    expect(getRepoRootMock).toHaveBeenCalledWith('/repo/subdir');
    expect(result.config.repoRoot).toBe('/repo');
    expect(result.context).toMatchObject({
      currentRepoRoot: path.resolve('/repo'),
      mainRepoRoot: path.resolve('/repo'),
      isWorktree: false,
    });
  });

  test('uses the configured repo root when present', async () => {
    loadConfigMock.mockReturnValue({cwd: '/repo', repoRoot: '/repo'});

    const result = await prepareWorktreeFlow({cwd: '/repo', commandName: 'setup'});

    expect(getRepoRootMock).not.toHaveBeenCalled();
    expect(result.config.repoRoot).toBe('/repo');
  });
});
