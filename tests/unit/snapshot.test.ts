import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {ChildProcess} from 'node:child_process';
import type {spawn as nodeSpawn} from 'node:child_process';

import {describe, expect, test} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import {loadConfig} from '../../src/core/config/load-config.js';
import {resolveEnvContext} from '../../src/features/env/env-files.js';
import {collectSnapshotPaths, resolveSnapshotDir, writePostgresDump} from '../../src/features/snapshot/snapshot.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('snapshot helpers', () => {
  describe('resolveSnapshotDir', () => {
    test('throws SNAPSHOT_REPO_REQUIRED when repoRoot is not available and no explicit output is provided', () => {
      const config = {
        repoRoot: null,
      } as AppConfig;

      expect(() => resolveSnapshotDir(config)).toThrowError(expect.objectContaining({code: 'SNAPSHOT_REPO_REQUIRED'}));
    });

    test('returns path.resolve when explicit output is provided', () => {
      const config = {
        repoRoot: null,
      } as AppConfig;

      const explicit = path.join('tmp', 'snapshot-folder');
      expect(resolveSnapshotDir(config, explicit)).toBe(path.resolve(explicit));
    });

    test('returns path under .ldev/snapshots with sanitized timestamp', () => {
      const repoRoot = createTempDir('snapshot-dir-');
      const config = {
        repoRoot,
      } as AppConfig;

      const resolved = resolveSnapshotDir(config);
      const expectedPrefix = path.join(repoRoot, '.ldev', 'snapshots');

      expect(resolved.startsWith(expectedPrefix)).toBe(true);
      const stamp = path.basename(resolved);
      expect(stamp).not.toContain(':');
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/);
    });
  });

  describe('collectSnapshotPaths', () => {
    test('throws SNAPSHOT_REPO_REQUIRED when liferayDir is missing', async () => {
      const config = {
        liferayDir: null,
      } as AppConfig;

      await expect(collectSnapshotPaths(config)).rejects.toMatchObject({code: 'SNAPSHOT_REPO_REQUIRED'});
    });

    test('returns paths for configs, structures, templates, adts, and fragments', async () => {
      const repoRoot = createSnapshotFixture();
      const config = loadConfig({cwd: repoRoot, env: process.env});

      const paths = await collectSnapshotPaths(config);

      expect(paths).toEqual(
        expect.arrayContaining([
          path.join(repoRoot, 'liferay', 'configs'),
          path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures'),
          path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates'),
          path.join(repoRoot, 'liferay', 'resources', 'templates', 'application_display'),
          path.join(repoRoot, 'liferay', 'fragments'),
        ]),
      );
    });
  });

  describe('writePostgresDump', () => {
    test('resolves on exit code 0 and runs pg_dump with configured user/db', async () => {
      const repoRoot = createSnapshotFixture();
      const envContext = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
      envContext.envValues.POSTGRES_USER = 'custom-user';
      envContext.envValues.POSTGRES_DB = 'custom-db';

      const outputFile = path.join(repoRoot, '.ldev', 'snapshots', 'dump.sql');
      let capturedArgs: string[] = [];

      const spawnMock = ((command: string, args: string[]) => {
        capturedArgs = [command, ...args];
        return createChildProcessMock({exitCode: 0, stdout: 'SELECT 1;\n'});
      }) as unknown as typeof nodeSpawn;

      await expect(writePostgresDump(envContext, outputFile, process.env, spawnMock)).resolves.toBeUndefined();
      expect(capturedArgs).toEqual([
        'docker',
        'compose',
        'exec',
        '-T',
        'postgres',
        'pg_dump',
        '-U',
        'custom-user',
        '-d',
        'custom-db',
      ]);
      expect(fs.existsSync(outputFile)).toBe(true);
    });

    test('falls back to liferay defaults when POSTGRES_USER and POSTGRES_DB are absent', async () => {
      const repoRoot = createSnapshotFixture();
      const envContext = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
      delete envContext.envValues.POSTGRES_USER;
      delete envContext.envValues.POSTGRES_DB;

      const outputFile = path.join(repoRoot, '.ldev', 'snapshots', 'dump-defaults.sql');
      let capturedArgs: string[] = [];

      const spawnMock = ((command: string, args: string[]) => {
        capturedArgs = [command, ...args];
        return createChildProcessMock({exitCode: 0, stdout: 'SELECT 1;\n'});
      }) as unknown as typeof nodeSpawn;

      await writePostgresDump(envContext, outputFile, process.env, spawnMock);

      expect(capturedArgs).toEqual([
        'docker',
        'compose',
        'exec',
        '-T',
        'postgres',
        'pg_dump',
        '-U',
        'liferay',
        '-d',
        'liferay',
      ]);
    });

    test('throws SNAPSHOT_DB_DUMP_FAILED and surfaces stderr when pg_dump exits non-zero', async () => {
      const repoRoot = createSnapshotFixture();
      const envContext = resolveEnvContext(loadConfig({cwd: repoRoot, env: process.env}));
      const outputFile = path.join(repoRoot, '.ldev', 'snapshots', 'dump-failed.sql');

      const spawnMock = (() =>
        createChildProcessMock({exitCode: 2, stderr: 'permission denied'})) as unknown as typeof nodeSpawn;

      await expect(writePostgresDump(envContext, outputFile, process.env, spawnMock)).rejects.toMatchObject({
        code: 'SNAPSHOT_DB_DUMP_FAILED',
        message: 'permission denied',
      });
    });
  });
});

function createSnapshotFixture(): string {
  const repoRoot = createTempDir('snapshot-unit-');

  fs.mkdirSync(path.join(repoRoot, 'docker', 'data', 'default'), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, 'liferay', 'configs', 'dockerenv'), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global'), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'global'), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, 'liferay', 'resources', 'templates', 'application_display'), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, 'liferay', 'fragments'), {recursive: true});

  fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  postgres:\n  liferay:\n');
  fs.writeFileSync(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\nLDEV_STORAGE_PLATFORM=other\nPOSTGRES_USER=liferay\nPOSTGRES_DB=liferay\n',
  );
  fs.writeFileSync(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');

  return repoRoot;
}

function createChildProcessMock(options: {exitCode: number; stdout?: string; stderr?: string}): ChildProcess {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
  };

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();

  if (options.stdout) {
    child.stdout.end(options.stdout);
  } else {
    child.stdout.end();
  }

  if (options.stderr) {
    child.stderr.write(options.stderr);
  }
  child.stderr.end();

  setImmediate(() => {
    child.emit('close', options.exitCode);
  });

  return child as unknown as ChildProcess;
}
