import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {assertPrimaryCheckoutGuardrail} from '../../src/features/worktree/worktree-guardrails.js';
import {resolveWorktreeContext} from '../../src/features/worktree/worktree-paths.js';
import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('worktree guardrails', () => {
  test('blocks primary checkout on feature branch and allows main and nested worktrees', async () => {
    const repoRoot = createTempDir('dev-cli-worktree-guard-');
    await fs.ensureDir(path.join(repoRoot, 'docker'));
    await fs.ensureDir(path.join(repoRoot, 'liferay'));
    await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
    await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'COMPOSE_PROJECT_NAME=liferay\n');
    await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');

    expect((await runProcess('git', ['init', '-b', 'main'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('git', ['config', 'user.email', 'tests@example.com'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('git', ['config', 'user.name', 'Tests'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('git', ['add', '-A'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('git', ['commit', '-m', 'chore: init'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('git', ['checkout', '-b', 'fix/issue-123'], {cwd: repoRoot})).exitCode).toBe(0);

    await expect(assertPrimaryCheckoutGuardrail(resolveWorktreeContext(repoRoot), 'probar algo')).rejects.toThrow(
      'Operación bloqueada',
    );

    expect((await runProcess('git', ['switch', 'main'], {cwd: repoRoot})).exitCode).toBe(0);
    await expect(assertPrimaryCheckoutGuardrail(resolveWorktreeContext(repoRoot), 'probar algo')).resolves.toBeUndefined();

    const worktreeRoot = path.join(repoRoot, '.worktrees', 'issue-123');
    await fs.ensureDir(worktreeRoot);
    await expect(
      assertPrimaryCheckoutGuardrail(resolveWorktreeContext(worktreeRoot), 'probar algo'),
    ).resolves.toBeUndefined();
  });
});
