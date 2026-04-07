import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

describe('db integration', () => {
  test('db import autodetects the newest backup and applies post-import sql files by default', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const backupsDir = path.join(repoRoot, 'docker', 'backups');
    const older = path.join(backupsDir, 'older.sql');
    const newer = path.join(backupsDir, 'newer.sql.gz');
    await fs.ensureDir(backupsDir);
    await fs.writeFile(older, 'select 1;\n');
    await fs.writeFile(newer, await gzip('select 2;\n'));
    const oldDate = new Date(Date.now() - 10_000);
    const newDate = new Date(Date.now() - 1_000);
    await fs.utimes(older, oldDate, oldDate);
    await fs.utimes(newer, newDate, newDate);

    const result = await runCli(['db', 'import', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.backupFile).toBe(await fs.realpath(newer));
    expect(parsed.postImportFiles).toHaveLength(2);
    expect(parsed.postImportFiles[0]).toContain('010-first.sql');
    expect(parsed.postImportFiles[1]).toContain('020-second.sql');

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining([
        'compose up -d postgres',
        'compose exec -T postgres psql -U liferay -d liferay -c SELECT 1',
        'compose exec -T postgres psql -U liferay -d liferay',
      ]),
    );
  }, 45000);

  test('db import fails when postgres-data is not empty', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const backupFile = path.join(repoRoot, 'docker', 'backups', 'backup.sql');
    const pgData = path.join(repoRoot, 'docker', 'data', 'default', 'postgres-data');
    await fs.ensureDir(path.dirname(backupFile));
    await fs.writeFile(backupFile, 'select 1;\n');
    await fs.ensureDir(pgData);
    await fs.writeFile(path.join(pgData, 'PG_VERSION'), '15\n');

    const result = await runCli(['db', 'import', '--file', backupFile], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('already contains data');
    expect(result.stderr).toContain('--force');
  }, 45000);

  test('db import --force replaces an existing postgres-data directory before importing', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const backupFile = path.join(repoRoot, 'docker', 'backups', 'backup.sql');
    const pgData = path.join(repoRoot, 'docker', 'data', 'default', 'postgres-data');
    await fs.ensureDir(path.dirname(backupFile));
    await fs.writeFile(backupFile, 'select 1;\n');
    await fs.ensureDir(pgData);
    await fs.writeFile(path.join(pgData, 'PG_VERSION'), '15\n');

    const result = await runCli(['db', 'import', '--file', backupFile, '--force', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.backupFile).toBe(backupFile);
    expect(parsed.forcedReset).toBe(true);
    expect(await fs.pathExists(path.join(pgData, 'PG_VERSION'))).toBe(false);
  }, 45000);

  test('db import tolerates EACCES while checking postgres-data and falls back to docker inspection', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_TARGET_LIST_RESULT: 'empty',
    };

    const backupFile = path.join(repoRoot, 'docker', 'backups', 'backup.sql');
    const pgData = path.join(repoRoot, 'docker', 'data', 'default', 'postgres-data');
    await fs.ensureDir(path.dirname(backupFile));
    await fs.writeFile(backupFile, 'select 1;\n');
    await fs.ensureDir(pgData);
    await fs.chmod(pgData, 0o000);

    try {
      const result = await runCli(['db', 'import', '--file', backupFile, '--format', 'json'], {cwd: repoRoot, env});

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.backupFile).toBe(backupFile);

      const calls = await readFakeDockerCalls(fakeBinDir);
      expect(calls).toEqual(expect.arrayContaining([expect.stringContaining('run --rm -v'), 'compose up -d postgres']));
    } finally {
      await fs.chmod(pgData, 0o755);
    }
  }, 45000);

  test('db download resolves the latest backup id from lcp and downloads the database backup', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}:${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['db', 'download', '--environment', 'uat', '--project', 'demo', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.project).toBe('demo');
    expect(parsed.environment).toBe('uat');
    expect(parsed.backupId).toBe('bkp-123');
    expect(parsed.databaseBackupFile).toContain('bkp-123-database.sql.gz');
    expect(await fs.pathExists(parsed.databaseBackupFile)).toBe(true);
  }, 45000);

  test('db download detects the downloaded backup even when lcp does not include backupId in the filename', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const fakeLcpDir = await createFakeLcpBinWithoutBackupIdInFilename();
    const env = {...process.env, PATH: `${fakeLcpDir}:${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['db', 'download', '--environment', 'uat', '--project', 'demo', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.backupId).toBe('bkp-123');
    expect(parsed.databaseBackupFile).toContain('database.sql.gz');
    expect(await fs.pathExists(parsed.databaseBackupFile)).toBe(true);
  }, 45000);

  test('db files-download stores DOCLIB_PATH in docker/.env', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['db', 'files-download', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.doclibPath).toBeTruthy();
    const envFile = await fs.readFile(path.join(repoRoot, 'docker', '.env'), 'utf8');
    expect(envFile).toContain('DOCLIB_PATH=');
  }, 45000);

  test('db sync downloads and imports the backup in one flow', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}:${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['db', 'sync', '--project', 'demo', '--environment', 'uat', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.download.backupId).toBe('bkp-123');
    expect(parsed.import.backupFile).toContain('bkp-123-database.sql.gz');
  }, 45000);

  test('db files-mount recreates the doclib volume from a local path', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};
    const localDoclib = path.join(repoRoot, 'tmp', 'document_library');
    await fs.ensureDir(localDoclib);

    const result = await runCli(['db', 'files-mount', '--path', localDoclib, '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.mode).toBe('local');
    expect(parsed.path).toBe(localDoclib);
    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining([
        'volume rm demo-doclib',
        `volume create --driver local --opt type=none --opt device=${localDoclib} --opt o=bind demo-doclib`,
      ]),
    );
  }, 45000);

  test('db files-download supports doclib-only downloads', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['db', 'files-download', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.doclibPath).toBeTruthy();
  }, 30000);

  test('db files-download --background ignores unreadable directories under doclib destination', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}:${process.env.PATH ?? ''}`};
    const doclibDest = path.join(repoRoot, 'tmp', 'doclib-dest');
    const blockedDir = path.join(doclibDest, '.blocked');
    await fs.ensureDir(blockedDir);
    await fs.chmod(blockedDir, 0o000);

    try {
      const result = await runCli(
        ['db', 'files-download', '--background', '--doclib-dest', doclibDest, '--format', 'json'],
        {cwd: repoRoot, env},
      );

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.doclibPath).toBeTruthy();
      expect(parsed.background).toBe(true);
    } finally {
      await fs.chmod(blockedDir, 0o755);
    }
  }, 30000);
});

