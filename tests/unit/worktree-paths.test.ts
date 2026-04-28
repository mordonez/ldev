import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {
  resolvePortSet,
  resolveWorktreeContext,
  resolveWorktreeTargetByName,
  resolveWorktreeTarget,
  resolveWorktreeTargetForContext,
} from '../../src/features/worktree/worktree-paths.js';

describe('worktree paths', () => {
  test('detects main checkout and nested worktree paths', () => {
    expect(resolveWorktreeContext('/repo')).toEqual({
      currentRepoRoot: path.resolve('/repo'),
      mainRepoRoot: path.resolve('/repo'),
      isWorktree: false,
      currentWorktreeName: null,
    });

    expect(resolveWorktreeContext('/repo/.worktrees/issue-123')).toEqual({
      currentRepoRoot: path.resolve('/repo/.worktrees/issue-123'),
      mainRepoRoot: path.resolve('/repo'),
      isWorktree: true,
      currentWorktreeName: 'issue-123',
    });
  });

  test('builds worktree target paths and stable port sets', () => {
    const target = resolveWorktreeTarget('/repo', 'issue-123');
    expect(path.normalize(target.worktreeDir)).toBe(
      path.normalize(path.join(path.resolve('/repo'), '.worktrees', 'issue-123')),
    );
    expect(target.branch).toBe('fix/issue-123');

    expect(resolvePortSet('issue-123')).toEqual(resolvePortSet('issue-123'));
    expect(resolvePortSet('issue-123').httpPort).not.toBe(resolvePortSet('issue-124').httpPort);
  });

  test('detects linked git worktrees outside the .worktrees directory and reuses their path', () => {
    const mainRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-main-repo-'));
    const worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-linked-worktree-parent-'));
    const worktreeRoot = path.join(worktreeParent, 'external-issue');
    const gitDir = path.join(mainRepoRoot, '.git', 'worktrees', 'external-issue');

    fs.mkdirSync(worktreeRoot, {recursive: true});
    fs.mkdirSync(gitDir, {recursive: true});
    fs.writeFileSync(path.join(worktreeRoot, '.git'), `gitdir: ${gitDir}\n`);

    const context = resolveWorktreeContext(worktreeRoot);

    expect(context).toEqual({
      currentRepoRoot: path.resolve(worktreeRoot),
      mainRepoRoot: path.resolve(mainRepoRoot),
      isWorktree: true,
      currentWorktreeName: 'external-issue',
    });

    const target = resolveWorktreeTargetForContext(context);
    expect(target?.worktreeDir).toBe(path.resolve(worktreeRoot));
  });

  test('uses the registered branch when reusing an existing external worktree', () => {
    const context = resolveWorktreeContext('/repo');

    const target = resolveWorktreeTargetForContext(context, 'external-issue', [
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/outside/external-issue', branch: 'feat/external-issue', detached: false, prunable: false},
    ]);

    expect(target?.worktreeDir).toBe(path.resolve('/outside/external-issue'));
    expect(target?.branch).toBe('feat/external-issue');
  });

  test('prefers the managed .worktrees path over an external worktree with the same basename', () => {
    const target = resolveWorktreeTargetByName('/repo', 'issue-123', [
      {path: '/outside/issue-123', branch: 'feat/outside', detached: false, prunable: false},
      {path: '/repo/.worktrees/issue-123', branch: 'fix/issue-123', detached: false, prunable: false},
    ]);

    expect(target.worktreeDir).toBe(path.resolve('/repo/.worktrees/issue-123'));
    expect(target.branch).toBe('fix/issue-123');
  });

  test('rejects ambiguous external worktrees with the same basename', () => {
    expect(() =>
      resolveWorktreeTargetByName('/repo', 'issue-123', [
        {path: '/outside-a/issue-123', branch: 'feat/a', detached: false, prunable: false},
        {path: '/outside-b/issue-123', branch: 'feat/b', detached: false, prunable: false},
      ]),
    ).toThrow("More than one registered worktree is named 'issue-123'");
  });

  test('ignores prunable registered worktrees when resolving by name from the main checkout', () => {
    const target = resolveWorktreeTargetByName('/repo', 'issue-123', [
      {path: '/outside/issue-123', branch: 'feat/stale', detached: false, prunable: true},
    ]);

    expect(target.worktreeDir).toBe(path.resolve('/repo/.worktrees/issue-123'));
    expect(target.branch).toBe('fix/issue-123');
  });
});
