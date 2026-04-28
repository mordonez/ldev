import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import {beforeEach, describe, expect, test, vi} from 'vitest';

const loadConfigMock = vi.fn();
const detectCapabilitiesMock = vi.fn();
const isGitRepositoryMock = vi.fn();
const listGitWorktreeDetailsMock = vi.fn();
const addGitWorktreeMock = vi.fn();
const readEnvFileMock = vi.fn();
const resolveEnvContextMock = vi.fn();
const resolveWorktreeContextMock = vi.fn();
const resolveWorktreeTargetForContextMock = vi.fn();
const resolveBtrfsConfigMock = vi.fn();
const assertSafeMainEnvCloneMock = vi.fn();

vi.mock('../../src/core/config/load-config.js', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('../../src/core/platform/capabilities.js', () => ({
  detectCapabilities: detectCapabilitiesMock,
}));

vi.mock('../../src/core/platform/git.js', () => ({
  areSamePath: (left: string, right: string) => path.resolve(left) === path.resolve(right),
  isGitRepository: isGitRepositoryMock,
  listGitWorktreeDetails: listGitWorktreeDetailsMock,
  addGitWorktree: addGitWorktreeMock,
}));

vi.mock('../../src/core/config/env-file.js', () => ({
  readEnvFile: readEnvFileMock,
}));

vi.mock('../../src/core/runtime/env-context.js', () => ({
  resolveEnvContext: resolveEnvContextMock,
}));

vi.mock('../../src/features/worktree/worktree-paths.js', () => ({
  resolveWorktreeContext: resolveWorktreeContextMock,
  resolveWorktreeTargetForContext: resolveWorktreeTargetForContextMock,
}));

vi.mock('../../src/features/worktree/worktree-state.js', () => ({
  resolveBtrfsConfig: resolveBtrfsConfigMock,
  assertSafeMainEnvClone: assertSafeMainEnvCloneMock,
}));

const {runWorktreeSetup} = await import('../../src/features/worktree/worktree-setup.js');

describe('runWorktreeSetup', () => {
  const mainRepoRoot = '/repo';
  const worktreeDir = '/repo/.worktrees/issue-1';
  const repoConfig = {cwd: '/repo', repoRoot: '/repo'};
  const mainConfig = {cwd: '/repo', repoRoot: '/repo'};
  const mainEnvContext = {dockerEnvFile: '/repo/docker/.env'};
  const worktreeContext = {mainRepoRoot, currentRepoRoot: mainRepoRoot, isWorktree: false, currentWorktreeName: null};
  const worktreeTarget = {name: 'issue-1', worktreeDir, branch: 'fix/issue-1'};

  beforeEach(() => {
    vi.clearAllMocks();
    loadConfigMock.mockImplementation(({cwd}: {cwd: string}) => (cwd === mainRepoRoot ? mainConfig : repoConfig));
    detectCapabilitiesMock.mockResolvedValue({supportsWorktrees: true});
    isGitRepositoryMock.mockResolvedValue(true);
    listGitWorktreeDetailsMock.mockResolvedValue([]);
    addGitWorktreeMock.mockResolvedValue(undefined);
    readEnvFileMock.mockReturnValue({});
    resolveEnvContextMock.mockReturnValue(mainEnvContext);
    resolveWorktreeContextMock.mockReturnValue(worktreeContext);
    resolveWorktreeTargetForContextMock.mockReturnValue(worktreeTarget);
    resolveBtrfsConfigMock.mockResolvedValue({enabled: false});
    assertSafeMainEnvCloneMock.mockResolvedValue(undefined);
  });

  test('reuses an existing external registered worktree when setup runs from the main checkout', async () => {
    const externalWorktreeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-external-worktree-'));
    const externalTarget = {name: 'testworktree', worktreeDir: externalWorktreeDir, branch: 'fix/testworktree'};
    const prepareWorktreeEnv = vi.fn().mockResolvedValue({ok: true});

    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: mainRepoRoot, branch: 'main', detached: false, prunable: false},
      {path: externalWorktreeDir, branch: 'feat/testworktree', detached: false, prunable: false},
    ]);
    resolveWorktreeTargetForContextMock.mockReturnValue(externalTarget);

    const result = await runWorktreeSetup({
      cwd: '/repo',
      name: 'testworktree',
      withEnv: true,
      prepareWorktreeEnv,
    });

    expect(addGitWorktreeMock).not.toHaveBeenCalled();
    expect(prepareWorktreeEnv).toHaveBeenCalledWith({cwd: externalWorktreeDir, printer: undefined});
    expect(result.reused).toBe(true);
    expect(result.worktreeDir).toBe(externalWorktreeDir);
  });

  test('stops and restarts main env around with-env clone handoff', async () => {
    const stopEnv = vi.fn().mockResolvedValue({ok: true, stopped: true});
    const startEnv = vi.fn().mockResolvedValue({ok: true, portalUrl: 'http://localhost:8080'});
    const prepareWorktreeEnv = vi.fn().mockResolvedValue({ok: true});

    assertSafeMainEnvCloneMock.mockRejectedValueOnce(new Error('main running'));

    const result = await runWorktreeSetup({
      cwd: '/repo',
      name: 'issue-1',
      withEnv: true,
      stopMainForClone: true,
      restartMainAfterClone: true,
      stopEnv,
      startEnv,
      prepareWorktreeEnv,
    });

    expect(stopEnv).toHaveBeenCalledTimes(1);
    expect(prepareWorktreeEnv).toHaveBeenCalledWith({cwd: worktreeDir, printer: undefined});
    expect(startEnv).toHaveBeenCalledWith(mainConfig, {wait: false, processEnv: process.env, printer: undefined});
    expect(result.mainEnvStoppedForClone).toBe(true);
    expect(result.mainEnvRestartedAfterClone).toBe(true);
    expect(result.envPrepared).toBe(true);
  });

  test('still attempts restart when worktree env preparation fails after stopping main', async () => {
    const stopEnv = vi.fn().mockResolvedValue({ok: true, stopped: true});
    const startEnv = vi.fn().mockResolvedValue({ok: true, portalUrl: 'http://localhost:8080'});
    const prepareWorktreeEnv = vi.fn().mockRejectedValue(new Error('prepare failed'));

    assertSafeMainEnvCloneMock.mockRejectedValueOnce(new Error('main running'));

    await expect(
      runWorktreeSetup({
        cwd: '/repo',
        name: 'issue-1',
        withEnv: true,
        stopMainForClone: true,
        restartMainAfterClone: true,
        stopEnv,
        startEnv,
        prepareWorktreeEnv,
      }),
    ).rejects.toThrow('prepare failed');

    expect(startEnv).toHaveBeenCalledTimes(1);
  });

  test('returns partial success when restarting main fails after a successful setup', async () => {
    const stopEnv = vi.fn().mockResolvedValue({ok: true, stopped: true});
    const startEnv = vi.fn().mockRejectedValue(new Error('docker unavailable'));
    const prepareWorktreeEnv = vi.fn().mockResolvedValue({ok: true});

    assertSafeMainEnvCloneMock.mockRejectedValueOnce(new Error('main running'));

    const result = await runWorktreeSetup({
      cwd: '/repo',
      name: 'issue-1',
      withEnv: true,
      stopMainForClone: true,
      restartMainAfterClone: true,
      stopEnv,
      startEnv,
      prepareWorktreeEnv,
    });

    expect(result.envPrepared).toBe(true);
    expect(result.mainEnvStoppedForClone).toBe(true);
    expect(result.mainEnvRestartedAfterClone).toBe(false);
    expect(result.mainRestartError).toBe('docker unavailable');
  });

  test('rejects restart-main-after-clone without stop-main-for-clone', async () => {
    await expect(
      runWorktreeSetup({
        cwd: '/repo',
        name: 'issue-1',
        withEnv: true,
        restartMainAfterClone: true,
      }),
    ).rejects.toThrow('--restart-main-after-clone requires --stop-main-for-clone.');
  });

  test('rejects stop-main-for-clone when with-env is disabled', async () => {
    await expect(
      runWorktreeSetup({
        cwd: '/repo',
        name: 'issue-1',
        stopMainForClone: true,
      }),
    ).rejects.toThrow('require --with-env');
  });
});
