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
import {runCli} from '../../src/testing/cli-entry.js';

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
    expect(
      await fs.pathExists(path.join(repoRoot, '.worktrees', 'issue-560', 'docker', 'data', 'envs', 'issue-560')),
    ).toBe(true);
  }, 15000);

  test('worktree setup from a feature branch uses the current branch HEAD as default base', async () => {
    const repoRoot = await createWorktreeRepoFixture();

    await fs.writeFile(path.join(repoRoot, 'feature.txt'), 'from-feature-branch\n');
    expect((await runProcess('git', ['checkout', '-b', 'feat/source-base'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('git', ['add', 'feature.txt'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('git', ['commit', '-m', 'feat: add feature marker'], {cwd: repoRoot})).exitCode).toBe(0);

    const featureHead = (await runProcess('git', ['rev-parse', 'HEAD'], {cwd: repoRoot})).stdout.trim();

    const result = await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-from-feature',
      printer: silentPrinter,
    });

    expect(result.ok).toBe(true);
    expect((await runProcess('git', ['branch', '--show-current'], {cwd: repoRoot})).stdout.trim()).toBe(
      'feat/source-base',
    );
    expect(
      (
        await runProcess('git', ['rev-parse', 'HEAD'], {cwd: path.join(repoRoot, '.worktrees', 'issue-from-feature')})
      ).stdout.trim(),
    ).toBe(featureHead);
    expect(await fs.readFile(path.join(repoRoot, '.worktrees', 'issue-from-feature', 'feature.txt'), 'utf8')).toBe(
      process.platform === 'win32' ? 'from-feature-branch\r\n' : 'from-feature-branch\n',
    );
  }, 15000);

  test('worktree env derives isolated compose settings from the main env', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    await fs.appendFile(
      path.join(repoRoot, 'docker', '.env'),
      [
        'POSTGRES_DATA_VOLUME_NAME=demo-postgres-data',
        'LIFERAY_DATA_VOLUME_NAME=demo-liferay-data',
        'LIFERAY_OSGI_STATE_VOLUME_NAME=demo-liferay-osgi-state',
        'ELASTICSEARCH_DATA_VOLUME_NAME=demo-elasticsearch-data',
      ].join('\n') + '\n',
    );
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
    expect(envFile).toContain('POSTGRES_DATA_VOLUME_NAME=demo-issue-561-postgres-data');
    expect(envFile).toContain('LIFERAY_DATA_VOLUME_NAME=demo-issue-561-liferay-data');
    expect(envFile).toContain('LIFERAY_OSGI_STATE_VOLUME_NAME=demo-issue-561-liferay-osgi-state');
    expect(envFile).toContain('ELASTICSEARCH_DATA_VOLUME_NAME=demo-issue-561-elasticsearch-data');
    expect(envFile).not.toContain('POSTGRES_DATA_VOLUME_NAME=demo-postgres-data');
    expect(envFile).not.toContain('LIFERAY_DATA_VOLUME_NAME=demo-liferay-data');
    expect(envFile).not.toContain('LIFERAY_OSGI_STATE_VOLUME_NAME=demo-liferay-osgi-state');
    expect(envFile).not.toContain('ELASTICSEARCH_DATA_VOLUME_NAME=demo-elasticsearch-data');
    expect(
      await fs.pathExists(
        path.join(
          repoRoot,
          '.worktrees',
          'issue-561',
          'liferay',
          'build',
          'docker',
          'configs',
          'dockerenv',
          'portal-ext.properties',
        ),
      ),
    ).toBe(true);
  }, 15000);

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
  }, 15000);

  test('worktree env syncs ignored local dependency artifacts from the main checkout', async () => {
    const repoRoot = await createWorktreeRepoFixture();

    await fs.writeFile(path.join(repoRoot, '.liferay-cli.local.yml'), 'liferay:\n  oauth2ClientId: local-id\n');
    await fs.ensureDir(path.join(repoRoot, 'node_modules'));
    await fs.writeFile(path.join(repoRoot, 'node_modules', '.marker'), 'root\n');
    await fs.writeFile(path.join(repoRoot, 'liferay', 'package.json'), '{"private":true}\n');
    await fs.writeFile(path.join(repoRoot, 'liferay', 'yarn.lock'), '# lockfile\n');
    await fs.writeFile(path.join(repoRoot, 'liferay', '.yarnrc'), '--install.ignore-engines true\n');
    await fs.ensureDir(path.join(repoRoot, 'liferay', 'node_modules'));
    await fs.writeFile(path.join(repoRoot, 'liferay', 'node_modules', '.marker'), 'liferay\n');
    await fs.ensureDir(path.join(repoRoot, 'liferay', 'node_modules_cache'));
    await fs.writeFile(path.join(repoRoot, 'liferay', 'node_modules_cache', '.marker'), 'cache\n');
    await fs.ensureDir(path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'osgi', 'configs'));
    await fs.writeFile(
      path.join(
        repoRoot,
        'liferay',
        'build',
        'docker',
        'configs',
        'dockerenv',
        'osgi',
        'configs',
        'com.liferay.portal.template.freemarker.configuration.FreeMarkerEngineConfiguration.config',
      ),
      'restrictedVariables=[ \\\n  "objectUtil", \\\n  ]\n',
    );

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-ignored-artifacts',
      withEnv: true,
      printer: silentPrinter,
    });

    const worktreeRoot = path.join(repoRoot, '.worktrees', 'issue-ignored-artifacts');
    expect(await fs.readFile(path.join(worktreeRoot, '.liferay-cli.local.yml'), 'utf8')).toContain('local-id');
    expect(await fs.readFile(path.join(worktreeRoot, 'liferay', 'package.json'), 'utf8')).toContain('"private":true');
    expect(await fs.readFile(path.join(worktreeRoot, 'liferay', 'yarn.lock'), 'utf8')).toContain('# lockfile');
    expect(await fs.readFile(path.join(worktreeRoot, 'liferay', '.yarnrc'), 'utf8')).toContain('ignore-engines');

    expect((await fs.lstat(path.join(worktreeRoot, 'node_modules'))).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(path.join(worktreeRoot, 'liferay', 'node_modules'))).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(path.join(worktreeRoot, 'liferay', 'node_modules_cache'))).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(worktreeRoot, 'node_modules', '.marker'), 'utf8')).toBe('root\n');
    expect(await fs.readFile(path.join(worktreeRoot, 'liferay', 'node_modules', '.marker'), 'utf8')).toBe('liferay\n');
    expect(await fs.readFile(path.join(worktreeRoot, 'liferay', 'node_modules_cache', '.marker'), 'utf8')).toBe(
      'cache\n',
    );
    expect(
      await fs.readFile(
        path.join(
          worktreeRoot,
          'liferay',
          'build',
          'docker',
          'configs',
          'dockerenv',
          'osgi',
          'configs',
          'com.liferay.portal.template.freemarker.configuration.FreeMarkerEngineConfiguration.config',
        ),
        'utf8',
      ),
    ).toContain('restrictedVariables');
  }, 15000);

  test('worktree env clones deploy cache artifacts and restores them into build/docker/deploy', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const mainDataRoot = path.join(repoRoot, 'docker', 'data', 'default');

    await fs.ensureDir(path.join(mainDataRoot, 'postgres-data'));
    await fs.ensureDir(path.join(mainDataRoot, 'liferay-deploy-cache'));
    await fs.writeFile(path.join(mainDataRoot, 'postgres-data', 'PG_VERSION'), '15\n');
    await fs.writeFile(path.join(mainDataRoot, 'liferay-deploy-cache', 'ub-theme.war'), 'theme\n');
    await fs.writeFile(path.join(mainDataRoot, 'liferay-deploy-cache', '.prepare-commit'), 'worktree123\n');

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-564-cache',
      printer: silentPrinter,
    });

    const result = await runWorktreeEnv({
      cwd: path.join(repoRoot, '.worktrees', 'issue-564-cache'),
    });

    expect(result.clonedState).toBe(true);
    expect(await fs.readFile(path.join(result.dataRoot, 'liferay-deploy-cache', 'ub-theme.war'), 'utf8')).toBe(
      'theme\n',
    );
    expect(
      await fs.readFile(
        path.join(repoRoot, '.worktrees', 'issue-564-cache', 'liferay', 'build', 'docker', 'deploy', 'ub-theme.war'),
        'utf8',
      ),
    ).toBe('theme\n');
    expect(
      await fs.readFile(
        path.join(repoRoot, '.worktrees', 'issue-564-cache', 'liferay', 'build', 'docker', '.prepare-commit'),
        'utf8',
      ),
    ).toBe('worktree123\n');
  }, 15000);

  test('worktree env refuses to clone main state without Btrfs while main is running', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const mainDataRoot = path.join(repoRoot, 'docker', 'data', 'default');
    const fakeBinDir = await createFakeDockerBin({stateStatus: 'running'});
    const previousPath = process.env.PATH;

    await fs.ensureDir(path.join(mainDataRoot, 'postgres-data'));
    await fs.writeFile(path.join(mainDataRoot, 'postgres-data', 'PG_VERSION'), '15\n');

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-564-hot-copy',
      printer: silentPrinter,
    });

    process.env.PATH = `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`;

    try {
      await expect(
        runWorktreeEnv({
          cwd: path.join(repoRoot, '.worktrees', 'issue-564-hot-copy'),
        }),
      ).rejects.toThrow(/main environment is running without Btrfs/i);
    } finally {
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
    }
  }, 20000);

  test('worktree setup --with-env fails in preflight before creating the git worktree when main is running without Btrfs', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const mainDataRoot = path.join(repoRoot, 'docker', 'data', 'default');
    const fakeBinDir = await createFakeDockerBin({stateStatus: 'running'});
    const previousPath = process.env.PATH;

    await fs.ensureDir(path.join(mainDataRoot, 'postgres-data'));
    await fs.writeFile(path.join(mainDataRoot, 'postgres-data', 'PG_VERSION'), '15\n');

    process.env.PATH = `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`;

    try {
      await expect(
        runWorktreeSetup({
          cwd: repoRoot,
          name: 'issue-564-preflight',
          withEnv: true,
          printer: silentPrinter,
        }),
      ).rejects.toThrow(/main environment is running without Btrfs/i);

      expect(await fs.pathExists(path.join(repoRoot, '.worktrees', 'issue-564-preflight'))).toBe(false);
    } finally {
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
    }
  }, 20000);

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
  }, 20000);

  test('btrfs refresh base copies the current main state into BTRFS_BASE', async () => {
    const repoRoot = await createWorktreeRepoFixture();

    if (process.platform !== 'linux') {
      return;
    }

    const btrfsRoot = path.join(repoRoot, 'docker', 'btrfs');
    const btrfsBase = path.join(btrfsRoot, 'base');
    const btrfsEnvs = path.join(btrfsRoot, 'envs');
    const mainDataRoot = path.join(repoRoot, 'docker', 'data', 'default');

    for (const subdir of [
      'postgres-data',
      'liferay-data',
      'liferay-osgi-state',
      'liferay-deploy-cache',
      'elasticsearch-data',
      'liferay-doclib',
    ]) {
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
    const env = {...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`};

    await runWorktreeSetup({
      cwd: repoRoot,
      name: 'issue-562',
      printer: silentPrinter,
    });

    const result = await runCli(['worktree', 'start', 'issue-562', '--format', 'json', '--no-wait', '--timeout', '5'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseWorktreeStartResult(result.stdout);
    expect(parsed.worktreeName).toBe('issue-562');
    expect(parsed.portalUrl).toContain('127.0.0.1:');
  }, 45000);

  test('env start inside a worktree prepares isolated compose settings before docker compose up', async () => {
    const repoRoot = await createWorktreeRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`};

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
    expect(calls).toEqual(
      expect.arrayContaining([
        `volume create --driver local --opt type=none --opt device=${path.join(repoRoot, 'docker', 'data', 'default', 'liferay-doclib')} --opt o=bind demo-doclib`,
      ]),
    );
  }, 45000);
});

