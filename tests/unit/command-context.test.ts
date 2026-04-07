import {afterEach, describe, expect, test} from 'vitest';

import {createCommandContext} from '../../src/cli/command-context.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';

describe('command-context', () => {
  afterEach(() => {
    delete process.env.REPO_ROOT;
  });

  test('uses REPO_ROOT as effective cwd when present', () => {
    const repoRoot = createTempRepo();

    process.env.REPO_ROOT = repoRoot;

    const context = createCommandContext({cwd: '/tmp/ignored-by-repo-root'});

    expect(context.cwd).toBe(repoRoot);
    expect(context.config.cwd).toBe(repoRoot);
    expect(context.config.repoRoot).toBe(repoRoot);
  });
});
