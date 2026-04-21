import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {loadConfig} from '../../src/core/config/load-config.js';
import {runEnvInit} from '../../src/features/env/env-init.js';
import {runEnvRecreate} from '../../src/features/env/env-recreate.js';
import {runEnvRestore} from '../../src/features/env/env-restore.js';
import {runEnvSetup} from '../../src/features/env/env-setup.js';
import {runProcess} from '../../src/core/platform/process.js';
import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

type EnvStatusPayload = {
  composeProjectName: string;
  liferay: {
    state: string;
    health: string;
  };
  services: Array<{service: string}>;
};

type EnvStartPayload = {
  portalUrl: string;
  waitedForHealth: boolean;
  activationKeyFile?: string;
};

describe('env integration', () => {
  test('env init bootstraps docker/.env from .env.example without duplicating keys', async () => {
    const repoRoot = await createEnvRepoFixture();
    await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'A=1\nB=2\n');

    const result = await runEnvInit(loadConfig({cwd: repoRoot, env: process.env}));

    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(repoRoot, 'docker', '.env'), 'utf8')).toBe(
      'A=1\nB=2\nC=3\nCOMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nENV_DATA_ROOT=./data/default\nLDEV_STORAGE_PLATFORM=other\n',
    );
  });

  test('env status json reports local compose state via fake docker', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['status', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<EnvStatusPayload>(result.stdout);
    expect(parsed.composeProjectName).toBe('demo');
    expect(parsed.liferay.state).toBe('running');
    expect(parsed.liferay.health).toBe('healthy');
    expect(parsed.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({service: 'liferay'}),
        expect.objectContaining({service: 'postgres'}),
      ]),
    );
  }, 20000);

  test('env setup and env start use fake docker and remain controlled', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const setupResult = await runEnvSetup(loadConfig({cwd: repoRoot, env: process.env}), {
      processEnv,
    });
    expect(setupResult.ok).toBe(true);
    expect(await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'postgres-data'))).toBe(true);

    const startResult = await runCli(['start', '--format', 'json', '--timeout', '5'], {
      cwd: repoRoot,
      env: processEnv,
    });
    expect(startResult.exitCode).toBe(0);
    const parsed = parseTestJson<EnvStartPayload>(startResult.stdout);
    expect(parsed.portalUrl).toBe('http://localhost:8080');
    expect(parsed.waitedForHealth).toBe(true);
    expect(
      await fs.pathExists(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-ext.properties'),
      ),
    ).toBe(true);
    expect(await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-doclib'))).toBe(true);
    const expectedDoclibPath = await fs.realpath(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-doclib'));
    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining([
        `volume create --driver local --opt type=none --opt device=${expectedDoclibPath} --opt o=bind demo-doclib`,
      ]),
    );
  }, 45000);

  test('env start respects DOCLIB_PATH and does not remount doclib to the default bind path', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const customDoclibPath = path.join(repoRoot, 'external-doclib');
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    await fs.ensureDir(customDoclibPath);
    await fs.writeFile(
      path.join(repoRoot, 'docker', '.env'),
      'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nDOCLIB_PATH=' +
        customDoclibPath +
        '\nENV_DATA_ROOT=./data/default\nBIND_IP=localhost\nLIFERAY_HTTP_PORT=8080\n',
    );

    const startResult = await runCli(['start', '--format', 'json', '--timeout', '5'], {
      cwd: repoRoot,
      env: processEnv,
    });

    expect(startResult.exitCode).toBe(0);
    const expectedCustomDoclibPath = path.resolve(customDoclibPath);
    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining([
        `volume create --driver local --opt type=none --opt device=${expectedCustomDoclibPath} --opt o=bind demo-doclib`,
      ]),
    );
    expect(
      calls.some(
        (call) =>
          call.includes('volume create') &&
          call.includes(`${path.sep}docker${path.sep}data${path.sep}default${path.sep}liferay-doclib`),
      ),
    ).toBe(false);
  }, 30000);

  test('env setup warms deploy cache on first run when workspace artifacts are not cached yet', async () => {
    const repoRoot = await createEnvFullRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const setupResult = await runEnvSetup(loadConfig({cwd: repoRoot, env: process.env}), {
      skipPull: true,
      processEnv,
    });

    expect(setupResult.ok).toBe(true);
    expect(setupResult.warmedDeployCache).toBe(true);
    expect(
      await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache', 'demo.jar')),
    ).toBe(true);
    const gradleCalls = await fs.readFile(path.join(repoRoot, 'liferay', '.gradle-calls.log'), 'utf8');
    expect(gradleCalls).toContain('dockerDeploy');
    expect(gradleCalls).toContain('-Pliferay.workspace.environment=dockerenv');
  }, 30000);

  test('env setup does not fail on a freshly initialized repo without HEAD', async () => {
    const repoRoot = await createEnvUncommittedRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const setupResult = await runEnvSetup(loadConfig({cwd: repoRoot, env: process.env}), {
      skipPull: true,
      processEnv,
    });

    expect(setupResult.ok).toBe(true);
    expect(setupResult.warmedDeployCache).toBe(false);
    expect(
      await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache', 'demo.jar')),
    ).toBe(false);
    expect(await fs.pathExists(path.join(repoRoot, 'liferay', '.gradle-calls.log'))).toBe(false);
  }, 30000);

  test('env start restores build/docker/deploy artifacts from deploy cache when build deploy is empty', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    const cacheDir = path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache');
    const buildDeployDir = path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy');

    await fs.ensureDir(cacheDir);
    await fs.ensureDir(buildDeployDir);
    await fs.writeFile(path.join(cacheDir, 'cached-module.jar'), 'cached\n');
    await fs.writeFile(path.join(cacheDir, '.prepare-commit'), 'abc123\n');

    const startResult = await runCli(['start', '--format', 'json', '--timeout', '5'], {
      cwd: repoRoot,
      env: processEnv,
    });

    expect(startResult.exitCode).toBe(0);
    expect(await fs.readFile(path.join(buildDeployDir, 'cached-module.jar'), 'utf8')).toBe('cached\n');
    expect(await fs.readFile(path.join(repoRoot, 'liferay', 'build', 'docker', '.prepare-commit'), 'utf8')).toBe(
      'abc123\n',
    );
  }, 30000);

  test('env recreate restores build/docker/deploy artifacts from deploy cache before recreating liferay', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    const cacheDir = path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache');
    const buildDeployDir = path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy');

    await fs.ensureDir(cacheDir);
    await fs.ensureDir(buildDeployDir);
    await fs.writeFile(path.join(cacheDir, 'cached-module.jar'), 'cached\n');
    await fs.writeFile(path.join(cacheDir, '.prepare-commit'), 'recreate123\n');

    const result = await runEnvRecreate(loadConfig({cwd: repoRoot, env: process.env}), {
      processEnv,
      timeoutSeconds: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.restoredDeployArtifacts).toBe(1);
    expect(await fs.readFile(path.join(buildDeployDir, 'cached-module.jar'), 'utf8')).toBe('cached\n');
    expect(await fs.readFile(path.join(repoRoot, 'liferay', 'build', 'docker', '.prepare-commit'), 'utf8')).toBe(
      'recreate123\n',
    );

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(expect.arrayContaining(['compose stop liferay', 'compose up -d --force-recreate liferay']));
  }, 30000);

  test('env start can copy a local activation key into the project before boot', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    const activationKeySource = path.join(createTempDir('dev-cli-activation-key-'), 'activation-key-sample.xml');
    const modulesDir = path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'osgi', 'modules');

    await fs.ensureDir(path.dirname(activationKeySource));
    await fs.writeFile(activationKeySource, '<xml>license</xml>\n');
    await fs.ensureDir(modulesDir);
    await fs.writeFile(path.join(modulesDir, 'activation-key-old.xml'), '<xml>old</xml>\n');

    const startResult = await runCli(
      ['start', '--activation-key-file', activationKeySource, '--format', 'json', '--timeout', '5'],
      {cwd: repoRoot, env: processEnv},
    );

    expect(startResult.exitCode).toBe(0);
    const parsed = parseTestJson<EnvStartPayload>(startResult.stdout);
    expect(parsed.activationKeyFile).toBe(await fs.realpath(path.join(modulesDir, 'activation-key-sample.xml')));
    expect(await fs.readFile(path.join(modulesDir, 'activation-key-sample.xml'), 'utf8')).toBe('<xml>license</xml>\n');
    expect(await fs.pathExists(path.join(modulesDir, 'activation-key-old.xml'))).toBe(false);
  }, 30000);

  test('env start seeds build/docker/configs/dockerenv from configs/common + configs/local when dockerenv is absent', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    await fs.remove(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'));
    await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'common', 'osgi', 'configs'));
    await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'local', 'osgi', 'modules'));
    await fs.writeFile(
      path.join(repoRoot, 'liferay', 'configs', 'common', 'portal-ext.properties'),
      'include-and-override=portal-developer.properties\n',
    );
    await fs.writeFile(
      path.join(repoRoot, 'liferay', 'configs', 'common', 'osgi', 'configs', 'common.config'),
      'common=true\n',
    );
    await fs.writeFile(
      path.join(repoRoot, 'liferay', 'configs', 'local', 'portal-setup-wizard.properties'),
      'setup.wizard.enabled=false\n',
    );
    await fs.writeFile(
      path.join(repoRoot, 'liferay', 'configs', 'local', 'osgi', 'modules', 'activation-key-sample.xml'),
      '<xml>license</xml>\n',
    );

    const startResult = await runCli(['start', '--format', 'json', '--timeout', '5'], {
      cwd: repoRoot,
      env: processEnv,
    });

    expect(startResult.exitCode).toBe(0);
    expect(
      await fs.readFile(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-ext.properties'),
        'utf8',
      ),
    ).toBe('include-and-override=portal-developer.properties\n');
    expect(
      await fs.readFile(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-setup-wizard.properties'),
        'utf8',
      ),
    ).toBe('setup.wizard.enabled=false\n');
    expect(
      await fs.readFile(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'osgi', 'configs', 'common.config'),
        'utf8',
      ),
    ).toBe('common=true\n');
    expect(
      await fs.readFile(
        path.join(
          repoRoot,
          'liferay',
          'build',
          'docker',
          'configs',
          'dockerenv',
          'osgi',
          'modules',
          'activation-key-sample.xml',
        ),
        'utf8',
      ),
    ).toBe('<xml>license</xml>\n');
  }, 30000);

  test('env start preserves generated configs and overlays configs/dockerenv when dockerenv exists', async () => {
    const repoRoot = await createEnvRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

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
      'restrictedVariables=["httpUtilUnsafe"]\n',
    );
    await fs.writeFile(
      path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.local.properties'),
      'default.landing.page.path=/web/guest\n',
    );

    const startResult = await runCli(['start', '--format', 'json', '--timeout', '5'], {
      cwd: repoRoot,
      env: processEnv,
    });

    expect(startResult.exitCode).toBe(0);
    expect(
      await fs.readFile(
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
        'utf8',
      ),
    ).toBe('restrictedVariables=["httpUtilUnsafe"]\n');
    expect(
      await fs.readFile(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-ext.local.properties'),
        'utf8',
      ),
    ).toBe('default.landing.page.path=/web/guest\n');
  }, 30000);

  test('env restore rehydrates a worktree from BTRFS_BASE, preserves local deploy cache, and merges missing artifacts', async () => {
    const repoRoot = createTempDir('dev-cli-env-restore-main-');
    const worktreeRoot = path.join(repoRoot, '.worktrees', 'issue-1');
    const mainDataRoot = path.join(repoRoot, 'docker', 'btrfs', 'main');
    const btrfsBase = path.join(repoRoot, 'docker', 'btrfs', 'base');
    const worktreeDataRoot = path.join(repoRoot, 'docker', 'btrfs', 'envs', 'issue-1');
    const worktreeBuildDeployDir = path.join(worktreeRoot, 'liferay', 'build', 'docker', 'deploy');
    const fakeBinDir = await createFakeDockerBin();
    const processEnv = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    await fs.ensureDir(path.join(repoRoot, 'docker'));
    await fs.ensureDir(path.join(repoRoot, 'liferay'));
    await fs.ensureDir(path.join(worktreeRoot, 'docker'));
    await fs.ensureDir(path.join(worktreeRoot, 'liferay'));
    await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
    await fs.writeFile(path.join(worktreeRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
    await fs.writeFile(
      path.join(repoRoot, 'docker', '.env'),
      `COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./btrfs/main\nLDEV_STORAGE_PLATFORM=other\nPOSTGRES_DATA_MODE=bind\nBTRFS_ROOT=./btrfs\nBTRFS_BASE=./btrfs/base\nBTRFS_ENVS=./btrfs/envs\nUSE_BTRFS_SNAPSHOTS=true\n`,
    );
    await fs.writeFile(
      path.join(worktreeRoot, 'docker', '.env'),
      `COMPOSE_PROJECT_NAME=demo-issue-1\nENV_DATA_ROOT=${worktreeDataRoot}\nLDEV_STORAGE_PLATFORM=other\nPOSTGRES_DATA_MODE=bind\nBTRFS_ROOT=${path.join(repoRoot, 'docker', 'btrfs')}\nBTRFS_BASE=${btrfsBase}\nBTRFS_ENVS=${path.join(repoRoot, 'docker', 'btrfs', 'envs')}\nUSE_BTRFS_SNAPSHOTS=true\n`,
    );

    const restoreSourceDataRoot = process.platform === 'linux' ? btrfsBase : mainDataRoot;
    // Postgres restore always reads from the main env data root, even when the
    // rest of the worktree data comes from BTRFS_BASE.
    await fs.ensureDir(path.join(mainDataRoot, 'postgres-data'));
    await fs.ensureDir(path.join(restoreSourceDataRoot, 'liferay-data'));
    await fs.ensureDir(path.join(restoreSourceDataRoot, 'liferay-deploy-cache'));
    await fs.writeFile(path.join(mainDataRoot, 'postgres-data', 'PG_VERSION'), '15\n');
    await fs.writeFile(path.join(restoreSourceDataRoot, 'liferay-data', 'from-base.txt'), 'base\n');
    await fs.writeFile(path.join(restoreSourceDataRoot, 'liferay-deploy-cache', 'shared.jar'), 'from-main\n');
    await fs.writeFile(path.join(restoreSourceDataRoot, 'liferay-deploy-cache', '.prepare-commit'), 'base123\n');

    await fs.ensureDir(path.join(worktreeDataRoot, 'liferay-deploy-cache'));
    await fs.writeFile(path.join(worktreeDataRoot, 'liferay-deploy-cache', 'local.jar'), 'keep\n');
    await fs.ensureDir(worktreeBuildDeployDir);

    const result = await runEnvRestore(loadConfig({cwd: worktreeRoot, env: process.env}), {
      processEnv,
    });

    expect(result.sourceDataRoot).toBe(restoreSourceDataRoot);
    expect(result.preservedDeployCache).toBe(true);
    expect(result.restoredDeployArtifacts).toBe(2);
    expect(await fs.pathExists(path.join(worktreeDataRoot, 'postgres-data', 'PG_VERSION'))).toBe(true);
    expect(await fs.readFile(path.join(worktreeDataRoot, 'liferay-data', 'from-base.txt'), 'utf8')).toBe('base\n');
    expect(await fs.readFile(path.join(worktreeDataRoot, 'liferay-deploy-cache', 'local.jar'), 'utf8')).toBe('keep\n');
    expect(await fs.readFile(path.join(worktreeDataRoot, 'liferay-deploy-cache', 'shared.jar'), 'utf8')).toBe(
      'from-main\n',
    );
    expect(await fs.readFile(path.join(worktreeDataRoot, 'liferay-deploy-cache', '.prepare-commit'), 'utf8')).toBe(
      'base123\n',
    );
    expect(await fs.readFile(path.join(worktreeBuildDeployDir, 'local.jar'), 'utf8')).toBe('keep\n');
    expect(await fs.readFile(path.join(worktreeBuildDeployDir, 'shared.jar'), 'utf8')).toBe('from-main\n');
  }, 30000);
});