async function createDbRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-db-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.ensureDir(path.join(repoRoot, 'docker', 'sql', 'post-import.d'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nENV_DATA_ROOT=./data/default\nPOSTGRES_USER=liferay\nPOSTGRES_DB=liferay\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.writeFile(path.join(repoRoot, 'docker', 'sql', 'post-import.d', '020-second.sql'), 'update test set x=2;\n');
  await fs.writeFile(path.join(repoRoot, 'docker', 'sql', 'post-import.d', '010-first.sql'), 'update test set x=1;\n');
  return repoRoot;
}

async function createFakeLcpBin(): Promise<string> {
  const binDir = createTempDir('dev-cli-fake-lcp-');
  const lcpPath = path.join(binDir, 'lcp');
  await fs.writeFile(
    lcpPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "version" ]]; then
  printf 'lcp version 1\\n'
  exit 0
fi
if [[ "$1" == "backup" && "$2" == "list" ]]; then
  printf 'ID STATUS\\n'
  printf 'bkp-123 success\\n'
  exit 0
fi
if [[ "$1" == "backup" && "$2" == "download" ]]; then
  dest=""
  backup_id=""
  database=0
  doclib=0
  args=("$@")
  for ((i=0; i<\${#args[@]}; i++)); do
    case "\${args[$i]}" in
      --dest) dest="\${args[$((i+1))]}" ;;
      --backupId) backup_id="\${args[$((i+1))]}" ;;
      --database) database=1 ;;
      --doclib) doclib=1 ;;
    esac
  done
  mkdir -p "$dest"
  if [[ "$database" == "1" ]]; then
    printf 'select 1;\\n' | gzip > "$dest/$backup_id-database.sql.gz"
  fi
  if [[ "$doclib" == "1" ]]; then
    mkdir -p "$dest/dxpcloud-sample/doclib/uuid/20098"
    printf 'doclib\\n' > "$dest/dxpcloud-sample/doclib/uuid/20098/file.txt"
  fi
  exit 0
fi
printf 'unsupported lcp call: %s\\n' "$*" >&2
exit 1
`,
    {mode: 0o755},
  );

  return binDir;
}

async function createFakeLcpBinWithoutBackupIdInFilename(): Promise<string> {
  const binDir = createTempDir('dev-cli-fake-lcp-no-id-');
  const lcpPath = path.join(binDir, 'lcp');
  await fs.writeFile(
    lcpPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "version" ]]; then
  printf 'lcp version 1\\n'
  exit 0
fi
if [[ "$1" == "backup" && "$2" == "list" ]]; then
  printf 'ID STATUS\\n'
  printf 'bkp-123 success\\n'
  exit 0
fi
if [[ "$1" == "backup" && "$2" == "download" ]]; then
  dest=""
  database=0
  args=("$@")
  for ((i=0; i<\${#args[@]}; i++)); do
    case "\${args[$i]}" in
      --dest) dest="\${args[$((i+1))]}" ;;
      --database) database=1 ;;
    esac
  done
  mkdir -p "$dest/dxpcloud-sample"
  if [[ "$database" == "1" ]]; then
    printf 'select 1;\\n' | gzip > "$dest/dxpcloud-sample/database.sql.gz"
  fi
  exit 0
fi
printf 'unsupported lcp call: %s\\n' "$*" >&2
exit 1
`,
    {mode: 0o755},
  );

  return binDir;
}

async function gzip(content: string): Promise<Buffer> {
  const {gzip: gzipCallback} = await import('node:zlib');
  return new Promise((resolve, reject) => {
    gzipCallback(Buffer.from(content, 'utf8'), (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}
