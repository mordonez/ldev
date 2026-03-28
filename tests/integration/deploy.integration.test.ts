import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = path.join(CLI_CWD, 'src', 'index.ts');

describe('deploy integration', () => {
  test('deploy all executes dockerDeploy and writes the prepare marker', async () => {
    const repoRoot = await createDeployRepoFixture({withServiceXml: false});

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'deploy', 'all', '--format', 'json'], {cwd: repoRoot});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.seededDockerenv).toBe(true);
    expect(await fs.pathExists(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy', 'demo.jar'))).toBe(true);
    expect(parsed.artifactsCopiedToCache).toBe(1);
    expect(
      await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache', 'demo.jar')),
    ).toBe(true);
  }, 20000);

  test('deploy prepare writes build marker and seeds dockerenv without buildService when unnecessary', async () => {
    const repoRoot = await createDeployRepoFixture({withServiceXml: false});

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'deploy', 'prepare', '--format', 'json'], {
      cwd: repoRoot,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.buildServiceExecuted).toBe(false);
    expect(parsed.dockerDeployExecuted).toBe(true);
    expect(parsed.artifactsCopiedToCache).toBe(1);
    expect(await fs.pathExists(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy', 'demo.jar'))).toBe(true);
    expect(
      await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache', 'demo.jar')),
    ).toBe(true);
    expect(
      await fs.readFile(
        path.join(repoRoot, 'liferay', 'build', 'docker', 'configs', 'dockerenv', 'portal-ext.properties'),
        'utf8',
      ),
    ).toContain('virtual.hosts.valid.hosts=*');

    const expectedCommit = await resolveHead(repoRoot);
    expect(await fs.readFile(path.join(repoRoot, 'liferay', 'build', 'docker', '.prepare-commit'), 'utf8')).toBe(
      `${expectedCommit}\n`,
    );
    const gradleCalls = await fs.readFile(path.join(repoRoot, 'liferay', '.gradle-calls.log'), 'utf8');
    expect(gradleCalls).toContain('--console=plain dockerDeploy -Pliferay.workspace.environment=dockerenv -q');
    expect(gradleCalls).not.toContain('buildService');
  }, 20000);

  test('deploy prepare runs buildService for fresh service-builder repos and restores tracked service.properties', async () => {
    const repoRoot = await createDeployRepoFixture({withServiceXml: true});

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'deploy', 'prepare', '--format', 'json'], {
      cwd: repoRoot,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.buildServiceExecuted).toBe(true);
    expect(parsed.artifactsCopiedToCache).toBe(1);
    const gradleCalls = await fs.readFile(path.join(repoRoot, 'liferay', '.gradle-calls.log'), 'utf8');
    expect(gradleCalls).toContain('--console=plain buildService -q');
    expect(gradleCalls).toContain('--console=plain dockerDeploy -Pliferay.workspace.environment=dockerenv -q');
    expect(await fs.readFile(path.join(repoRoot, 'liferay', 'modules', 'foo', 'service.properties'), 'utf8')).toBe(
      'release.info.version=1\n',
    );
    expect(
      await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache', 'demo.jar')),
    ).toBe(true);
  }, 20000);

  test('deploy module syncs module artifacts to build/docker/deploy and deploy cache', async () => {
    const repoRoot = await createDeployRepoFixture({withServiceXml: false});

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'deploy', 'module', 'foo', '--format', 'json'], {
      cwd: repoRoot,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.artifactsCopiedToBuild).toBe(1);
    expect(parsed.artifactsCopiedToCache).toBe(1);
    expect(await fs.pathExists(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy', 'foo.jar'))).toBe(true);
    expect(
      await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache', 'foo.jar')),
    ).toBe(true);
  }, 20000);

  test('deploy theme syncs theme artifacts to build/docker/deploy and deploy cache', async () => {
    const repoRoot = await createDeployRepoFixture({withServiceXml: false});

    const result = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'deploy', 'theme', '--theme', 'ub-theme', '--format', 'json'],
      {cwd: repoRoot},
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.theme).toBe('ub-theme');
    expect(await fs.pathExists(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy', 'ub-theme.war'))).toBe(true);
    expect(
      await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache', 'ub-theme.war')),
    ).toBe(true);
  }, 20000);

  test('deploy service runs buildService and restores tracked service.properties', async () => {
    const repoRoot = await createDeployRepoFixture({withServiceXml: true});

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'deploy', 'service', '--format', 'json'], {
      cwd: repoRoot,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.restoredTrackedFiles).toBe(true);
    expect(await fs.readFile(path.join(repoRoot, 'liferay', 'modules', 'foo', 'service.properties'), 'utf8')).toBe(
      'release.info.version=1\n',
    );
  }, 20000);

  test('deploy cache-update refreshes cache artifacts and supports --clean', async () => {
    const repoRoot = await createDeployRepoFixture({withServiceXml: false});
    const buildDeployDir = path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy');
    const cacheDir = path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache');

    await fs.ensureDir(buildDeployDir);
    await fs.ensureDir(cacheDir);
    await fs.writeFile(path.join(buildDeployDir, 'fresh.jar'), 'fresh\n');
    await fs.writeFile(path.join(cacheDir, 'stale.jar'), 'stale\n');
    await fs.writeFile(path.join(repoRoot, 'liferay', 'build', 'docker', '.prepare-commit'), 'abc123\n');

    const result = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'deploy', 'cache-update', '--clean', '--format', 'json'],
      {cwd: repoRoot},
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.clean).toBe(true);
    expect(await fs.pathExists(path.join(cacheDir, 'fresh.jar'))).toBe(true);
    expect(await fs.pathExists(path.join(cacheDir, 'stale.jar'))).toBe(false);
    expect(await fs.readFile(path.join(cacheDir, '.prepare-commit'), 'utf8')).toBe('abc123\n');
  }, 20000);
});

