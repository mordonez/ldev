import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createFakeDockerBin} from '../../src/testing/fake-docker.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

type EnvDiffPayload = {
  summary: {
    addedModules: string[];
  };
};

describe('env diff integration', () => {
  test('writes a baseline and then reports added modules', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const baselineResult = await runCli(['env', 'diff', '--write-baseline', '--json'], {
      cwd: repoRoot,
      env,
    });
    expect(baselineResult.exitCode).toBe(0);

    await fs.ensureDir(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy'));
    await fs.writeFile(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy', 'foo.jar'), 'jar\n');

    const diffResult = await runCli(['env', 'diff', '--json'], {cwd: repoRoot, env});
    expect(diffResult.exitCode).toBe(0);
    const parsed = parseTestJson<EnvDiffPayload>(diffResult.stdout);
    expect(parsed.summary.addedModules).toContain('foo');
  }, 60000);
});

async function createEnvRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-env-diff-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\nBIND_IP=localhost\nLIFERAY_HTTP_PORT=8080\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  return repoRoot;
}
