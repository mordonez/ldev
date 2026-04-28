import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, test, vi} from 'vitest';

import * as git from '../../src/core/platform/git.js';
import * as process from '../../src/core/platform/process.js';

describe('git platform utilities', () => {
  test('getRepoRoot returns path when git command succeeds', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --show-toplevel',
      stdout: '/repo\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const root = await git.getRepoRoot('/repo');

    expect(root).toBe('/repo');
  });

  test('getRepoRoot returns null when git command fails', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --show-toplevel',
      stdout: '',
      stderr: 'fatal: not a git repository',
      exitCode: 128,
      ok: false,
    });

    const root = await git.getRepoRoot('/not-a-repo');

    expect(root).toBeNull();
  });

  test('getGitCommonDir returns common dir path', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --git-common-dir',
      stdout: '/repo/.git\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const commonDir = await git.getGitCommonDir('/repo');

    expect(commonDir).toBe('/repo/.git');
  });

  test('getGitCommonDir returns null on failure', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --git-common-dir',
      stdout: '',
      stderr: 'fatal: not a git repository',
      exitCode: 128,
      ok: false,
    });

    const commonDir = await git.getGitCommonDir('/not-a-repo');

    expect(commonDir).toBeNull();
  });

  test('isGitRepository returns true for valid repositories', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --is-inside-work-tree',
      stdout: 'true\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const isRepo = await git.isGitRepository('/repo');

    expect(isRepo).toBe(true);
  });

  test('isGitRepository returns false for non-repositories', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --is-inside-work-tree',
      stdout: 'false\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const isRepo = await git.isGitRepository('/not-a-repo');

    expect(isRepo).toBe(false);
  });

  test('isWorktree returns false when not in repository', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --show-toplevel',
      stdout: '',
      stderr: 'fatal: not a git repository',
      exitCode: 128,
      ok: false,
    });

    const isWorktree = await git.isWorktree('/not-a-repo');

    expect(isWorktree).toBe(false);
  });

  test('isWorktree returns true when repo path contains .worktrees', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --show-toplevel',
      stdout: '/repo/.worktrees/branch-name\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const isWorktree = await git.isWorktree('/repo/.worktrees/branch-name');

    expect(isWorktree).toBe(true);
  });

  test('isWorktree returns true for .worktrees overlay paths before git resolution', async () => {
    const runProcess = vi.spyOn(process, 'runProcess');

    const isWorktree = await git.isWorktree('/repo/.worktrees/branch-name');

    expect(isWorktree).toBe(true);
    expect(runProcess).not.toHaveBeenCalled();
  });

  test('isWorktree returns true for linked git worktree roots outside .worktrees', async () => {
    const mainRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-main-repo-'));
    const worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-linked-worktree-parent-'));
    const worktreeRoot = path.join(worktreeParent, 'external-issue');
    const gitDir = path.join(mainRepoRoot, '.git', 'worktrees', 'external-issue');
    const runProcess = vi.spyOn(process, 'runProcess');

    fs.mkdirSync(worktreeRoot, {recursive: true});
    fs.mkdirSync(gitDir, {recursive: true});
    fs.writeFileSync(path.join(worktreeRoot, '.git'), `gitdir: ${gitDir}\n`);

    const isWorktree = await git.isWorktree(worktreeRoot);

    expect(isWorktree).toBe(true);
    expect(runProcess).not.toHaveBeenCalled();
  });

  test('isWorktree returns false when repo path does not contain .worktrees', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git rev-parse --show-toplevel',
      stdout: '/repo\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const isWorktree = await git.isWorktree('/repo');

    expect(isWorktree).toBe(false);
  });

  test('listGitWorktreeDetails parses branch, detached, and prunable metadata', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git worktree list --porcelain',
      stdout: [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /outside/external-issue',
        'HEAD def456',
        'branch refs/heads/feat/external-issue',
        '',
        'worktree /outside/moved-issue',
        'HEAD 789abc',
        'detached',
        'prunable gitdir file points to non-existent location',
        '',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    await expect(git.listGitWorktreeDetails('/repo')).resolves.toEqual([
      {path: path.normalize('/repo'), branch: 'main', detached: false, prunable: false},
      {
        path: path.normalize('/outside/external-issue'),
        branch: 'feat/external-issue',
        detached: false,
        prunable: false,
      },
      {path: path.normalize('/outside/moved-issue'), branch: null, detached: true, prunable: true},
    ]);
  });

  test('areSamePath compares existing symlinked paths by real path', () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-realpath-target-'));
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-realpath-link-parent-'));
    const link = path.join(parent, 'link');

    try {
      fs.symlinkSync(target, link, globalThis.process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return;
      }
      throw error;
    }

    expect(git.areSamePath(target, link)).toBe(true);
  });

  test('getGitRemoteUrl returns remote URL', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git remote get-url origin',
      stdout: 'https://github.com/user/repo.git\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const url = await git.getGitRemoteUrl('/repo', 'origin');

    expect(url).toBe('https://github.com/user/repo.git');
  });

  test('getGitRemoteUrl returns null when remote does not exist', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git remote get-url upstream',
      stdout: '',
      stderr: 'fatal: No such remote',
      exitCode: 1,
      ok: false,
    });

    const url = await git.getGitRemoteUrl('/repo', 'upstream');

    expect(url).toBeNull();
  });

  test('getCurrentBranchName returns branch name', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git branch --show-current',
      stdout: 'main\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const branch = await git.getCurrentBranchName('/repo');

    expect(branch).toBe('main');
  });

  test('getCurrentBranchName returns null on failure', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git branch --show-current',
      stdout: '',
      stderr: 'fatal: not a git repository',
      exitCode: 128,
      ok: false,
    });

    const branch = await git.getCurrentBranchName('/not-a-repo');

    expect(branch).toBeNull();
  });

  test('getCurrentBranchName returns null for detached HEAD', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git branch --show-current',
      stdout: '\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const branch = await git.getCurrentBranchName('/repo');

    expect(branch).toBeNull();
  });

  test('initializeGitRepository initializes repository', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git init',
      stdout: 'Initialized empty Git repository\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    await git.initializeGitRepository('/new-repo');

    expect(process.runProcess).toHaveBeenCalledWith('git', ['init'], {cwd: '/new-repo'});
  });

  test('ensureGitRemote creates new remote', async () => {
    vi.spyOn(process, 'runProcess')
      .mockResolvedValueOnce({
        command: 'git remote get-url origin',
        stdout: '',
        stderr: 'fatal: No such remote',
        exitCode: 1,
        ok: false,
      })
      .mockResolvedValueOnce({
        command: 'git remote add origin https://github.com/user/repo.git',
        stdout: '',
        stderr: '',
        exitCode: 0,
        ok: true,
      });

    const result = await git.ensureGitRemote('/repo', 'origin', 'https://github.com/user/repo.git');

    expect(result).toBe('created');
  });

  test('ensureGitRemote returns existing when remote already exists', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'git remote get-url origin',
      stdout: 'https://github.com/user/repo.git\n',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const result = await git.ensureGitRemote('/repo', 'origin', 'https://github.com/user/repo.git');

    expect(result).toBe('existing');
  });
});
