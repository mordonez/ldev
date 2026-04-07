import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

import JSZip from 'jszip';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {runStep} from '../../core/output/run-step.js';
import {runDbImport} from '../db/db-import.js';

export type RestoreResult = {
  ok: true;
  snapshotDir: string;
  restoredPaths: string[];
  databaseRestored: boolean;
};

type SnapshotManifest = {
  capturedAt: string;
  databaseDumpFile: string;
  copiedPaths: string[];
};

export async function runRestore(
  config: AppConfig,
  options: {
    snapshot: string;
    force?: boolean;
    skipDb?: boolean;
    skipFiles?: boolean;
    printer?: Printer;
    processEnv?: NodeJS.ProcessEnv;
  },
): Promise<RestoreResult> {
  if (!config.repoRoot || !config.liferayDir) {
    throw new CliError('restore must be run inside a project.', {code: 'RESTORE_REPO_REQUIRED'});
  }
  if (!(options.force ?? false)) {
    throw new CliError('restore is destructive for the local database. Re-run with --force to confirm.', {
      code: 'RESTORE_FORCE_REQUIRED',
    });
  }

  const resolvedSnapshot = path.resolve(options.snapshot);
  const extractedDir = await extractSnapshotIfNeeded(resolvedSnapshot);
  const snapshotDir = extractedDir ?? resolvedSnapshot;

  try {
    const manifestFile = path.join(snapshotDir, 'manifest.json');
    if (!(await fs.pathExists(manifestFile))) {
      throw new CliError(`manifest.json not found in ${snapshotDir}`, {code: 'RESTORE_SNAPSHOT_NOT_FOUND'});
    }

    const manifest = (await fs.readJson(manifestFile)) as SnapshotManifest;
    const restoredPaths: string[] = [];

    if (!(options.skipFiles ?? false)) {
      await runStep(options.printer, 'Restoring configs and resources from snapshot', async () => {
        for (const relativePath of manifest.copiedPaths) {
          const sourcePath = path.join(snapshotDir, 'repo-state', relativePath);
          const targetPath = path.join(config.repoRoot!, relativePath);
          if (!(await fs.pathExists(sourcePath))) {
            continue;
          }
          await fs.remove(targetPath).catch(() => undefined);
          await fs.ensureDir(path.dirname(targetPath));
          await fs.copy(sourcePath, targetPath, {overwrite: true});
          restoredPaths.push(targetPath);
        }
      });
    }

    let databaseRestored = false;
    if (!(options.skipDb ?? false)) {
      const dumpFile = path.join(snapshotDir, manifest.databaseDumpFile);
      await runStep(options.printer, 'Restoring database from snapshot', async () => {
        await runDbImport(config, {
          file: dumpFile,
          force: true,
          processEnv: options.processEnv,
          printer: undefined,
        });
      });
      databaseRestored = true;
    }

    return {
      ok: true,
      snapshotDir: resolvedSnapshot,
      restoredPaths,
      databaseRestored,
    };
  } finally {
    if (extractedDir) {
      await fs.remove(extractedDir).catch(() => undefined);
    }
  }
}

export function formatRestore(result: RestoreResult): string {
  return [
    `Snapshot restored: ${result.snapshotDir}`,
    `Files restored: ${result.restoredPaths.length}`,
    `Database restored: ${result.databaseRestored}`,
  ].join('\n');
}

async function extractSnapshotIfNeeded(snapshotPath: string): Promise<string | null> {
  if (!snapshotPath.endsWith('.zip')) {
    return null;
  }

  if (!(await fs.pathExists(snapshotPath))) {
    throw new CliError(`Snapshot zip not found: ${snapshotPath}`, {code: 'RESTORE_SNAPSHOT_NOT_FOUND'});
  }

  const zip = await JSZip.loadAsync(await fs.readFile(snapshotPath));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-restore-'));

  const targetDirNormalized = path.resolve(targetDir) + path.sep;
  await Promise.all(
    Object.values(zip.files).map(async (entry) => {
      const targetPath = path.resolve(path.join(targetDir, entry.name));
      if (!targetPath.startsWith(targetDirNormalized)) {
        throw new CliError(`Invalid ZIP entry: ${entry.name}`, {code: 'RESTORE_INVALID_ZIP'});
      }

      if (entry.dir) {
        await fs.ensureDir(targetPath);
        return;
      }

      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, await entry.async('nodebuffer'));
    }),
  );

  return targetDir;
}
