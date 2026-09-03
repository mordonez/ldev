import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../core/errors.js';

export async function resolvePostImportFiles(dockerDir: string): Promise<string[]> {
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

export async function resolveBackupFile(dockerDir: string, explicitFile?: string): Promise<string> {
  if (explicitFile && explicitFile.trim() !== '') {
    const candidate = path.resolve(explicitFile);
    if (!(await fs.pathExists(candidate))) {
      throw new CliError(`Backup does not exist: ${candidate}`, {code: 'DB_BACKUP_NOT_FOUND'});
    }
    return candidate;
  }

  const backupsDir = path.join(dockerDir, 'backups');
  const candidates = await findBackupFiles(backupsDir);
  if (candidates.length === 0) {
    throw new CliError('No backup was found in docker/backups/. Use --file path/to/file.gz', {
      code: 'DB_BACKUP_NOT_FOUND',
    });
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0].file;
}

export async function findBackupFiles(root: string): Promise<Array<{file: string; mtimeMs: number}>> {
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
