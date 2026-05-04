import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';
import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

type DbImportPayload = {
  backupFile: string;
  forcedReset?: boolean;
  postImportFiles: string[];
};

type DbDownloadPayload = {
  project: string;
  environment: string;
  backupId: string;
  databaseBackupFile: string;
};

type DbFilesDownloadPayload = {
  doclibPath: string;
  background?: boolean;
};

type DbSyncPayload = {
  download: DbDownloadPayload;
  import: DbImportPayload;
};

type DbFilesMountPayload = {
  mode: string;
  path: string;
};

describe('db integration', () => {
  test('db import autodetects the newest backup and applies post-import sql files by default', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`};

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
    const parsed = parseTestJson<DbImportPayload>(result.stdout);
    expect(parsed.backupFile).toBe(await fs.realpath(newer));
    expect(parsed.postImportFiles).toHaveLength(2);
    expect(parsed.postImportFiles[0]).toContain('010-first.sql');
    expect(parsed.postImportFiles[1]).toContain('020-second.sql');
    expect(await fs.pathExists(path.join(repoRoot, 'docker', 'data', 'default', 'liferay-deploy-cache'))).toBe(true);

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
    const env = {...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`};

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
    const env = {...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`};

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
    const parsed = parseTestJson<DbImportPayload>(result.stdout);
    expect(parsed.backupFile).toBe(backupFile);
    expect(parsed.forcedReset).toBe(true);
    expect(await fs.pathExists(path.join(pgData, 'PG_VERSION'))).toBe(false);
  }, 45000);

  test('db import --force removes an existing postgres volume after removing the postgres container', async () => {
    const repoRoot = await createDbRepoFixture({postgresDataMode: 'volume'});
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_DOCKER_VOLUME_RM_REQUIRES_COMPOSE_RM: '1',
    };

    const backupFile = path.join(repoRoot, 'docker', 'backups', 'backup.sql');
    await fs.ensureDir(path.dirname(backupFile));
    await fs.writeFile(backupFile, 'select 1;\n');

    const volumeName = 'demo-postgres';
    const createVolume = await runProcess('docker', ['volume', 'create', volumeName], {cwd: repoRoot, env});
    expect(createVolume.exitCode).toBe(0);

    const result = await runCli(['db', 'import', '--file', backupFile, '--force', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<DbImportPayload>(result.stdout);
    expect(parsed.backupFile).toBe(backupFile);
    expect(parsed.forcedReset).toBe(true);

    const inspectVolume = await runProcess('docker', ['volume', 'inspect', volumeName], {cwd: repoRoot, env});
    expect(inspectVolume.exitCode).toBe(1);

    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(
      expect.arrayContaining(['compose stop postgres', 'compose rm -f -s postgres', `volume rm ${volumeName}`]),
    );
  }, 45000);

  test('db import tolerates EACCES while checking postgres-data and falls back to docker inspection', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {
      ...process.env,
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
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
      const parsed = parseTestJson<DbImportPayload>(result.stdout);
      expect(parsed.backupFile).toBe(backupFile);

      const calls = await readFakeDockerCalls(fakeBinDir);
      expect(calls).toEqual(expect.arrayContaining(['compose up -d postgres']));
      if (process.platform !== 'win32') {
        expect(calls).toEqual(expect.arrayContaining([expect.stringContaining('run --rm -v')]));
      }
    } finally {
      await fs.chmod(pgData, 0o755);
    }
  }, 45000);

  test('db download resolves the latest backup id from lcp and downloads the database backup', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {
      ...process.env,
      PATH: `${fakeLcpDir}${path.delimiter}${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };

    const result = await runCli(['db', 'download', '--environment', 'uat', '--project', 'demo', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<DbDownloadPayload>(result.stdout);
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
    const env = {
      ...process.env,
      PATH: `${fakeLcpDir}${path.delimiter}${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };

    const result = await runCli(['db', 'download', '--environment', 'uat', '--project', 'demo', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<DbDownloadPayload>(result.stdout);
    expect(parsed.backupId).toBe('bkp-123');
    expect(parsed.databaseBackupFile).toContain('database.sql.gz');
    expect(await fs.pathExists(parsed.databaseBackupFile)).toBe(true);
  }, 45000);

  test('db files-download stores DOCLIB_PATH in docker/.env', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}${path.delimiter}${process.env.PATH ?? ''}`};

    const result = await runCli(['db', 'files-download', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<DbFilesDownloadPayload>(result.stdout);
    expect(parsed.doclibPath).toBeTruthy();
    const envFile = await fs.readFile(path.join(repoRoot, 'docker', '.env'), 'utf8');
    expect(envFile).toContain('DOCLIB_PATH=');
  }, 45000);

  test('db sync downloads and imports the backup in one flow', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {
      ...process.env,
      PATH: `${fakeLcpDir}${path.delimiter}${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };

    const result = await runCli(['db', 'sync', '--project', 'demo', '--environment', 'uat', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<DbSyncPayload>(result.stdout);
    expect(parsed.download.backupId).toBe('bkp-123');
    expect(parsed.import.backupFile).toContain('bkp-123-database.sql.gz');
  }, 45000);

  test('db files-mount recreates the doclib volume from a local path', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`};
    const localDoclib = path.join(repoRoot, 'tmp', 'document_library');
    const oldDoclib = path.join(repoRoot, 'tmp', 'document_library_old');
    await fs.ensureDir(localDoclib);
    await fs.ensureDir(oldDoclib);

    const createVolume = await runProcess(
      'docker',
      [
        'volume',
        'create',
        '--driver',
        'local',
        '--opt',
        'type=none',
        '--opt',
        `device=${oldDoclib}`,
        '--opt',
        'o=bind',
        'demo-doclib',
      ],
      {cwd: repoRoot, env},
    );
    expect(createVolume.exitCode).toBe(0);

    const result = await runCli(['db', 'files-mount', '--path', localDoclib, '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<DbFilesMountPayload>(result.stdout);
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

  test('db files-mount fails when the existing doclib volume cannot be removed', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const oldDoclib = path.join(repoRoot, 'tmp', 'document_library_old');
    const newDoclib = path.join(repoRoot, 'tmp', 'document_library_new');
    await fs.ensureDir(oldDoclib);
    await fs.ensureDir(newDoclib);

    const env = {
      ...process.env,
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_DOCKER_VOLUME_RM_REQUIRES_COMPOSE_RM: '1',
    };

    const createVolume = await runProcess(
      'docker',
      [
        'volume',
        'create',
        '--driver',
        'local',
        '--opt',
        'type=none',
        '--opt',
        `device=${oldDoclib}`,
        '--opt',
        'o=bind',
        'demo-doclib',
      ],
      {cwd: repoRoot, env},
    );
    expect(createVolume.exitCode).toBe(0);

    const result = await runCli(['db', 'files-mount', '--path', newDoclib, '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('volume is in use');

    const inspectVolume = await runProcess(
      'docker',
      ['volume', 'inspect', 'demo-doclib', '--format', '{{index .Options "device"}}'],
      {cwd: repoRoot, env},
    );
    expect(inspectVolume.exitCode).toBe(0);
    expect(inspectVolume.stdout.trim()).toBe(oldDoclib);
  }, 45000);

  test('db files-download supports doclib-only downloads', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}${path.delimiter}${process.env.PATH ?? ''}`};

    const result = await runCli(['db', 'files-download', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<DbFilesDownloadPayload>(result.stdout);
    expect(parsed.doclibPath).toBeTruthy();
  }, 30000);

  test('db files-download --background ignores unreadable directories under doclib destination', async () => {
    const repoRoot = await createDbRepoFixture();
    const fakeLcpDir = await createFakeLcpBin();
    const env = {...process.env, PATH: `${fakeLcpDir}${path.delimiter}${process.env.PATH ?? ''}`};
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
      const parsed = parseTestJson<DbFilesDownloadPayload>(result.stdout);
      expect(parsed.doclibPath).toBeTruthy();
      expect(parsed.background).toBe(true);
    } finally {
      await fs.chmod(blockedDir, 0o755);
    }
  }, 30000);
});

async function createDbRepoFixture(options?: {postgresDataMode?: 'bind' | 'volume'}): Promise<string> {
  const repoRoot = createTempDir('dev-cli-db-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.ensureDir(path.join(repoRoot, 'docker', 'sql', 'post-import.d'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  postgres:\n');
  const envLines = [
    'COMPOSE_PROJECT_NAME=demo',
    'ENV_DATA_ROOT=./data/default',
    'LDEV_STORAGE_PLATFORM=other',
    'POSTGRES_USER=liferay',
    'POSTGRES_DB=liferay',
  ];
  if (options?.postgresDataMode === 'volume') {
    envLines.push('POSTGRES_DATA_MODE=volume', 'POSTGRES_DATA_VOLUME_NAME=demo-postgres');
  }
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), `${envLines.join('\n')}\n`);
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.writeFile(path.join(repoRoot, 'docker', 'sql', 'post-import.d', '020-second.sql'), 'update test set x=2;\n');
  await fs.writeFile(path.join(repoRoot, 'docker', 'sql', 'post-import.d', '010-first.sql'), 'update test set x=1;\n');
  return repoRoot;
}

async function createFakeLcpBin(): Promise<string> {
  const binDir = createTempDir('dev-cli-fake-lcp-');
  const lcpPath = path.join(binDir, 'lcp');
  const lcpCmdPath = path.join(binDir, 'lcp.cmd');
  const lcpScriptPath = path.join(binDir, 'lcp.mjs');
  await fs.writeFile(
    lcpScriptPath,
    `import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const args = process.argv.slice(2);
if (args[0] === 'version') {
  process.stdout.write('lcp version 1\\n');
  process.exit(0);
}
if (args[0] === 'backup' && args[1] === 'list') {
  process.stdout.write('ID STATUS\\n');
  process.stdout.write('bkp-123 success\\n');
  process.exit(0);
}
if (args[0] === 'backup' && args[1] === 'download') {
  let dest = '';
  let backupId = '';
  let database = false;
  let doclib = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dest') dest = args[i + 1] ?? '';
    if (args[i] === '--backupId') backupId = args[i + 1] ?? '';
    if (args[i] === '--database') database = true;
    if (args[i] === '--doclib') doclib = true;
  }
  fs.mkdirSync(dest, {recursive: true});
  if (database) {
    fs.writeFileSync(path.join(dest, \`\${backupId}-database.sql.gz\`), gzipSync(Buffer.from('select 1;\\n')));
  }
  if (doclib) {
    const doclibDir = path.join(dest, 'dxpcloud-sample', 'doclib', 'uuid', '20098');
    fs.mkdirSync(doclibDir, {recursive: true});
    fs.writeFileSync(path.join(doclibDir, 'file.txt'), 'doclib\\n');
  }
  process.exit(0);
}
process.stderr.write(\`unsupported lcp call: \${args.join(' ')}\\n\`);
process.exit(1);
`,
    {mode: 0o755},
  );
  await fs.writeFile(
    lcpPath,
    `#!/usr/bin/env bash
exec node "$(dirname "$0")/lcp.mjs" "$@"
`,
    {mode: 0o755},
  );
  await fs.writeFile(
    lcpCmdPath,
    `@echo off
node "%~dp0lcp.mjs" %*
`,
  );

  return binDir;
}

async function createFakeLcpBinWithoutBackupIdInFilename(): Promise<string> {
  const binDir = createTempDir('dev-cli-fake-lcp-no-id-');
  const lcpPath = path.join(binDir, 'lcp');
  const lcpCmdPath = path.join(binDir, 'lcp.cmd');
  const lcpScriptPath = path.join(binDir, 'lcp.mjs');
  await fs.writeFile(
    lcpScriptPath,
    `import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const args = process.argv.slice(2);
if (args[0] === 'version') {
  process.stdout.write('lcp version 1\\n');
  process.exit(0);
}
if (args[0] === 'backup' && args[1] === 'list') {
  process.stdout.write('ID STATUS\\n');
  process.stdout.write('bkp-123 success\\n');
  process.exit(0);
}
if (args[0] === 'backup' && args[1] === 'download') {
  let dest = '';
  let database = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dest') dest = args[i + 1] ?? '';
    if (args[i] === '--database') database = true;
  }
  const sampleDir = path.join(dest, 'dxpcloud-sample');
  fs.mkdirSync(sampleDir, {recursive: true});
  if (database) {
    fs.writeFileSync(path.join(sampleDir, 'database.sql.gz'), gzipSync(Buffer.from('select 1;\\n')));
  }
  process.exit(0);
}
process.stderr.write(\`unsupported lcp call: \${args.join(' ')}\\n\`);
process.exit(1);
`,
    {mode: 0o755},
  );
  await fs.writeFile(
    lcpPath,
    `#!/usr/bin/env bash
exec node "$(dirname "$0")/lcp.mjs" "$@"
`,
    {mode: 0o755},
  );
  await fs.writeFile(
    lcpCmdPath,
    `@echo off
node "%~dp0lcp.mjs" %*
`,
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