async function createDeployRepoFixture(options: {withServiceXml: boolean}): Promise<string> {
  const repoRoot = createTempDir('dev-cli-deploy-');
  const liferayDir = path.join(repoRoot, 'liferay');

  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'docker', 'data', 'default'));
  await fs.ensureDir(path.join(liferayDir, 'configs', 'dockerenv'));
  await fs.ensureDir(path.join(liferayDir, 'modules', 'foo'));
  await fs.ensureDir(path.join(liferayDir, 'themes', 'ub-theme'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\n',
  );
  await fs.writeFile(path.join(liferayDir, 'build.gradle'), 'plugins {}\n');
  await fs.writeFile(
    path.join(liferayDir, 'configs', 'dockerenv', 'portal-ext.properties'),
    'virtual.hosts.valid.hosts=*\n',
  );
  await fs.writeFile(path.join(liferayDir, 'modules', 'foo', 'service.properties'), 'release.info.version=1\n');
  if (options.withServiceXml) {
    await fs.writeFile(path.join(liferayDir, 'modules', 'foo', 'service.xml'), '<service-builder />\n');
  }
  await fs.writeFile(
    path.join(liferayDir, 'gradlew'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${liferayDir}/.gradle-calls.log"
if [[ "$*" == *"buildService"* ]]; then
  printf 'release.info.version=generated\\n' > "${liferayDir}/modules/foo/service.properties"
  exit 0
fi
if [[ "$*" == *":modules:foo:dockerDeploy"* ]]; then
  mkdir -p "${liferayDir}/modules/foo/build/libs"
  printf 'foo\\n' > "${liferayDir}/modules/foo/build/libs/foo.jar"
  exit 0
fi
if [[ "$*" == *":themes:ub-theme:dockerDeploy"* ]]; then
  mkdir -p "${liferayDir}/themes/ub-theme/dist"
  printf 'theme\\n' > "${liferayDir}/themes/ub-theme/dist/ub-theme.war"
  exit 0
fi
if [[ "$*" == *"dockerDeploy"* ]]; then
  mkdir -p "${liferayDir}/build/docker/deploy"
  printf 'jar\\n' > "${liferayDir}/build/docker/deploy/demo.jar"
  exit 0
fi
exit 0
`,
    {mode: 0o755},
  );

  await runProcess('git', ['init', '-b', 'main'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.email', 'tests@example.com'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.name', 'Tests'], {cwd: repoRoot});
  await runProcess('git', ['config', 'commit.gpgsign', 'false'], {cwd: repoRoot});
  await runProcess('git', ['add', '-A'], {cwd: repoRoot});
  await runProcess('git', ['commit', '-m', 'chore: init'], {cwd: repoRoot});

  return repoRoot;
}

async function resolveHead(repoRoot: string): Promise<string> {
  const result = await runProcess('git', ['rev-parse', 'HEAD'], {cwd: repoRoot});
  return result.stdout.trim();
}