async function createWorktreeRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-worktree-repo-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env.example'),
    'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nBIND_IP=127.0.0.1\nLDEV_STORAGE_PLATFORM=other\n',
  );
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nBIND_IP=127.0.0.1\nENV_DATA_ROOT=./data/default\nLDEV_STORAGE_PLATFORM=other\nLIFERAY_CLI_OAUTH2_CLIENT_ID=shared-id\nLIFERAY_CLI_OAUTH2_CLIENT_SECRET=shared-secret\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'));
  await fs.writeFile(
    path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'),
    'virtual.hosts.valid.hosts=*\n',
  );
  await fs.writeFile(
    path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-setup-wizard.properties'),
    'company.default.web.id=local.demo.test\ndefault.admin.email.address.prefix=admin\n',
  );
  await fs.writeFile(
    path.join(repoRoot, '.gitignore'),
    [
      '.liferay-cli.local.yml',
      'node_modules/',
      'liferay/package.json',
      'liferay/yarn.lock',
      'liferay/.yarnrc',
      'liferay/node_modules/',
      'liferay/node_modules_cache/',
      'liferay/build/docker/configs/dockerenv/osgi/configs/*.config',
    ].join('\n') + '\n',
  );

  await runProcess('git', ['init', '-b', 'main'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.email', 'tests@example.com'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.name', 'Tests'], {cwd: repoRoot});
  await runProcess('git', ['config', 'commit.gpgsign', 'false'], {cwd: repoRoot});
  await runProcess('git', ['add', '-A'], {cwd: repoRoot});
  await runProcess('git', ['commit', '-m', 'chore: init'], {cwd: repoRoot});

  return repoRoot;
}

function parseWorktreeStartResult(stdout: string): {worktreeName: string; portalUrl: string} {
  const parsed: unknown = JSON.parse(stdout);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Expected worktree start JSON output to be an object.');
  }

  const {worktreeName, portalUrl} = parsed as {worktreeName?: unknown; portalUrl?: unknown};
  if (typeof worktreeName !== 'string' || typeof portalUrl !== 'string') {
    throw new Error('Expected worktree start JSON output to include worktreeName and portalUrl strings.');
  }

  return {worktreeName, portalUrl};
}
