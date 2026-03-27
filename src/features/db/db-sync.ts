import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';

import {runDbDownload, type DbDownloadResult} from './db-download.js';
import {runDbImport, type DbImportResult} from './db-import.js';

export type DbSyncResult = {
  ok: true;
  download: DbDownloadResult;
  import: DbImportResult;
};

export async function runDbSync(
  config: AppConfig,
  options?: {
    environment?: string;
    backupId?: string;
    project?: string;
    skipPostImport?: boolean;
    force?: boolean;
    printer?: Printer;
  },
): Promise<DbSyncResult> {
  const download = await runDbDownload(config, {
    environment: options?.environment,
    backupId: options?.backupId,
    project: options?.project,
    printer: options?.printer,
  });

  if (!download.databaseBackupFile) {
    throw new Error('db sync esperaba un backup de base de datos descargado.');
  }

  const importResult = await runDbImport(config, {
    file: download.databaseBackupFile,
    skipPostImport: options?.skipPostImport,
    force: options?.force,
    printer: options?.printer,
  });

  return {
    ok: true,
    download,
    import: importResult,
  };
}

export function formatDbSync(result: DbSyncResult): string {
  return [
    `DB sync OK: backupId=${result.download.backupId}`,
    `backup=${result.import.backupFile}`,
    `post-import=${result.import.postImportFiles.length}`,
  ].join(' ');
}
