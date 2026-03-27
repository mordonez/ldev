import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = path.join(CLI_CWD, 'src', 'index.ts');

describe('osgi integration', () => {
  test('osgi status returns gogo output', async () => {
    const repoRoot = await createOsgiRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'osgi', 'status', 'com.test.bundle', '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.output).toContain('com.test.bundle');
  }, 20000);

  test('osgi diag resolves bundle id and returns diag output', async () => {
    const repoRoot = await createOsgiRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'osgi', 'diag', 'com.test.bundle', '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.bundleId).toBe('42');
    expect(parsed.output).toContain('No unresolved constraints');
  }, 20000);

  test('osgi thread-dump and heap-dump invoke the expected scripts', async () => {
    const repoRoot = await createOsgiRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'osgi', 'thread-dump', '--count', '3', '--interval', '2'], {cwd: repoRoot, env})).exitCode).toBe(0);
    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'osgi', 'heap-dump'], {cwd: repoRoot, env})).exitCode).toBe(0);

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(expect.arrayContaining([
      'compose exec liferay generate_thread_dump.sh -d /opt/liferay/dumps -n 3 -s 2',
      'compose exec liferay generate_heap_dump.sh -d /opt/liferay/dumps',
    ]));
  }, 20000);

  test('osgi liferaycli-creds returns OAuth credentials from postgres', async () => {
    const repoRoot = await createOsgiRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'osgi', 'liferaycli-creds', '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.readWrite.clientId).toBe('client-id');
    expect(parsed.readOnly?.clientId).toBe('readonly-id');
  }, 20000);
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
      'dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration.config',
    ),
    'externalReferenceCode="liferay-cli"\n',
  );
  return repoRoot;
}
