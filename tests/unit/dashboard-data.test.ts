import {beforeEach, describe, expect, test, vi} from 'vitest';

const pathExistsMock = vi.fn();
const loadConfigMock = vi.fn();
const buildComposeEnvMock = vi.fn();
const resolveEnvContextMock = vi.fn();
const collectEnvRuntimeSummaryMock = vi.fn();
const collectEnvStatusMock = vi.fn();
const listGitWorktreeDetailsMock = vi.fn();
const runProcessMock = vi.fn();

vi.mock('fs-extra', () => ({
  default: {
    pathExists: pathExistsMock,
  },
}));

vi.mock('../../src/core/config/load-config.js', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('../../src/core/runtime/env-context.js', () => ({
  buildComposeEnv: buildComposeEnvMock,
  resolveEnvContext: resolveEnvContextMock,
}));

vi.mock('../../src/core/runtime/env-health.js', () => ({
  collectEnvRuntimeSummary: collectEnvRuntimeSummaryMock,
  collectEnvStatus: collectEnvStatusMock,
}));

vi.mock('../../src/core/platform/git.js', () => ({
  listGitWorktreeDetails: listGitWorktreeDetailsMock,
}));

vi.mock('../../src/core/platform/process.js', () => ({
  runProcess: runProcessMock,
}));

vi.mock('../../src/features/mcp-server/mcp-server-setup.js', () => ({
  MCP_SETUP_TOOLS: [],
  resolveMcpConfigPath: vi.fn(() => '/unused'),
}));

const {collectDashboardStatus} = await import('../../src/features/dashboard/dashboard-data.js');

function normalizeForMatch(value: string): string {
  return value.replaceAll('\\', '/');
}

describe('collectDashboardStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);

    pathExistsMock.mockImplementation((targetPath: string) => {
      const normalizedPath = normalizeForMatch(targetPath);

      if (normalizedPath === '/repo/docker') {
        return true;
      }

      if (normalizedPath === '/repo/.worktrees/pw-430/docker') {
        return true;
      }

      return false;
    });

    loadConfigMock.mockImplementation(({cwd}: {cwd: string}) => {
      const normalizedCwd = normalizeForMatch(cwd);

      if (normalizedCwd === '/repo') {
        return {
          repoRoot: '/repo',
          dockerDir: '/repo/docker',
          liferayDir: '/repo/liferay',
          files: {dockerEnv: '/repo/docker/.env'},
        };
      }

      return {
        repoRoot: '/repo/.worktrees/pw-430',
        dockerDir: '/repo/.worktrees/pw-430/docker',
        liferayDir: '/repo/.worktrees/pw-430/liferay',
        files: {dockerEnv: null},
      };
    });

    resolveEnvContextMock.mockReturnValue({dockerDir: '/repo/docker'});
    buildComposeEnvMock.mockReturnValue({});
    collectEnvRuntimeSummaryMock.mockResolvedValue({
      portalUrl: 'http://localhost:8080',
      liferay: null,
    });
    collectEnvStatusMock.mockResolvedValue({
      portalUrl: 'http://localhost:8080',
      portalReachable: true,
      services: [],
      liferay: null,
    });
    runProcessMock.mockResolvedValue({ok: true, stdout: '', stderr: ''});
  });

  test('does not expose an inherited main environment for a worktree without local docker env state', async () => {
    const status = await collectDashboardStatus('/repo');
    const worktree = status.worktrees.find((entry) => entry.name === 'pw-430');

    expect(worktree?.env).toBeNull();
    expect(loadConfigMock).toHaveBeenCalledWith({cwd: '/repo/.worktrees/pw-430'});
    expect(collectEnvRuntimeSummaryMock).toHaveBeenCalledTimes(1);
    expect(collectEnvStatusMock).not.toHaveBeenCalled();
    expect(runProcessMock).not.toHaveBeenCalled();
  });

  test('includes changed file paths and full runtime details when requested', async () => {
    runProcessMock
      .mockResolvedValueOnce({ok: true, stdout: 'abc12345\tMain commit\t2026-05-04 10:00:00 +0000\n', stderr: ''})
      .mockResolvedValueOnce({
        ok: true,
        stdout: ' M src/features/dashboard/dashboard-html.ts\nA  docs/workflows/dashboard.md\n',
        stderr: '',
      })
      .mockResolvedValueOnce({ok: true, stdout: '2', stderr: ''})
      .mockResolvedValueOnce({ok: true, stdout: '1', stderr: ''});

    const status = await collectDashboardStatus('/repo/.worktrees/pw-430', {
      includeGit: true,
      includeRuntimeDetails: true,
    });
    const mainWorktree = status.worktrees.find((entry) => entry.name === 'repo');

    expect(mainWorktree?.changedFiles).toBe(2);
    expect(mainWorktree?.changedPaths).toEqual([
      'src/features/dashboard/dashboard-html.ts',
      'docs/workflows/dashboard.md',
    ]);
    expect(collectEnvStatusMock).toHaveBeenCalledTimes(1);
    expect(collectEnvRuntimeSummaryMock).not.toHaveBeenCalled();
  });
});
