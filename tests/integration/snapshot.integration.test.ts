import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

describe('snapshot integration', () => {
  test('snapshot writes a manifest, db dump and repo-state copy', async () => {
    const repoRoot = await createSnapshotRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_PG_DUMP_OUTPUT: 'SELECT 1;\n',
    };
    const snapshotDir = path.join(repoRoot, '.ldev', 'snapshots', 'test-bundle');

    const result = await runCli(['snapshot', '--output', snapshotDir, '--json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(await fs.pathExists(parsed.manifestFile)).toBe(true);
    expect(await fs.readFile(parsed.databaseDumpFile, 'utf8')).toContain('SELECT 1;');
    expect(
      await fs.pathExists(
        path.join(snapshotDir, 'repo-state', 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'),
      ),
    ).toBe(true);
  }, 30000);

  test('restore rehydrates repo-state and imports the bundled dump', async () => {
    const repoRoot = await createSnapshotRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_PSQL_OUTPUT: 'ok\n',
    };
    const snapshotDir = path.join(repoRoot, '.ldev', 'snapshots', 'restore-bundle');
    await fs.ensureDir(path.join(snapshotDir, 'repo-state', 'liferay', 'configs', 'dockerenv'));
    await fs.writeJson(path.join(snapshotDir, 'manifest.json'), {
      capturedAt: new Date().toISOString(),
      databaseDumpFile: 'database.sql',
      copiedPaths: ['liferay/configs/dockerenv/portal-ext.properties'],
    });
    await fs.writeFile(path.join(snapshotDir, 'database.sql'), 'SELECT 1;\n');
    await fs.writeFile(
      path.join(snapshotDir, 'repo-state', 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'),
      'restored=true\n',
    );
    await fs.writeFile(path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'), 'old=false\n');

    const result = await runCli(['restore', snapshotDir, '--force', '--json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    expect(
      await fs.readFile(path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'), 'utf8'),
    ).toContain('restored=true');

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining([
        'compose up -d postgres',
        'compose exec -T postgres psql -U liferay -d liferay -c SELECT 1',
        'compose exec -T postgres psql -U liferay -d liferay',
      ]),
    );
  }, 30000);
});

async function createSnapshotRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-snapshot-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'docker', 'data', 'default'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'global'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'templates', 'application_display'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'fragments'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  postgres:\n  liferay:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\nPOSTGRES_USER=liferay\nPOSTGRES_DB=liferay\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.writeFile(path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'), 'foo=bar\n');
  return repoRoot;
}
