import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {runProcess} from '../../src/core/platform/process.js';
import {runEnvIsHealthy} from '../../src/features/env/env-is-healthy.js';
import {runEnvWait} from '../../src/features/env/env-wait.js';
import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = path.join(CLI_CWD, 'src', 'index.ts');

describe('env advanced integration', () => {
  test('stop, restart, recreate and logs issue the expected docker commands', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'env', 'stop'], {cwd: repoRoot, env})).exitCode).toBe(0);
    expect(
      (await runProcess('npx', ['tsx', CLI_ENTRY, 'env', 'restart', '--no-wait'], {cwd: repoRoot, env})).exitCode,
    ).toBe(0);
    expect(
      (await runProcess('npx', ['tsx', CLI_ENTRY, 'env', 'recreate', '--no-wait'], {cwd: repoRoot, env})).exitCode,
    ).toBe(0);
    expect(
      (
        await runProcess(
          'npx',
          ['tsx', CLI_ENTRY, 'env', 'logs', '--service', 'liferay', '--since', '5m', '--no-follow'],
          {
            cwd: repoRoot,
            env,
          },
        )
      ).exitCode,
    ).toBe(0);

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining([
        'compose stop',
        'compose down',
        'compose up -d',
        'compose stop liferay',
        'compose up -d --force-recreate liferay',
        'compose logs --since=5m liferay',
      ]),
    );
  }, 30000);

  test('wait and is-healthy are scriptable against controlled docker status', async () => {
    const repoRoot = await createEnvRepoFixture();
    const healthyBin = await createFakeDockerBin({stateStatus: 'running', healthStatus: 'healthy'});
    const healthyEnv = {...process.env, PATH: `${healthyBin}:${process.env.PATH ?? ''}`};
    const config = loadConfig({cwd: repoRoot, env: process.env});

    const waitResult = await runEnvWait(config, {
      timeoutSeconds: 5,
      pollIntervalSeconds: 1,
      processEnv: healthyEnv,
    });
    expect(waitResult.liferay?.health).toBe('healthy');

    const healthyResult = await runEnvIsHealthy(config, {
      processEnv: healthyEnv,
    });
    expect(healthyResult.healthy).toBe(true);

    const unhealthyBin = await createFakeDockerBin({stateStatus: 'exited', healthStatus: 'unhealthy'});
    const unhealthyEnv = {...process.env, PATH: `${unhealthyBin}:${process.env.PATH ?? ''}`};
    const unhealthyResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'env', 'is-healthy', '--format', 'json'], {
      cwd: repoRoot,
      env: unhealthyEnv,
    });
    expect(unhealthyResult.exitCode).toBe(1);
    expect(JSON.parse(unhealthyResult.stdout).healthy).toBe(false);
  }, 30000);
});

async function createEnvRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-env-advanced-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env.example'), 'COMPOSE_PROJECT_NAME=demo\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nBIND_IP=localhost\nLIFERAY_HTTP_PORT=8080\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  return repoRoot;
}
