import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import {beforeEach, describe, expect, test, vi} from 'vitest';

const prepareWorktreeFlowMock = vi.fn();
const listGitWorktreeDetailsMock = vi.fn();

vi.mock('../../src/features/worktree/worktree-flow.js', () => ({
  prepareWorktreeFlow: prepareWorktreeFlowMock,
}));

vi.mock('../../src/core/platform/git.js', () => ({
  areSamePath: (left: string, right: string) => path.resolve(left) === path.resolve(right),
  listGitWorktreeDetails: listGitWorktreeDetailsMock,
}));

const {formatWorktreeList, runWorktreeList, runWorktreeStatus} =
  await import('../../src/features/worktree/worktree-inspect.js');

describe('worktree inspection', () => {
  let repoRoot: string;
  let worktreeRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-worktree-inspect-main-'));
    worktreeRoot = path.join(repoRoot, '.worktrees', 'issue-42');
    await fs.ensureDir(path.join(repoRoot, 'docker'));
    await fs.ensureDir(path.join(worktreeRoot, 'docker'));
    await fs.writeFile(
      path.join(repoRoot, 'docker', '.env'),
      ['COMPOSE_PROJECT_NAME=labweb', 'BIND_IP=127.0.0.1', 'LIFERAY_HTTP_PORT=8080'].join('\n'),
    );
    await fs.writeFile(
      path.join(worktreeRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=labweb-issue-42',
        'BIND_IP=127.0.0.1',
        'LIFERAY_HTTP_PORT=8188',
        'LIFERAY_DEBUG_PORT=9188',
        'GOGO_PORT=12188',
        'POSTGRES_PORT=5588',
        'ES_HTTP_PORT=9288',
      ].join('\n'),
    );

    prepareWorktreeFlowMock.mockResolvedValue({
      context: {
        currentRepoRoot: repoRoot,
        mainRepoRoot: repoRoot,
        isWorktree: false,
        currentWorktreeName: null,
      },
    });
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: repoRoot, branch: 'main', detached: false, prunable: false},
      {path: worktreeRoot, branch: 'fix/issue-42', detached: false, prunable: false},
    ]);
  });

  test('lists registered worktrees with compose-owned running status and ports', async () => {
    const docker = vi.fn((args: string[]) =>
      Promise.resolve({
        command: `docker ${args.join(' ')}`,
        stdout: args.includes('label=com.docker.compose.project=labweb-issue-42') ? 'container-a\ncontainer-b\n' : '',
        stderr: '',
        exitCode: 0,
        ok: true,
      }),
    );

    const result = await runWorktreeList({cwd: repoRoot, docker});

    expect(result.worktrees).toHaveLength(2);
    expect(result.worktrees[0]).toMatchObject({
      name: path.basename(repoRoot),
      composeProjectName: 'labweb',
      runtimeStatus: 'stopped',
      runningContainers: 0,
      portalUrl: 'http://127.0.0.1:8080',
    });
    expect(result.worktrees[1]).toMatchObject({
      name: 'issue-42',
      composeProjectName: 'labweb-issue-42',
      runtimeStatus: 'running',
      runningContainers: 2,
      portalUrl: 'http://127.0.0.1:8188',
      ports: {
        httpPort: '8188',
        debugPort: '9188',
        gogoPort: '12188',
        postgresPort: '5588',
        esHttpPort: '9288',
      },
    });
    expect(formatWorktreeList(result)).toContain('running (2)');
  });

  test('returns status for a named worktree without relying on port scanning', async () => {
    const docker = vi.fn(() =>
      Promise.resolve({
        command: 'docker ps',
        stdout: 'container-a\n',
        stderr: '',
        exitCode: 0,
        ok: true,
      }),
    );

    const result = await runWorktreeStatus({cwd: repoRoot, name: 'issue-42', docker});

    expect(result.worktree.name).toBe('issue-42');
    expect(result.worktree.runtimeStatus).toBe('running');
    expect(docker).toHaveBeenCalledWith(['ps', '-q', '--filter', 'label=com.docker.compose.project=labweb-issue-42'], {
      env: undefined,
      reject: false,
    });
  });

  test('returns status for the main checkout by the name shown in list', async () => {
    const docker = vi.fn(() =>
      Promise.resolve({
        command: 'docker ps',
        stdout: '',
        stderr: '',
        exitCode: 0,
        ok: true,
      }),
    );

    const result = await runWorktreeStatus({cwd: repoRoot, name: path.basename(repoRoot), docker});

    expect(result.worktree.isMain).toBe(true);
    expect(result.worktree.name).toBe(path.basename(repoRoot));
    expect(result.worktree.branch).toBe('main');
    expect(result.worktree.composeProjectName).toBe('labweb');
  });

  test('marks runtime as unknown when Docker cannot report compose ownership', async () => {
    const docker = vi.fn(() =>
      Promise.resolve({
        command: 'docker ps',
        stdout: '',
        stderr: 'Cannot connect to Docker daemon',
        exitCode: 1,
        ok: false,
      }),
    );

    const result = await runWorktreeStatus({cwd: repoRoot, name: 'issue-42', docker});

    expect(result.worktree.runtimeStatus).toBe('unknown');
    expect(result.worktree.runningContainers).toBe(0);
  });

  test('does not invent ports for git-only worktrees without env files', async () => {
    const gitOnlyRoot = path.join(repoRoot, '.claude', 'worktrees', 'agent-demo');
    await fs.ensureDir(gitOnlyRoot);
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: repoRoot, branch: 'main', detached: false, prunable: false},
      {path: gitOnlyRoot, branch: 'worktree-agent-demo', detached: false, prunable: false},
    ]);

    const docker = vi.fn(() =>
      Promise.resolve({
        command: 'docker ps',
        stdout: '',
        stderr: '',
        exitCode: 0,
        ok: true,
      }),
    );

    const result = await runWorktreeStatus({cwd: repoRoot, name: 'agent-demo', docker});

    expect(result.worktree.envConfigured).toBe(false);
    expect(result.worktree.composeProjectName).toBeNull();
    expect(result.worktree.portalUrl).toBeNull();
    expect(result.worktree.ports.httpPort).toBeNull();
    expect(result.worktree.runtimeStatus).toBe('unknown');
    expect(docker).not.toHaveBeenCalled();
  });
});
