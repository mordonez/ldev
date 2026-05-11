import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {
  findDatabaseBackupForId,
  listDatabaseBackups,
  pickNewestAddedBackup,
} from '../../src/features/db/db-backup-intake.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('db backup intake', () => {
  test('finds LCP downloads when the backup id is in the directory name', async () => {
    const root = createTempDir('db-backup-intake-lcp-');
    const backupId = 'dxpcloud-xvwjjjeiixwijchefk-202605052200';
    const downloadDir = path.join(root, `${backupId}-1778060500090`);
    fs.mkdirSync(downloadDir, {recursive: true});
    const databaseFile = path.join(downloadDir, '44252062-75e1-4353-9597-b0360b159668.gz');
    fs.writeFileSync(databaseFile, 'database backup');

    await expect(findDatabaseBackupForId(root, backupId)).resolves.toBe(databaseFile);
  });

  test('returns the newest matching backup when the same backup id exists more than once', async () => {
    const root = createTempDir('db-backup-intake-newest-');
    const backupId = 'dxpcloud-sample-project-202605052200';
    const olderDir = path.join(root, `${backupId}-older`);
    const newerDir = path.join(root, `${backupId}-newer`);
    fs.mkdirSync(olderDir, {recursive: true});
    fs.mkdirSync(newerDir, {recursive: true});
    const older = path.join(olderDir, 'database.gz');
    const newer = path.join(newerDir, 'database.gz');
    fs.writeFileSync(older, 'old');
    fs.writeFileSync(newer, 'new');

    fs.utimesSync(older, new Date('2026-05-05T00:00:00.000Z'), new Date('2026-05-05T00:00:00.000Z'));
    fs.utimesSync(newer, new Date('2026-05-06T00:00:00.000Z'), new Date('2026-05-06T00:00:00.000Z'));

    await expect(findDatabaseBackupForId(root, backupId)).resolves.toBe(newer);
  });

  test('lists database backup artifacts recursively', async () => {
    const root = createTempDir('db-backup-intake-list-');
    const nested = path.join(root, 'nested');
    fs.mkdirSync(nested, {recursive: true});
    fs.writeFileSync(path.join(root, 'README.md'), 'ignore');
    const sql = path.join(root, 'database.sql');
    const dump = path.join(nested, 'database.dump');
    fs.writeFileSync(sql, 'select 1;');
    fs.writeFileSync(dump, 'dump');

    const files = (await listDatabaseBackups(root)).map((artifact) => path.normalize(artifact.file)).sort();

    expect(files).toEqual([dump, sql].map((file) => path.normalize(file)).sort());
  });

  test('picks the newest file added after a download', () => {
    const before = [{file: 'C:/backups/old.sql', mtimeMs: 1}];
    const after = [
      {file: 'C:/backups/old.sql', mtimeMs: 1},
      {file: 'C:/backups/newer.sql', mtimeMs: 3},
      {file: 'C:/backups/new.sql', mtimeMs: 2},
    ];

    expect(pickNewestAddedBackup(before, after)).toBe('C:/backups/newer.sql');
  });
});