async function createEnvRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-env-repo-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env.example'),
    'A=1\nB=2\nC=3\nCOMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nENV_DATA_ROOT=./data/default\nLDEV_STORAGE_PLATFORM=other\n',
  );
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nDOCLIB_VOLUME_NAME=demo-doclib\nENV_DATA_ROOT=./data/default\nLDEV_STORAGE_PLATFORM=other\nBIND_IP=localhost\nLIFERAY_HTTP_PORT=8080\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'));
  await fs.writeFile(
    path.join(repoRoot, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'),
    'virtual.hosts.valid.hosts=*\n',
  );
  return repoRoot;
}

async function createEnvFullRepoFixture(): Promise<string> {
  const repoRoot = await createEnvRepoFixture();
  const liferayDir = path.join(repoRoot, 'liferay');
  await fs.ensureDir(path.join(liferayDir, 'configs', 'dockerenv'));
  await fs.ensureDir(path.join(repoRoot, 'docker', 'sql', 'post-import.d'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'sql', 'post-import.d', '010-local.sql'), 'select 1;\n');
  await fs.writeFile(
    path.join(liferayDir, 'gradlew'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${liferayDir}/.gradle-calls.log"
if [[ "$*" == *"dockerDeploy"* ]]; then
  mkdir -p "${liferayDir}/build/docker/deploy"
  printf 'jar\\n' > "${liferayDir}/build/docker/deploy/demo.jar"
  exit 0
fi
exit 0
`,
    {mode: 0o755},
  );
  await fs.writeFile(
    path.join(liferayDir, 'gradlew.bat'),
    `@echo off\r
echo %*>> "${liferayDir.replaceAll('\\', '\\\\')}\\\\.gradle-calls.log"\r
echo %* | findstr /C:"dockerDeploy" >nul\r
if errorlevel 1 exit /b 0\r
mkdir "${liferayDir.replaceAll('\\', '\\\\')}\\\\build\\\\docker\\\\deploy" >nul 2>&1\r
echo jar> "${liferayDir.replaceAll('\\', '\\\\')}\\\\build\\\\docker\\\\deploy\\\\demo.jar"\r
exit /b 0\r
`,
  );

  await runProcess('git', ['init', '-b', 'main'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.email', 'tests@example.com'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.name', 'Tests'], {cwd: repoRoot});
  await runProcess('git', ['config', 'commit.gpgsign', 'false'], {cwd: repoRoot});
  await runProcess('git', ['add', '-A'], {cwd: repoRoot});
  await runProcess('git', ['commit', '-m', 'chore: init'], {cwd: repoRoot});

  return repoRoot;
}

async function createEnvUncommittedRepoFixture(): Promise<string> {
  const repoRoot = await createEnvRepoFixture();
  const liferayDir = path.join(repoRoot, 'liferay');
  await fs.ensureDir(path.join(liferayDir, 'configs', 'dockerenv'));
  await fs.writeFile(
    path.join(liferayDir, 'gradlew'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${liferayDir}/.gradle-calls.log"
if [[ "$*" == *"dockerDeploy"* ]]; then
  mkdir -p "${liferayDir}/build/docker/deploy"
  printf 'jar\\n' > "${liferayDir}/build/docker/deploy/demo.jar"
  exit 0
fi
exit 0
`,
    {mode: 0o755},
  );
  await fs.writeFile(
    path.join(liferayDir, 'gradlew.bat'),
    `@echo off\r
echo %*>> "${liferayDir.replaceAll('\\', '\\\\')}\\\\.gradle-calls.log"\r
echo %* | findstr /C:"dockerDeploy" >nul\r
if errorlevel 1 exit /b 0\r
mkdir "${liferayDir.replaceAll('\\', '\\\\')}\\\\build\\\\docker\\\\deploy" >nul 2>&1\r
echo jar> "${liferayDir.replaceAll('\\', '\\\\')}\\\\build\\\\docker\\\\deploy\\\\demo.jar"\r
exit /b 0\r
`,
  );

  await runProcess('git', ['init', '-b', 'main'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.email', 'tests@example.com'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.name', 'Tests'], {cwd: repoRoot});
  await runProcess('git', ['config', 'commit.gpgsign', 'false'], {cwd: repoRoot});

  return repoRoot;
}
