import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {UNBORN_HEAD, resolveHeadCommit, resolveHeadCommitOrUnborn} from '../../src/features/deploy/deploy-gradle.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('head commit of a repository without commits', () => {
  test('resolveHeadCommit still fails, resolveHeadCommitOrUnborn reports it as unborn', async () => {
    const repoRoot = createTempDir('ldev-unborn-');
    await runProcess('git', ['init', '-q'], {cwd: repoRoot});

    await expect(resolveHeadCommit(repoRoot)).rejects.toMatchObject({code: 'GIT_ERROR'});
    expect(await resolveHeadCommitOrUnborn(repoRoot)).toBe(UNBORN_HEAD);
  });
});
