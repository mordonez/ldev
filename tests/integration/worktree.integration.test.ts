import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {loadConfig} from '../../src/core/config/load-config.js';
import {runEnvStart} from '../../src/features/env/env-start.js';
import {runWorktreeBtrfsRefreshBase} from '../../src/features/worktree/worktree-btrfs-refresh-base.js';
import {runWorktreeEnv} from '../../src/features/worktree/worktree-env.js';
import {runWorktreeSetup} from '../../src/features/worktree/worktree-setup.js';
import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = path.join(CLI_CWD, 'src', 'index.ts');
const silentPrinter = {
  format: 'text' as const,
  write: () => undefined,
  error: () => undefined,
  info: () => undefined,
};

describe('worktree integration', () => {
  test('worktree setup creates a real git worktree and prepares env when requested', async () => {
    const repoRoot = await createWorktreeRepoFixture();

    const result = await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-560',
      withEnv: true,
      printer: silentPrinter,
    });

    expect(result.ok).toBe(true);
    expect(await fs.pathExists(path.join(repoRoot, '.worktrees', 'issue-560', '.git'))).toBe(true);
    expect(await fs.pathExists(path.join(repoRoot, '.worktrees', 'issue-560', 'docker', '.env'))).toBe(true);
    expect(await fs.pathExists(path.join(repoRoot, '.worktrees', 'issue-560', 'docker', 'data', 'envs', 'issue-560'))).toBe(true);
  });

  test('worktree env derives isolated compose settings from the main env', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-561',
      printer: silentPrinter,
    });

    const result = await runWorktreeEnv({
      cwd: path.join(repoRoot, '.worktrees', 'issue-561'),
    });

    expect(result.composeProjectName).toBe('demo-issue-561');
    expect(result.portalUrl).toContain('127.0.0.1:');
    const envFile = await fs.readFile(path.join(repoRoot, '.worktrees', 'issue-561', 'docker', '.env'), 'utf8');
    expect(envFile).toContain('COMPOSE_PROJECT_NAME=demo-issue-561');
    expect(envFile).toContain('DOCLIB_VOLUME_NAME=demo-doclib');
    expect(await fs.pathExists(path.join(repoRoot, '.worktrees', 'issue-561', 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-ext.properties'))).toBe(true);
  });

  test('worktree env clones the main env state on first preparation', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const mainDataRoot = path.join(repoRoot, 'docker', 'data', 'default');

    await fs.ensureDir(path.join(mainDataRoot, 'postgres-data'));
    await fs.ensureDir(path.join(mainDataRoot, 'liferay-data'));
    await fs.ensureDir(path.join(mainDataRoot, 'liferay-osgi-state'));
    await fs.ensureDir(path.join(mainDataRoot, 'liferay-deploy-cache'));
    await fs.ensureDir(path.join(mainDataRoot, 'elasticsearch-data'));
    await fs.writeFile(path.join(mainDataRoot, 'postgres-data', 'PG_VERSION'), '15\n');
    await fs.writeFile(path.join(mainDataRoot, 'liferay-data', 'home.marker'), 'main-home\n');

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-564',
      printer: silentPrinter,
    });

    const result = await runWorktreeEnv({
      cwd: path.join(repoRoot, '.worktrees', 'issue-564'),
    });

    expect(result.clonedState).toBe(true);
    expect(await fs.readFile(path.join(result.dataRoot, 'postgres-data', 'PG_VERSION'), 'utf8')).toBe('15\n');
    expect(await fs.readFile(path.join(result.dataRoot, 'liferay-data', 'home.marker'), 'utf8')).toBe('main-home\n');
  });

  test('worktree env uses configured btrfs roots when enabled', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const btrfsRoot = path.join(repoRoot, 'docker', 'btrfs');
    const btrfsBase = path.join(btrfsRoot, 'base');
    const btrfsEnvs = path.join(btrfsRoot, 'envs');

    await fs.ensureDir(path.join(btrfsBase, 'postgres-data'));
    await fs.ensureDir(path.join(btrfsBase, 'liferay-data'));
    await fs.ensureDir(path.join(btrfsBase, 'liferay-osgi-state'));
    await fs.ensureDir(path.join(btrfsBase, 'liferay-deploy-cache'));
    await fs.ensureDir(path.join(btrfsBase, 'elasticsearch-data'));
    await fs.ensureDir(btrfsEnvs);
    await fs.appendFile(
      path.join(repoRoot, 'docker', '.env'),
      `BTRFS_ROOT=${btrfsRoot}\nBTRFS_BASE=${btrfsBase}\nBTRFS_ENVS=${btrfsEnvs}\nUSE_BTRFS_SNAPSHOTS=auto\n`,
    );

    await fs.writeFile(path.join(btrfsBase, 'liferay-data', 'home.marker'), 'btrfs-home\n');

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-565',
      printer: silentPrinter,
    });

    const result = await runWorktreeEnv({
      cwd: path.join(repoRoot, '.worktrees', 'issue-565'),
    });

    expect(result.btrfsEnabled).toBe(process.platform === 'linux');
    if (process.platform === 'linux') {
      expect(result.dataRoot).toBe(path.join(btrfsEnvs, 'issue-565'));
      expect(await fs.readFile(path.join(result.dataRoot, 'liferay-data', 'home.marker'), 'utf8')).toBe('btrfs-home\n');
    }
  });

  test('btrfs refresh base copies the current main state into BTRFS_BASE', async () => {
    const repoRoot = await createWorktreeRepoFixture();

    if (process.platform !== 'linux') {
      return;
    }

    const btrfsRoot = path.join(repoRoot, 'docker', 'btrfs');
    const btrfsBase = path.join(btrfsRoot, 'base');
    const btrfsEnvs = path.join(btrfsRoot, 'envs');
    const mainDataRoot = path.join(repoRoot, 'docker', 'data', 'default');

    for (const subdir of ['postgres-data', 'liferay-data', 'liferay-osgi-state', 'liferay-deploy-cache', 'elasticsearch-data', 'liferay-doclib']) {
      await fs.ensureDir(path.join(mainDataRoot, subdir));
      await fs.ensureDir(path.join(btrfsBase, subdir));
    }
    await fs.ensureDir(btrfsEnvs);
    await fs.appendFile(
      path.join(repoRoot, 'docker', '.env'),
      `BTRFS_ROOT=${btrfsRoot}\nBTRFS_BASE=${btrfsBase}\nBTRFS_ENVS=${btrfsEnvs}\nUSE_BTRFS_SNAPSHOTS=auto\n`,
    );

    await fs.writeFile(path.join(mainDataRoot, 'liferay-data', 'home.marker'), 'from-main\n');
    await fs.writeFile(path.join(btrfsBase, 'liferay-data', 'home.marker'), 'old-base\n');

    const result = await runWorktreeBtrfsRefreshBase({
      cwd: repoRoot,
    });

    expect(result.baseDataRoot).toBe(btrfsBase);
    expect(result.refreshedSubdirs).toContain('liferay-data');
    expect(await fs.readFile(path.join(btrfsBase, 'liferay-data', 'home.marker'), 'utf8')).toBe('from-main\n');
  });

  test('worktree start reuses env setup/start with fake docker', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-562',
      printer: silentPrinter,
    });

    const result = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'worktree', 'start', 'issue-562', '--format', 'json', '--timeout', '5'],
      {cwd: repoRoot, env},
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.worktreeName).toBe('issue-562');
    expect(parsed.portalUrl).toContain('127.0.0.1:');
  }, 20000);

  test('env start inside a worktree prepares isolated compose settings before docker compose up', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-563',
      printer: silentPrinter,
    });

    const worktreeRoot = path.join(repoRoot, '.worktrees', 'issue-563');
    const config = loadConfig({cwd: worktreeRoot, env});
    const result = await runEnvStart(config, {
      wait: false,
      processEnv: env,
      printer: silentPrinter,
    });

    expect(result.portalUrl).toContain('127.0.0.1:');

    const envFile = await fs.readFile(path.join(worktreeRoot, 'docker', '.env'), 'utf8');
    expect(envFile).toContain('COMPOSE_PROJECT_NAME=demo-issue-563');
    expect(envFile).toContain('DOCLIB_VOLUME_NAME=demo-doclib');
    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(expect.arrayContaining([
      `volume create --driver local --opt type=none --opt device=${path.join(repoRoot, 'docker', 'data', 'default', 'liferay-doclib')} --opt o=bind demo-doclib`,
    ]));
  }, 20000);
});

async function createWorktreeRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-worktree-repo-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env.example'),
    'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nBIND_IP=127.0.0.1\n',
  );
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nBIND_IP=127.0.0.1\nENV_DATA_ROOT=./data/default\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'));
  await fs.writeFile(path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'), 'virtual.hosts.valid.hosts=*\n');

  await runProcess('git', ['init', '-b', 'main'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.email', 'tests@example.com'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.name', 'Tests'], {cwd: repoRoot});
  await runProcess('git', ['add', '-A'], {cwd: repoRoot});
  await runProcess('git', ['commit', '-m', 'chore: init'], {cwd: repoRoot});

  return repoRoot;
}
