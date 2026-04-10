import fs from 'fs-extra';
import path from 'node:path';
import {spawn} from 'node:child_process';
import os from 'node:os';
import {pipeline} from 'node:stream/promises';

import JSZip from 'jszip';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {runStep} from '../../core/output/run-step.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {buildComposeEnv, resolveEnvContext} from '../env/env-files.js';
import {
  resolveAdtsBaseDir,
  resolveFragmentsBaseDir,
  resolveStructuresBaseDir,
  resolveTemplatesBaseDir,
} from '../liferay/resource/liferay-resource-paths.js';

export type SnapshotResult = {
  ok: true;
  snapshotDir: string;
  archiveFile: string | null;
  manifestFile: string;
  databaseDumpFile: string;
  copiedPaths: string[];
};

type SnapshotManifest = {
  capturedAt: string;
  databaseDumpFile: string;
  copiedPaths: string[];
};

export async function runSnapshot(
  config: AppConfig,
  options?: {output?: string; printer?: Printer; processEnv?: NodeJS.ProcessEnv},
): Promise<SnapshotResult> {
  const output = options?.output?.trim();
  const zipOutput = output?.endsWith('.zip') ? path.resolve(output) : null;
  const snapshotDir = zipOutput
    ? await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-snapshot-'))
    : resolveSnapshotDir(config, output);
  const envContext = resolveEnvContext(config);
  const databaseDumpFile = path.join(snapshotDir, 'database.sql');
  const copiedPaths = await collectSnapshotPaths(config);
  const composeEnv = buildComposeEnv(envContext, {withServices: ['postgres'], baseEnv: options?.processEnv});

  await fs.ensureDir(snapshotDir);
  await runStep(options?.printer, 'Starting postgres for snapshot', async () => {
    await runDockerComposeOrThrow(envContext.dockerDir, ['up', '-d', 'postgres'], {env: composeEnv});
  });

  await runStep(options?.printer, 'Generating SQL dump from local environment', async () => {
    await writePostgresDump(envContext, databaseDumpFile, composeEnv);
  });

  await runStep(options?.printer, 'Copying configs and resources to snapshot', async () => {
    for (const sourcePath of copiedPaths) {
      if (!(await fs.pathExists(sourcePath))) {
        continue;
      }
      const targetPath = path.join(snapshotDir, 'repo-state', path.relative(config.repoRoot ?? '', sourcePath));
      await fs.ensureDir(path.dirname(targetPath));
      await fs.copy(sourcePath, targetPath, {overwrite: true});
    }
  });

  const manifest: SnapshotManifest = {
    capturedAt: new Date().toISOString(),
    databaseDumpFile: path.basename(databaseDumpFile),
    copiedPaths: copiedPaths.map((item) => path.relative(config.repoRoot ?? '', item)),
  };
  const manifestFile = path.join(snapshotDir, 'manifest.json');
  await fs.writeJson(manifestFile, manifest, {spaces: 2});

  if (zipOutput) {
    await runStep(options?.printer, 'Packing snapshot into ZIP', async () => {
      await writeZipArchive(snapshotDir, zipOutput);
    });
    await fs.remove(snapshotDir).catch(() => undefined);
  }

  return {
    ok: true,
    snapshotDir: zipOutput ?? snapshotDir,
    archiveFile: zipOutput,
    manifestFile: zipOutput ? path.basename(manifestFile) : manifestFile,
    databaseDumpFile: zipOutput ? path.basename(databaseDumpFile) : databaseDumpFile,
    copiedPaths,
  };
}

export function formatSnapshot(result: SnapshotResult): string {
  return [
    `Snapshot: ${result.snapshotDir}`,
    `Archive: ${result.archiveFile ?? 'none'}`,
    `Database: ${result.databaseDumpFile}`,
    `Manifest: ${result.manifestFile}`,
    `Copied paths: ${result.copiedPaths.length}`,
  ].join('\n');
}

function resolveSnapshotDir(config: AppConfig, explicitOutput?: string): string {
  if (explicitOutput?.trim()) {
    return path.resolve(explicitOutput);
  }
  if (!config.repoRoot) {
    throw new CliError('snapshot requires repo root.', {code: 'SNAPSHOT_REPO_REQUIRED'});
  }

  const stamp = new Date().toISOString().replaceAll(':', '-');
  return path.join(config.repoRoot, '.ldev', 'snapshots', stamp);
}

async function collectSnapshotPaths(config: AppConfig): Promise<string[]> {
  if (!config.liferayDir) {
    throw new CliError('snapshot requires liferayDir.', {code: 'SNAPSHOT_REPO_REQUIRED'});
  }

  return [
    path.join(config.liferayDir, 'configs'),
    resolveStructuresBaseDir(config),
    resolveTemplatesBaseDir(config),
    resolveAdtsBaseDir(config),
    resolveFragmentsBaseDir(config),
  ];
}

async function writePostgresDump(
  envContext: ReturnType<typeof resolveEnvContext>,
  outputFile: string,
  processEnv?: NodeJS.ProcessEnv,
): Promise<void> {
  const user = envContext.envValues.POSTGRES_USER || 'liferay';
  const db = envContext.envValues.POSTGRES_DB || 'liferay';
  const child = spawn('docker', ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', user, '-d', db], {
    cwd: envContext.dockerDir,
    env: processEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const closePromise = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  await fs.ensureDir(path.dirname(outputFile));
  const target = fs.createWriteStream(outputFile);
  await pipeline(child.stdout, target);
  const exitCode = await closePromise;

  if (exitCode !== 0) {
    throw new CliError(stderr.trim() || 'pg_dump failed', {code: 'SNAPSHOT_DB_DUMP_FAILED'});
  }
}

async function writeZipArchive(snapshotDir: string, archiveFile: string): Promise<void> {
  const zip = new JSZip();
  await addDirectoryToZip(zip, snapshotDir, snapshotDir);
  await fs.ensureDir(path.dirname(archiveFile));
  await fs.writeFile(archiveFile, await zip.generateAsync({type: 'nodebuffer'}));
}

async function addDirectoryToZip(zip: JSZip, rootDir: string, currentDir: string): Promise<void> {
  const entries = await fs.readdir(currentDir, {withFileTypes: true});
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, rootDir, entryPath);
      continue;
    }

    if (entry.isFile()) {
      zip.file(path.relative(rootDir, entryPath).split(path.sep).join('/'), await fs.readFile(entryPath));
    }
  }
}
