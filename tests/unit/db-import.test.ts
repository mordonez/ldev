import fs from 'node:fs';
import path from 'node:path';
import {PassThrough, Writable} from 'node:stream';
import {EventEmitter} from 'node:events';
import type {SpawnOptions} from 'node:child_process';

import {describe, expect, test} from 'vitest';

import {CliError} from '../../src/core/errors.js';
import type {SpawnProcessFn, SpawnedProcess} from '../../src/core/platform/process.js';
import {findBackupFiles, resolveBackupFile, streamSqlIntoPostgres} from '../../src/features/db/db-import.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('db-import helpers', () => {
  describe('findBackupFiles', () => {
    test('returns empty list when root does not exist', async () => {
      const root = path.join(createTempDir('db-import-missing-root-'), 'missing');

      await expect(findBackupFiles(root)).resolves.toEqual([]);
    });

    test('returns empty list when no backup files match', async () => {
      const root = createTempDir('db-import-no-matches-');
      fs.writeFileSync(path.join(root, 'README.md'), 'not a backup\n');
      fs.mkdirSync(path.join(root, 'nested'), {recursive: true});
      fs.writeFileSync(path.join(root, 'nested', 'image.png'), 'x');

      await expect(findBackupFiles(root)).resolves.toEqual([]);
    });

    test('returns .gz, .sql, and .dump files from nested directories', async () => {
      const root = createTempDir('db-import-backups-');
      const nested = path.join(root, 'nested');
      fs.mkdirSync(nested, {recursive: true});

      const files = [path.join(root, 'a.sql'), path.join(root, 'b.dump'), path.join(nested, 'c.gz')];

      for (const file of files) {
        fs.writeFileSync(file, 'backup\n');
      }

      const result = await findBackupFiles(root);
      const resolved = result.map((entry) => path.normalize(entry.file)).sort();

      expect(resolved).toEqual(files.map((file) => path.normalize(file)).sort());
      for (const entry of result) {
        expect(typeof entry.mtimeMs).toBe('number');
        expect(Number.isFinite(entry.mtimeMs)).toBe(true);
      }
    });

    test('skips doclib directory entirely', async () => {
      const root = createTempDir('db-import-doclib-');
      const doclib = path.join(root, 'doclib');
      const nested = path.join(root, 'nested');
      fs.mkdirSync(doclib, {recursive: true});
      fs.mkdirSync(nested, {recursive: true});

      fs.writeFileSync(path.join(doclib, 'should-not-be-found.sql'), 'backup\n');
      const validFile = path.join(nested, 'should-be-found.sql');
      fs.writeFileSync(validFile, 'backup\n');

      const result = await findBackupFiles(root);
      expect(result.map((entry) => path.normalize(entry.file))).toEqual([path.normalize(validFile)]);
    });
  });

  describe('resolveBackupFile', () => {
    test('throws DB_BACKUP_NOT_FOUND when explicit file does not exist', async () => {
      const dockerDir = createTempDir('db-import-explicit-missing-');
      const missing = path.join(dockerDir, 'backup.sql');

      await expect(resolveBackupFile(dockerDir, missing)).rejects.toMatchObject({
        code: 'DB_BACKUP_NOT_FOUND',
      });
    });

    test('returns explicit file when it exists', async () => {
      const dockerDir = createTempDir('db-import-explicit-ok-');
      const explicit = path.join(dockerDir, 'backup.sql');
      fs.writeFileSync(explicit, 'select 1;\n');

      await expect(resolveBackupFile(dockerDir, explicit)).resolves.toBe(path.resolve(explicit));
    });

    test('throws DB_BACKUP_NOT_FOUND when docker/backups is empty', async () => {
      const dockerDir = createTempDir('db-import-empty-backups-');
      fs.mkdirSync(path.join(dockerDir, 'backups'), {recursive: true});

      await expect(resolveBackupFile(dockerDir)).rejects.toMatchObject({
        code: 'DB_BACKUP_NOT_FOUND',
      });
    });

    test('returns newest backup by mtime when no explicit file is given', async () => {
      const dockerDir = createTempDir('db-import-newest-backup-');
      const backupsDir = path.join(dockerDir, 'backups');
      fs.mkdirSync(backupsDir, {recursive: true});

      const older = path.join(backupsDir, 'older.sql');
      const newer = path.join(backupsDir, 'newer.sql');
      fs.writeFileSync(older, 'old\n');
      fs.writeFileSync(newer, 'new\n');

      const olderTime = new Date('2025-01-01T00:00:00.000Z');
      const newerTime = new Date('2026-01-01T00:00:00.000Z');
      fs.utimesSync(older, olderTime, olderTime);
      fs.utimesSync(newer, newerTime, newerTime);

      await expect(resolveBackupFile(dockerDir)).resolves.toBe(newer);
    });
  });

  describe('streamSqlIntoPostgres', () => {
    test('resolves when child exits with code 0', async () => {
      const sqlFile = writeSqlFile('db-import-stream-ok-');
      const spawnMock = createSpawnMock({exitCode: 0});

      await expect(streamSqlIntoPostgres('C:/tmp', sqlFile, {}, undefined, spawnMock)).resolves.toBeUndefined();
    });

    test('throws DB_IMPORT_ERROR with stderr when child exits non-zero', async () => {
      const sqlFile = writeSqlFile('db-import-stream-stderr-');
      const spawnMock = createSpawnMock({exitCode: 1, stderr: 'psql failed'});

      await expect(streamSqlIntoPostgres('C:/tmp', sqlFile, {}, undefined, spawnMock)).rejects.toMatchObject({
        code: 'DB_IMPORT_ERROR',
        message: 'psql failed',
      });
    });

    test('falls back to stdout when stderr is empty', async () => {
      const sqlFile = writeSqlFile('db-import-stream-stdout-');
      const spawnMock = createSpawnMock({exitCode: 1, stdout: 'stdout only failure'});

      await expect(streamSqlIntoPostgres('C:/tmp', sqlFile, {}, undefined, spawnMock)).rejects.toMatchObject({
        code: 'DB_IMPORT_ERROR',
        message: 'stdout only failure',
      });
    });

    test('uses fallback message when stderr and stdout are empty', async () => {
      const sqlFile = writeSqlFile('db-import-stream-fallback-');
      const spawnMock = createSpawnMock({exitCode: 1});

      await expect(streamSqlIntoPostgres('C:/tmp', sqlFile, {}, undefined, spawnMock)).rejects.toMatchObject({
        code: 'DB_IMPORT_ERROR',
      });

      await streamSqlIntoPostgres('C:/tmp', sqlFile, {}, undefined, createSpawnMock({exitCode: 1})).catch((error) => {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).message).toContain(`Could not import ${sqlFile}`);
      });
    });

    test('ignores expected EPIPE pipeline failure and still resolves on exit code 0', async () => {
      const sqlFile = writeSqlFile('db-import-stream-epipe-');
      const spawnMock = createSpawnMock({exitCode: 0, stdin: createEpipeWritable()});

      await expect(streamSqlIntoPostgres('C:/tmp', sqlFile, {}, undefined, spawnMock)).resolves.toBeUndefined();
    });
  });
});

function writeSqlFile(prefix: string): string {
  const root = createTempDir(prefix);
  const sqlFile = path.join(root, 'input.sql');
  fs.writeFileSync(sqlFile, 'SELECT 1;\n');
  return sqlFile;
}

function createSpawnMock(options: {
  exitCode: number;
  stderr?: string;
  stdout?: string;
  stdin?: NodeJS.WritableStream;
}): SpawnProcessFn {
  return (_command: string, _args: string[], _spawnOptions: SpawnOptions) => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: NodeJS.WritableStream;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: (signal?: NodeJS.Signals | number) => boolean;
    };

    child.stdin = options.stdin ?? new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;

    if (options.stdout) {
      child.stdout.write(options.stdout);
    }
    if (options.stderr) {
      child.stderr.write(options.stderr);
    }

    setImmediate(() => {
      child.emit('close', options.exitCode);
    });

    return child as unknown as SpawnedProcess;
  };
}

function createEpipeWritable(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      const error = new Error('simulated EPIPE') as NodeJS.ErrnoException;
      error.code = 'EPIPE';
      callback(error);
    },
  });
}
