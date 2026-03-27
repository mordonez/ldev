import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {readEnvFile} from '../../core/config/env-file.js';
import type {Printer} from '../../core/output/print.js';
import {withProgress} from '../../core/output/print.js';
import {runProcess} from '../../core/platform/process.js';

export type DbDownloadResult = {
  ok: true;
  backupId: string;
  environment: string;
  project: string;
  backupDir: string;
  databaseBackupFile: string;
};

export async function runDbDownload(
  config: AppConfig,
  options?: {
    environment?: string;
    backupId?: string;
    project?: string;
    printer?: Printer;
  },
): Promise<DbDownloadResult> {
  if (!config.dockerDir || !config.files.dockerEnv) {
    throw new CliError('db download requiere ejecutarse dentro de un proyecto con docker/.', {
      code: 'DB_REPO_NOT_FOUND',
    });
  }

  await ensureLcpAvailable();

  const dockerEnv = readEnvFile(config.files.dockerEnv);
  const project = options?.project?.trim() || process.env.LCP_PROJECT?.trim() || dockerEnv.LCP_PROJECT || 'my-lcp-project';
  const environment = options?.environment?.trim() || process.env.LCP_ENVIRONMENT?.trim() || dockerEnv.LCP_ENVIRONMENT || 'prd';
  const backupId = options?.backupId?.trim() || await resolveLatestBackupId(project, environment);
  const backupDir = path.join(config.dockerDir, 'backups');

  await fs.ensureDir(backupDir);

  const databaseBackupFile = await ensureDatabaseBackup(backupDir, project, environment, backupId, options?.printer);

  return {
    ok: true,
    backupId,
    environment,
    project,
    backupDir,
    databaseBackupFile,
  };
}

export function formatDbDownload(result: DbDownloadResult): string {
  return [
    `db-download OK: backupId=${result.backupId}`,
    `environment=${result.environment}`,
    `project=${result.project}`,
    `database=${result.databaseBackupFile}`,
  ].join(' ');
}

async function ensureLcpAvailable(): Promise<void> {
  const version = await runProcess('lcp', ['version'], {reject: false});
  if (!version.ok) {
    const detail = version.stderr.trim() || version.stdout.trim();
    if (detail === '' || /not found/i.test(detail)) {
      throw new CliError('lcp no disponible. Instala LCP CLI o usa un backup local con db import.', {
        code: 'DB_LCP_NOT_AVAILABLE',
      });
    }

    throw new CliError('lcp no está autenticado o no responde. Ejecuta login en LCP CLI.', {
      code: 'DB_LCP_NOT_AUTHENTICATED',
    });
  }
}

async function resolveLatestBackupId(project: string, environment: string): Promise<string> {
  const result = await runProcess(
    'lcp',
    ['backup', 'list', '--project', project, '--environment', environment, '--statuses', 'success', '--max-items', '1'],
    {reject: false},
  );
  if (!result.ok) {
    throw new CliError(`No se pudieron listar backups de ${project}/${environment}: ${result.stderr.trim() || result.stdout.trim()}`, {
      code: 'DB_LCP_BACKUP_LIST_FAILED',
    });
  }

  const backupId = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(Backup|ID|---|#)/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .find((value) => value !== '');

  if (!backupId) {
    throw new CliError(`No se encontró backup exitoso en ${project}/${environment}`, {
      code: 'DB_LCP_BACKUP_NOT_FOUND',
    });
  }

  return backupId;
}

async function ensureDatabaseBackup(
  backupDir: string,
  project: string,
  environment: string,
  backupId: string,
  printer?: Printer,
): Promise<string> {
  const existing = await findBackupForId(backupDir, backupId);
  if (existing) {
    return existing;
  }

  const beforeDownload = await listDatabaseBackups(backupDir);

  await runStep(printer, 'Descargando backup de base de datos desde LCP', async () => {
    const result = await runProcess(
      'lcp',
      ['backup', 'download', '--project', project, '--environment', environment, '--backupId', backupId, '--database', '--dest', backupDir],
      {reject: false},
    );
    if (!result.ok) {
      throw new CliError(result.stderr.trim() || result.stdout.trim() || 'lcp backup download --database', {
        code: 'DB_LCP_BACKUP_DOWNLOAD_FAILED',
      });
    }
  });

  const downloaded = await findBackupForId(backupDir, backupId);
  if (downloaded) {
    return downloaded;
  }

  const afterDownload = await listDatabaseBackups(backupDir);
  const newDownload = pickNewestAddedBackup(beforeDownload, afterDownload);
  if (newDownload) {
    return newDownload;
  }

  const newestBackup = pickNewestBackup(afterDownload);
  if (newestBackup) {
    return newestBackup;
  }

  throw new CliError(`No se encontró el backup descargado para ${backupId} en ${backupDir}`, {
    code: 'DB_LCP_BACKUP_NOT_FOUND',
  });
}

async function findBackupForId(root: string, backupId: string): Promise<string | null> {
  if (!(await fs.pathExists(root))) {
    return null;
  }

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
        queue.push(entryPath);
        continue;
      }

      if (entry.isFile() && /\.(gz|sql|dump)$/i.test(entry.name) && entry.name.includes(backupId)) {
        return entryPath;
      }
    }
  }

  return null;
}

async function listDatabaseBackups(root: string): Promise<Array<{path: string; mtimeMs: number}>> {
  if (!(await fs.pathExists(root))) {
    return [];
  }

  const results: Array<{path: string; mtimeMs: number}> = [];
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
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile() || !/\.(gz|sql|dump)$/i.test(entry.name)) {
        continue;
      }

      const stats = await fs.stat(entryPath);
      results.push({path: entryPath, mtimeMs: stats.mtimeMs});
    }
  }

  return results;
}

function pickNewestAddedBackup(
  before: Array<{path: string; mtimeMs: number}>,
  after: Array<{path: string; mtimeMs: number}>,
): string | null {
  const existing = new Set(before.map((entry) => entry.path));
  const added = after.filter((entry) => !existing.has(entry.path));
  return pickNewestBackup(added);
}

function pickNewestBackup(entries: Array<{path: string; mtimeMs: number}>): string | null {
  if (entries.length === 0) {
    return null;
  }

  return [...entries].sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path))[0]?.path ?? null;
}

async function runStep<T>(printer: Printer | undefined, label: string, run: () => Promise<T>): Promise<T> {
  if (!printer) {
    return run();
  }

  return withProgress(printer, label, run);
}
