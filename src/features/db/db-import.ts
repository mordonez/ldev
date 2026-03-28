import fs from 'fs-extra';
import path from 'node:path';
import {createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDocker, runDockerCompose, runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {resolveEnvContext} from '../env/env-files.js';

export type DbImportResult = {
  ok: true;
  backupFile: string;
  postgresDataDir: string;
  postImportFiles: string[];
  forcedReset: boolean;
};

export async function runDbImport(
  config: AppConfig,
  options?: {
    file?: string;
    skipPostImport?: boolean;
    force?: boolean;
    processEnv?: NodeJS.ProcessEnv;
    printer?: Printer;
  },
): Promise<DbImportResult> {
  const capabilities = await detectCapabilities(config.cwd);
  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker y docker compose son obligatorios para db import.', {code: 'DB_CAPABILITY_MISSING'});
  }

  const context = resolveEnvContext(config);
  const backupFile = await resolveBackupFile(context.dockerDir, options?.file);
  const postgresDataDir = path.join(context.dataRoot, 'postgres-data');

  const postgresDataHasContents = await hasDirectoryContents(postgresDataDir, options?.processEnv);
  let forcedReset = false;
  if (postgresDataHasContents) {
    if (!(options?.force ?? false)) {
      throw new CliError(
        `El directorio de datos de PostgreSQL ya tiene datos: ${postgresDataDir}\nVuelve a ejecutar con 'ldev db import --force' para reemplazar la BD local.`,
        {code: 'DB_IMPORT_POSTGRES_NOT_EMPTY'},
      );
    }

    await runStep(options?.printer, 'Limpiando postgres-data existente', async () => {
      await removePathRobust(postgresDataDir, {processEnv: options?.processEnv});
      await fs.ensureDir(postgresDataDir);
    });
    forcedReset = true;
  }

  await runStep(options?.printer, 'Arrancando postgres', async () => {
    await runDockerComposeOrThrow(context.dockerDir, ['up', '-d', 'postgres'], {env: options?.processEnv});
  });

  await runStep(options?.printer, 'Esperando a que PostgreSQL esté listo', async () => {
    await waitForPostgresReady(context.dockerDir, context.envValues, options?.processEnv);
  });

  await runStep(options?.printer, 'Importando backup en PostgreSQL', async () => {
    await streamSqlIntoPostgres(context.dockerDir, backupFile, context.envValues, options?.processEnv);
  });

  const postImportFiles = !(options?.skipPostImport ?? false) ? await resolvePostImportFiles(context.dockerDir) : [];

  for (const sqlFile of postImportFiles) {
    await runStep(options?.printer, `Aplicando post-import ${path.basename(sqlFile)}`, async () => {
      await streamSqlIntoPostgres(context.dockerDir, sqlFile, context.envValues, options?.processEnv);
    });
  }

  return {
    ok: true,
    backupFile,
    postgresDataDir,
    postImportFiles,
    forcedReset,
  };
}

export function formatDbImport(result: DbImportResult): string {
  return [
    `DB import OK: ${result.backupFile}`,
    `postgres-data: ${result.postgresDataDir}`,
    `reset previo: ${result.forcedReset ? 'sí' : 'no'}`,
    `post-import: ${result.postImportFiles.length > 0 ? result.postImportFiles.map((file) => path.basename(file)).join(', ') : 'ninguno'}`,
  ].join('\n');
}

async function resolvePostImportFiles(dockerDir: string): Promise<string[]> {
  const postImportDir = path.join(dockerDir, 'sql', 'post-import.d');
  if (!(await fs.pathExists(postImportDir))) {
    return [];
  }

  const entries = await fs.readdir(postImportDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => path.join(postImportDir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function runStep<T>(printer: Printer | undefined, label: string, run: () => Promise<T>): Promise<T> {
  if (!printer) {
    return run();
  }

  return withProgress(printer, label, run);
}

async function resolveBackupFile(dockerDir: string, explicitFile?: string): Promise<string> {
  if (explicitFile && explicitFile.trim() !== '') {
    const candidate = path.resolve(explicitFile);
    if (!(await fs.pathExists(candidate))) {
      throw new CliError(`No existe el backup: ${candidate}`, {code: 'DB_BACKUP_NOT_FOUND'});
    }
    return candidate;
  }

  const backupsDir = path.join(dockerDir, 'backups');
  const candidates = await findBackupFiles(backupsDir);
  if (candidates.length === 0) {
    throw new CliError('No se encontró ningún backup en docker/backups/. Usa --file ruta/al/fichero.gz', {
      code: 'DB_BACKUP_NOT_FOUND',
    });
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0].file;
}

async function findBackupFiles(root: string): Promise<Array<{file: string; mtimeMs: number}>> {
  if (!(await fs.pathExists(root))) {
    return [];
  }

  const matches: Array<{file: string; mtimeMs: number}> = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'doclib') {
          continue;
        }
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile() || !/\.(gz|sql|dump)$/i.test(entry.name)) {
        continue;
      }

      const stat = await fs.stat(entryPath);
      matches.push({file: entryPath, mtimeMs: stat.mtimeMs});
    }
  }

  return matches;
}

async function hasDirectoryContents(directory: string, processEnv?: NodeJS.ProcessEnv): Promise<boolean> {
  if (!(await fs.pathExists(directory))) {
    return false;
  }

  try {
    const entries = await fs.readdir(directory);
    return entries.length > 0;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'EACCES' && error.code !== 'EPERM')) {
      throw error;
    }
  }

  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      `${directory}:/target:ro`,
      'alpine',
      'sh',
      '-lc',
      'find /target -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null',
    ],
    {env: processEnv, reject: false},
  );

  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `No se pudo inspeccionar ${directory}`, {
      code: 'DB_IMPORT_POSTGRES_CHECK_FAILED',
    });
  }

  return result.stdout.trim() !== '';
}

async function waitForPostgresReady(
  dockerDir: string,
  envValues: Record<string, string>,
  processEnv?: NodeJS.ProcessEnv,
): Promise<void> {
  const user = envValues.POSTGRES_USER || 'liferay';
  const db = envValues.POSTGRES_DB || 'liferay';

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await runDockerCompose(
      dockerDir,
      ['exec', '-T', 'postgres', 'psql', '-U', user, '-d', db, '-c', 'SELECT 1'],
      {env: processEnv, input: ''},
    );
    if (result.ok) {
      return;
    }

    await sleep(1000);
  }

  throw new CliError('PostgreSQL no respondió en tiempo límite', {code: 'DB_IMPORT_TIMEOUT'});
}

async function streamSqlIntoPostgres(
  dockerDir: string,
  sqlFile: string,
  envValues: Record<string, string>,
  processEnv?: NodeJS.ProcessEnv,
): Promise<void> {
  const user = envValues.POSTGRES_USER || 'liferay';
  const db = envValues.POSTGRES_DB || 'liferay';
  const child = spawn('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', user, '-d', db], {
    cwd: dockerDir,
    env: processEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });

  const source = fs.createReadStream(sqlFile);
  const input = sqlFile.endsWith('.gz') ? source.pipe(createGunzip()) : source;

  try {
    await pipeline(input, child.stdin);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new CliError(stderr.trim() || stdout.trim() || `No se pudo importar ${sqlFile}`, {
      code: 'DB_IMPORT_ERROR',
    });
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
