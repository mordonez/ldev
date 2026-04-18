import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {createTempDir} from '../../src/testing/temp-repo.js';
import {
  WORKTREE_DEPLOY_CACHE_SUBDIR,
  WORKTREE_STATE_SUBDIRS,
  resolveBtrfsConfig,
  worktreeEnvHasState,
} from '../../src/features/worktree/worktree-state.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

describe('WORKTREE_STATE_SUBDIRS', () => {
  test('includes the four expected subdirectories', () => {
    expect(WORKTREE_STATE_SUBDIRS).toContain('postgres-data');
    expect(WORKTREE_STATE_SUBDIRS).toContain('liferay-data');
    expect(WORKTREE_STATE_SUBDIRS).toContain('liferay-osgi-state');
    expect(WORKTREE_STATE_SUBDIRS).toContain('elasticsearch-data');
  });
});

describe('WORKTREE_DEPLOY_CACHE_SUBDIR', () => {
  test('is the expected constant value', () => {
    expect(WORKTREE_DEPLOY_CACHE_SUBDIR).toBe('liferay-deploy-cache');
  });
});

// ---------------------------------------------------------------------------
// resolveBtrfsConfig — non-Linux always returns disabled
// ---------------------------------------------------------------------------

describe('resolveBtrfsConfig — non-Linux platform', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {value: 'win32', configurable: true});
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  test('returns disabled config when platform is not linux', async () => {
    const context = {
      repoRoot: '/repo',
      liferayDir: '/repo/liferay',
      dockerDir: '/repo/docker',
      dockerComposeFile: '/repo/docker/docker-compose.yml',
      dockerEnvFile: '/repo/docker/.env',
      dockerEnvExampleFile: null,
      envValues: {BTRFS_ROOT: '/btrfs', USE_BTRFS_SNAPSHOTS: 'true'},
      bindIp: '127.0.0.1',
      httpPort: '8080',
      portalUrl: 'http://127.0.0.1:8080',
      composeProjectName: 'liferay',
      dataRoot: '/repo/docker/data/default',
    };

    const result = await resolveBtrfsConfig(context, context.envValues);
    expect(result.enabled).toBe(false);
    expect(result.rootDir).toBeNull();
    expect(result.baseDir).toBeNull();
    expect(result.envsDir).toBeNull();
    expect(result.useSnapshots).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveBtrfsConfig — Linux platform with missing/absent dirs
// ---------------------------------------------------------------------------

describe('resolveBtrfsConfig — Linux platform', () => {
  let tmpDir: string;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-btrfs-');
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {value: 'linux', configurable: true});
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  function makeContext(dockerDir: string, envValues: Record<string, string>) {
    return {
      repoRoot: path.dirname(dockerDir),
      liferayDir: path.join(path.dirname(dockerDir), 'liferay'),
      dockerDir,
      dockerComposeFile: path.join(dockerDir, 'docker-compose.yml'),
      dockerEnvFile: path.join(dockerDir, '.env'),
      dockerEnvExampleFile: null,
      envValues,
      bindIp: '127.0.0.1',
      httpPort: '8080',
      portalUrl: 'http://127.0.0.1:8080',
      composeProjectName: 'liferay',
      dataRoot: path.join(dockerDir, 'data', 'default'),
    };
  }

  test('returns disabled when BTRFS_ROOT is missing', async () => {
    const ctx = makeContext(tmpDir, {});
    const result = await resolveBtrfsConfig(ctx, {});
    expect(result.enabled).toBe(false);
  });

  test('returns disabled when USE_BTRFS_SNAPSHOTS is false', async () => {
    const ctx = makeContext(tmpDir, {BTRFS_ROOT: tmpDir, USE_BTRFS_SNAPSHOTS: 'false'});
    const result = await resolveBtrfsConfig(ctx, {BTRFS_ROOT: tmpDir, USE_BTRFS_SNAPSHOTS: 'false'});
    expect(result.enabled).toBe(false);
  });

  test('returns disabled when USE_BTRFS_SNAPSHOTS is empty', async () => {
    const ctx = makeContext(tmpDir, {BTRFS_ROOT: tmpDir});
    const result = await resolveBtrfsConfig(ctx, {BTRFS_ROOT: tmpDir});
    expect(result.enabled).toBe(false);
  });

  test('returns disabled when btrfs dirs do not exist on disk', async () => {
    const btrfsRoot = path.join(tmpDir, 'btrfs');
    const ctx = makeContext(tmpDir, {BTRFS_ROOT: btrfsRoot, USE_BTRFS_SNAPSHOTS: 'true'});
    const result = await resolveBtrfsConfig(ctx, {BTRFS_ROOT: btrfsRoot, USE_BTRFS_SNAPSHOTS: 'true'});
    expect(result.enabled).toBe(false);
  });

  test('returns enabled when btrfs dirs exist and config is valid', async () => {
    const btrfsRoot = path.join(tmpDir, 'btrfs');
    const baseDir = path.join(btrfsRoot, 'base');
    const envsDir = path.join(btrfsRoot, 'envs');
    await fs.ensureDir(btrfsRoot);
    await fs.ensureDir(baseDir);
    await fs.ensureDir(envsDir);

    const ctx = makeContext(tmpDir, {
      BTRFS_ROOT: btrfsRoot,
      BTRFS_BASE: baseDir,
      BTRFS_ENVS: envsDir,
      USE_BTRFS_SNAPSHOTS: 'true',
    });
    const result = await resolveBtrfsConfig(ctx, ctx.envValues);

    expect(result.enabled).toBe(true);
    expect(result.rootDir).toBe(btrfsRoot);
    expect(result.baseDir).toBe(baseDir);
    expect(result.envsDir).toBe(envsDir);
    expect(result.useSnapshots).toBe('true');
  });

  test('resolves relative BTRFS_ROOT relative to dockerDir', async () => {
    const btrfsSubDir = path.join(tmpDir, 'btrfs');
    const baseDir = path.join(btrfsSubDir, 'base');
    const envsDir = path.join(btrfsSubDir, 'envs');
    await fs.ensureDir(btrfsSubDir);
    await fs.ensureDir(baseDir);
    await fs.ensureDir(envsDir);

    // Use relative path in the env value
    const ctx = makeContext(tmpDir, {
      BTRFS_ROOT: 'btrfs',
      USE_BTRFS_SNAPSHOTS: 'true',
    });
    const result = await resolveBtrfsConfig(ctx, ctx.envValues);

    expect(result.enabled).toBe(true);
    expect(result.rootDir).toBe(btrfsSubDir);
  });
});

// ---------------------------------------------------------------------------
// worktreeEnvHasState — file-system paths (no docker volumes)
// ---------------------------------------------------------------------------

describe('worktreeEnvHasState', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-wt-state-');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('returns false when dataRoot does not exist', async () => {
    const absent = path.join(tmpDir, 'absent-data-root');
    expect(await worktreeEnvHasState(absent)).toBe(false);
  });

  test('returns false when dataRoot exists but is empty', async () => {
    const dataRoot = path.join(tmpDir, 'empty-root');
    await fs.ensureDir(dataRoot);
    expect(await worktreeEnvHasState(dataRoot)).toBe(false);
  });

  test('returns true when a state subdir exists', async () => {
    const dataRoot = path.join(tmpDir, 'data-root');
    await fs.ensureDir(path.join(dataRoot, 'postgres-data'));
    expect(await worktreeEnvHasState(dataRoot)).toBe(true);
  });

  test('returns true when liferay-data exists', async () => {
    const dataRoot = path.join(tmpDir, 'data-root-ld');
    await fs.ensureDir(path.join(dataRoot, 'liferay-data'));
    expect(await worktreeEnvHasState(dataRoot)).toBe(true);
  });

  test('returns true when liferay-osgi-state exists', async () => {
    const dataRoot = path.join(tmpDir, 'data-root-osgi');
    await fs.ensureDir(path.join(dataRoot, 'liferay-osgi-state'));
    expect(await worktreeEnvHasState(dataRoot)).toBe(true);
  });

  test('returns true when elasticsearch-data exists', async () => {
    const dataRoot = path.join(tmpDir, 'data-root-es');
    await fs.ensureDir(path.join(dataRoot, 'elasticsearch-data'));
    expect(await worktreeEnvHasState(dataRoot)).toBe(true);
  });

  test('returns true when liferay-deploy-cache exists', async () => {
    const dataRoot = path.join(tmpDir, 'data-root-dc');
    await fs.ensureDir(path.join(dataRoot, 'liferay-deploy-cache'));
    expect(await worktreeEnvHasState(dataRoot)).toBe(true);
  });
});
