import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

describe('new features integration', () => {
  test('logs diagnose groups exceptions from docker compose logs', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_LOGS_OUTPUT:
        '2026-03-28T10:00:00Z WARN boot warning\\n2026-03-28T10:00:01Z com.liferay.portal.kernel.exception.PortalException: broken\\n\tat Foo\\n2026-03-28T10:00:02Z com.liferay.portal.kernel.exception.PortalException: broken\\n\tat Foo\\n',
    };

    const result = await runCli(['logs', 'diagnose', '--json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.warnings).toBe(1);
    expect(parsed.exceptions[0].class).toContain('PortalException');
    expect(parsed.exceptions[0].count).toBe(2);
  }, 60000);

  test('logs diagnose forwards the requested since window instead of the subcommand default', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_LOGS_OUTPUT:
        '2026-03-28T10:00:01Z com.liferay.portal.kernel.exception.PortalException: broken\\n\tat Foo\\n',
    };

    const result = await runCli(['logs', 'diagnose', '--since', '90m', '--json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.since).toBe('90m');

    const dockerCalls = await readFakeDockerCalls(fakeBinDir);
    expect(dockerCalls).toEqual(
      expect.arrayContaining([expect.stringContaining('compose logs --no-color --since=90m liferay')]),
    );
  }, 45000);

  test('db query executes SQL through the postgres container', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_PSQL_OUTPUT: ' count\\n-------\\n    7\\n(1 row)\\n',
    };

    const result = await runCli(['db', 'query', 'SELECT count(*) FROM Foo', '--json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.output).toContain('7');
    expect(parsed.query).toContain('SELECT count(*)');
    expect(parsed.rows).toEqual([{count: '7'}]);
    expect(parsed.rowCount).toBe(1);
  }, 45000);

  test('db query defaults to text output for terminal use', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_PSQL_OUTPUT: ' count\\n-------\\n    7\\n(1 row)\\n',
    };

    const result = await runCli(['db', 'query', 'SELECT count(*) FROM Foo'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('count');
    expect(result.stdout).toContain('(1 row)');
    expect(() => JSON.parse(result.stdout)).toThrow();
  }, 45000);

  test('deploy status reports local artifacts', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    await fs.ensureDir(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy'));
    await fs.writeFile(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy', 'foo.jar'), 'jar\n');

    const result = await runCli(['deploy', 'status', '--json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.modules).toEqual(expect.arrayContaining([expect.objectContaining({name: 'foo'})]));
  }, 45000);

  test('health and context expose machine-readable diagnostics', async () => {
    const repoRoot = await createEnvRepoFixture();
    const unhealthyBin = await createFakeDockerBin({stateStatus: 'exited', healthStatus: 'unhealthy'});
    const env = {...process.env, PATH: `${unhealthyBin}:${process.env.PATH ?? ''}`};

    const healthResult = await runCli(['health', '--json'], {cwd: repoRoot, env});
    expect(healthResult.exitCode).toBe(0);
    expect(JSON.parse(healthResult.stdout).overall).toBe('degraded');

    const contextResult = await runCli(['context', '--json'], {cwd: repoRoot, env});
    expect(contextResult.exitCode).toBe(0);
    const parsedContext = JSON.parse(contextResult.stdout);
    expect(Array.isArray(parsedContext.issues)).toBe(true);
    expect(parsedContext.issues.some((issue: {code: string}) => issue.code === 'liferay-not-running')).toBe(true);
  }, 45000);
});

async function createEnvRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-new-features-');
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
