import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

describe('osgi integration', () => {
  test('osgi status returns gogo output', async () => {
    const repoRoot = await createOsgiRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['osgi', 'status', 'com.test.bundle', '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.output).toContain('com.test.bundle');
  }, 45000);

  test('osgi diag resolves bundle id and returns diag output', async () => {
    const repoRoot = await createOsgiRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['osgi', 'diag', 'com.test.bundle', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.bundleId).toBe('42');
    expect(parsed.output).toContain('No unresolved constraints');
  }, 30000);

  test('osgi thread-dump and heap-dump invoke the expected scripts', async () => {
    const repoRoot = await createOsgiRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    expect(
      (
        await runCli(['osgi', 'thread-dump', '--count', '3', '--interval', '2'], {
          cwd: repoRoot,
          env,
        })
      ).exitCode,
    ).toBe(0);
    expect((await runCli(['osgi', 'heap-dump'], {cwd: repoRoot, env})).exitCode).toBe(0);

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining([
        'compose exec liferay generate_thread_dump.sh -d /opt/liferay/dumps -n 3 -s 2',
        'compose exec liferay generate_heap_dump.sh -d /opt/liferay/dumps',
      ]),
    );
  }, 30000);
});

async function createOsgiRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-osgi-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'osgi', 'configs'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nPOSTGRES_USER=liferay\nPOSTGRES_DB=liferay\n',
  );
  await fs.writeFile(
    path.join(
      repoRoot,
      'liferay',
      'configs',
      'dockerenv',
      'osgi',
      'configs',
      'dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration.config',
    ),
    'externalReferenceCode="ldev"\n',
  );
  return repoRoot;
}
