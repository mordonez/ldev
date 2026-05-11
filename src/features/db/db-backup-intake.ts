import fs from 'fs-extra';
import path from 'node:path';

export type DatabaseBackupArtifact = {
  file: string;
  mtimeMs: number;
};

const DATABASE_BACKUP_FILE_PATTERN = /\.(gz|sql|dump)$/i;

export async function findDatabaseBackupForId(root: string, backupId: string): Promise<string | null> {
  if (!(await fs.pathExists(root))) {
    return null;
  }

  const normalizedBackupId = backupId.trim();
  if (!normalizedBackupId) {
    return null;
  }

  const candidates = await listDatabaseBackups(root);
  const matching = candidates.filter((candidate) => pathIncludesBackupId(root, candidate.file, normalizedBackupId));
  return pickNewestBackup(matching);
}

export async function listDatabaseBackups(root: string): Promise<DatabaseBackupArtifact[]> {
  if (!(await fs.pathExists(root))) {
    return [];
  }

  const results: DatabaseBackupArtifact[] = [];
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

      if (!entry.isFile() || !DATABASE_BACKUP_FILE_PATTERN.test(entry.name)) {
        continue;
      }

      const stats = await fs.stat(entryPath);
      results.push({file: entryPath, mtimeMs: stats.mtimeMs});
    }
  }

  return results;
}

export function pickNewestAddedBackup(
  before: DatabaseBackupArtifact[],
  after: DatabaseBackupArtifact[],
): string | null {
  const existing = new Set(before.map((entry) => path.normalize(entry.file)));
  const added = after.filter((entry) => !existing.has(path.normalize(entry.file)));
  return pickNewestBackup(added);
}

export function pickNewestBackup(entries: DatabaseBackupArtifact[]): string | null {
  if (entries.length === 0) {
    return null;
  }

  return (
    [...entries].sort((left, right) => right.mtimeMs - left.mtimeMs || left.file.localeCompare(right.file))[0]?.file ??
    null
  );
}

function pathIncludesBackupId(root: string, file: string, backupId: string): boolean {
  const relative = path.relative(root, file);
  if (relative.startsWith('..')) {
    return false;
  }

  return relative.split(path.sep).some((segment) => segment.includes(backupId));
}
