import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = path.join(CLI_CWD, 'src', 'index.ts');

describe('cleanup integration', () => {
  test('env clean removes local data root inside repo and requires --force', async () => {
    const repoRoot = await createRepoWithEnv();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const reject = await runProcess('npx', ['tsx', CLI_ENTRY, 'env', 'clean'], {cwd: repoRoot, env});
    expect(reject.exitCode).toBe(1);

    const dataRoot = path.join(repoRoot, 'docker', 'data', 'default');
    await fs.ensureDir(dataRoot);
    await fs.writeFile(path.join(dataRoot, 'marker.txt'), 'x');

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'env', 'clean', '--force', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });
    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(dataRoot)).toBe(false);

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(expect.arrayContaining(['compose down -v', 'volume rm demo-doclib']));
  }, 20000);

  test('env clean preserves ENV_DATA_ROOT outside the repo perimeter', async () => {
    const repoRoot = createTempDir('dev-cli-clean-env-external-');
    const externalRoot = createTempDir('dev-cli-clean-external-data-');
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    await fs.ensureDir(path.join(repoRoot, 'docker'));
    await fs.ensureDir(path.join(repoRoot, 'liferay'));
    await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n');
    await fs.writeFile(
      path.join(repoRoot, 'docker', '.env'),
      `COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nENV_DATA_ROOT=${externalRoot}\n`,
    );
    await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
    await fs.ensureDir(externalRoot);
    await fs.writeFile(path.join(externalRoot, 'marker.txt'), 'keep\n');

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'env', 'clean', '--force', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.dataRootDeleted).toBe(false);
    expect(parsed.dataRootSkipped).toBe(externalRoot);
    expect(await fs.pathExists(path.join(externalRoot, 'marker.txt'))).toBe(true);
  }, 20000);

  test('worktree clean removes a registered worktree and gc previews stale ones conservatively', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'worktree', 'setup', '--name', 'issue-701'], {cwd: repoRoot, env})).exitCode).toBe(0);
    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'worktree', 'setup', '--name', 'issue-702'], {cwd: repoRoot, env})).exitCode).toBe(0);

    const wt701 = path.join(repoRoot, '.worktrees', 'issue-701');
    const wt702 = path.join(repoRoot, '.worktrees', 'issue-702');
    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await fs.utimes(wt702, staleDate, staleDate);

    const missingForce = await runProcess('npx', ['tsx', CLI_ENTRY, 'worktree', 'clean', 'issue-701'], {cwd: repoRoot, env});
    expect(missingForce.exitCode).toBe(1);

    const cleanResult = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'worktree', 'clean', 'issue-701', '--force', '--delete-branch', '--format', 'json'],
      {cwd: repoRoot, env},
    );
    expect(cleanResult.exitCode).toBe(0);
    expect(await fs.pathExists(wt701)).toBe(false);

    const gcPreview = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'worktree', 'gc', '--days', '7', '--format', 'json'],
      {cwd: repoRoot, env},
    );
    expect(gcPreview.exitCode).toBe(0);
    expect(JSON.parse(gcPreview.stdout).candidates).toContain('issue-702');
  }, 30000);

  test('worktree clean preserves ENV_DATA_ROOT outside the worktree perimeter', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    const externalRoot = createTempDir('dev-cli-clean-wt-external-');

    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'worktree', 'setup', '--name', 'issue-703'], {cwd: repoRoot, env})).exitCode).toBe(0);

    const envFile = path.join(repoRoot, '.worktrees', 'issue-703', 'docker', '.env');
    const original = await fs.readFile(envFile, 'utf8');
    await fs.writeFile(envFile, `${original}ENV_DATA_ROOT=${externalRoot}\n`);
    await fs.ensureDir(externalRoot);
    await fs.writeFile(path.join(externalRoot, 'marker.txt'), 'keep\n');

    const result = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'worktree', 'clean', 'issue-703', '--force', '--format', 'json'],
      {cwd: repoRoot, env},
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.dataRootsSkipped).toContain(externalRoot);
    expect(await fs.pathExists(path.join(externalRoot, 'marker.txt'))).toBe(true);
  }, 30000);

  test('worktree clean removes BTRFS_ENVS data roots owned by the target worktree', async () => {
    if (process.platform !== 'linux') {
      return;
    }

    const repoRoot = await createWorktreeRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    const btrfsRoot = path.join(repoRoot, 'docker', 'btrfs');
    const btrfsBase = path.join(btrfsRoot, 'base');
    const btrfsEnvs = path.join(btrfsRoot, 'envs');
    const worktreeDataRoot = path.join(btrfsEnvs, 'issue-704');

    await fs.ensureDir(path.join(btrfsBase, 'postgres-data'));
    await fs.ensureDir(worktreeDataRoot);
    await fs.ensureDir(path.join(worktreeDataRoot, 'postgres-data'));
    await fs.appendFile(
      path.join(repoRoot, 'docker', '.env'),
      `BTRFS_ROOT=${btrfsRoot}\nBTRFS_BASE=${btrfsBase}\nBTRFS_ENVS=${btrfsEnvs}\nUSE_BTRFS_SNAPSHOTS=auto\n`,
    );

    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'worktree', 'setup', '--name', 'issue-704'], {cwd: repoRoot, env})).exitCode).toBe(0);

    const envFile = path.join(repoRoot, '.worktrees', 'issue-704', 'docker', '.env');
    const original = await fs.readFile(envFile, 'utf8');
    await fs.writeFile(envFile, `${original}ENV_DATA_ROOT=${worktreeDataRoot}\n`);

    const result = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'worktree', 'clean', 'issue-704', '--force', '--format', 'json'],
      {cwd: repoRoot, env},
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.dataRootsDeleted).toContain(worktreeDataRoot);
    expect(parsed.dataRootsSkipped).not.toContain(worktreeDataRoot);
    expect(await fs.pathExists(worktreeDataRoot)).toBe(false);
  }, 30000);

  test('worktree clean can be re-run after the git worktree is already gone and still removes owned BTRFS data', async () => {
    if (process.platform !== 'linux') {
      return;
    }

    const repoRoot = await createWorktreeRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    const btrfsRoot = path.join(repoRoot, 'docker', 'btrfs');
    const btrfsBase = path.join(btrfsRoot, 'base');
    const btrfsEnvs = path.join(btrfsRoot, 'envs');
    const worktreeDataRoot = path.join(btrfsEnvs, 'issue-705');

    await fs.ensureDir(path.join(btrfsBase, 'postgres-data'));
    await fs.ensureDir(worktreeDataRoot);
    await fs.ensureDir(path.join(worktreeDataRoot, 'postgres-data'));
    await fs.appendFile(
      path.join(repoRoot, 'docker', '.env'),
      `BTRFS_ROOT=${btrfsRoot}\nBTRFS_BASE=${btrfsBase}\nBTRFS_ENVS=${btrfsEnvs}\nUSE_BTRFS_SNAPSHOTS=auto\n`,
    );

    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'worktree', 'setup', '--name', 'issue-705'], {cwd: repoRoot, env})).exitCode).toBe(0);

    const worktreeDir = path.join(repoRoot, '.worktrees', 'issue-705');
    const envFile = path.join(worktreeDir, 'docker', '.env');
    const original = await fs.readFile(envFile, 'utf8');
    await fs.writeFile(envFile, `${original}ENV_DATA_ROOT=${worktreeDataRoot}\n`);

    expect((await runProcess('git', ['worktree', 'remove', worktreeDir, '--force'], {cwd: repoRoot})).exitCode).toBe(0);
    expect(await fs.pathExists(worktreeDir)).toBe(false);

    const result = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'worktree', 'clean', 'issue-705', '--force', '--format', 'json'],
      {cwd: repoRoot, env},
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.dataRootsDeleted).toContain(worktreeDataRoot);
    expect(await fs.pathExists(worktreeDataRoot)).toBe(false);

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).not.toContain('compose down --remove-orphans');
  }, 30000);
});

async function createRepoWithEnv(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-clean-env-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nENV_DATA_ROOT=./data/default\n');
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  return repoRoot;
}

async function createWorktreeRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-clean-worktree-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env.example'), 'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\n');
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'));

  await runProcess('git', ['init', '-b', 'main'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.email', 'tests@example.com'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.name', 'Tests'], {cwd: repoRoot});
  await runProcess('git', ['add', '-A'], {cwd: repoRoot});
  await runProcess('git', ['commit', '-m', 'chore: init'], {cwd: repoRoot});
  return repoRoot;
}
