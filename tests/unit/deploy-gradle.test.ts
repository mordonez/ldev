import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {createTempDir} from '../../src/testing/temp-repo.js';
import {
  readPrepareCommit,
  writePrepareCommit,
  seedBuildDockerConfigs,
  shouldRunBuildService,
} from '../../src/features/deploy/deploy-gradle.js';

// ---------------------------------------------------------------------------
// writePrepareCommit / readPrepareCommit — round-trip
// ---------------------------------------------------------------------------

describe('writePrepareCommit / readPrepareCommit', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-deploy-gradle-');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeContext(buildDir: string) {
    const liferayDir = path.dirname(buildDir);
    return {
      repoRoot: path.dirname(liferayDir),
      liferayDir,
      dockerDir: path.join(path.dirname(liferayDir), 'docker'),
      gradlewPath: path.join(liferayDir, 'gradlew'),
      buildDir,
      buildDeployDir: path.join(buildDir, 'deploy'),
    };
  }

  test('readPrepareCommit returns null when file does not exist', async () => {
    const buildDir = path.join(tmpDir, 'build');
    expect(await readPrepareCommit(buildDir)).toBeNull();
  });

  test('writePrepareCommit creates the marker file', async () => {
    const buildDir = path.join(tmpDir, 'build');
    const ctx = makeContext(buildDir);
    await writePrepareCommit(ctx, 'abc1234');
    const markerPath = path.join(buildDir, '.prepare-commit');
    expect(await fs.pathExists(markerPath)).toBe(true);
  });

  test('readPrepareCommit returns the written commit hash', async () => {
    const buildDir = path.join(tmpDir, 'build');
    const ctx = makeContext(buildDir);
    await writePrepareCommit(ctx, 'deadbeef');
    expect(await readPrepareCommit(buildDir)).toBe('deadbeef');
  });

  test('readPrepareCommit returns null for empty file', async () => {
    const buildDir = path.join(tmpDir, 'build');
    await fs.ensureDir(buildDir);
    await fs.writeFile(path.join(buildDir, '.prepare-commit'), '');
    expect(await readPrepareCommit(buildDir)).toBeNull();
  });

  test('readPrepareCommit trims trailing newlines', async () => {
    const buildDir = path.join(tmpDir, 'build');
    await fs.ensureDir(buildDir);
    await fs.writeFile(path.join(buildDir, '.prepare-commit'), 'abc1234\n');
    expect(await readPrepareCommit(buildDir)).toBe('abc1234');
  });
});

// ---------------------------------------------------------------------------
// seedBuildDockerConfigs — copies dockerenv configs
// ---------------------------------------------------------------------------

describe('seedBuildDockerConfigs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-deploy-seed-');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeContext(liferayDir: string) {
    return {
      repoRoot: path.dirname(liferayDir),
      liferayDir,
      dockerDir: path.join(path.dirname(liferayDir), 'docker'),
      gradlewPath: path.join(liferayDir, 'gradlew'),
      buildDir: path.join(liferayDir, 'build', 'docker'),
      buildDeployDir: path.join(liferayDir, 'build', 'docker', 'deploy'),
    };
  }

  test('returns false when dockerenv source does not exist', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    await fs.ensureDir(liferayDir);
    const ctx = makeContext(liferayDir);
    expect(await seedBuildDockerConfigs(ctx)).toBe(false);
  });

  test('returns true and copies files when dockerenv source exists', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const sourceDir = path.join(liferayDir, 'configs', 'dockerenv');
    await fs.ensureDir(sourceDir);
    await fs.writeFile(path.join(sourceDir, 'portal-ext.properties'), 'web.server.http.port=8080\n');

    const ctx = makeContext(liferayDir);
    expect(await seedBuildDockerConfigs(ctx)).toBe(true);

    const targetFile = path.join(ctx.buildDir, 'configs', 'dockerenv', 'portal-ext.properties');
    expect(await fs.pathExists(targetFile)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldRunBuildService — detects service.xml recursively
// ---------------------------------------------------------------------------

describe('shouldRunBuildService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-deploy-service-');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('returns false when directory does not exist', async () => {
    const absent = path.join(tmpDir, 'absent');
    expect(await shouldRunBuildService(absent)).toBe(false);
  });

  test('returns false when no service.xml is present', async () => {
    const modulesDir = path.join(tmpDir, 'modules');
    await fs.ensureDir(path.join(modulesDir, 'my-module', 'src', 'main'));
    await fs.writeFile(path.join(modulesDir, 'my-module', 'build.gradle'), '');
    expect(await shouldRunBuildService(modulesDir)).toBe(false);
  });

  test('returns true when service.xml exists in a nested module', async () => {
    const modulesDir = path.join(tmpDir, 'modules');
    const serviceDir = path.join(modulesDir, 'my-module', 'my-module-service');
    await fs.ensureDir(serviceDir);
    await fs.writeFile(path.join(serviceDir, 'service.xml'), '<service-builder />');
    expect(await shouldRunBuildService(modulesDir)).toBe(true);
  });
});
