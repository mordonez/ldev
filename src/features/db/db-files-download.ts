import fs from 'fs-extra';
import path from 'node:path';

import pWaitFor from 'p-wait-for';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {readEnvFile, upsertEnvFileValues} from '../../core/config/env-file.js';
import type {Printer} from '../../core/output/printer.js';
import {runStep} from '../../core/output/run-step.js';
import {
  formatProcessError,
  normalizeProcessEnv,
  runProcess,
  spawnDetachedProcess,
} from '../../core/platform/process.js';

export type DbFilesDownloadResult = {
  ok: true;
  backupId: string;
  environment: string;
  project: string;
  backupDir: string;
  doclibPath: string | null;
  background: boolean;
};

export async function runDbFilesDownload(
  config: AppConfig,
  options?: {
    environment?: string;
    backupId?: string;
    project?: string;
    doclibDest?: string;
    background?: boolean;
    printer?: Printer;
  },
): Promise<DbFilesDownloadResult> {
  if (!config.dockerDir || !config.files.dockerEnv) {
    throw new CliError('db files-download must be run inside a project with docker/.', {
      code: 'DB_REPO_NOT_FOUND',
    });
  }

  await ensureLcpAvailable();

  const dockerEnv = readEnvFile(config.files.dockerEnv);
  const project =
    options?.project?.trim() || process.env.LCP_PROJECT?.trim() || dockerEnv.LCP_PROJECT || 'my-lcp-project';
  const environment =
    options?.environment?.trim() || process.env.LCP_ENVIRONMENT?.trim() || dockerEnv.LCP_ENVIRONMENT || 'prd';
  const backupId = options?.backupId?.trim() || (await resolveLatestBackupId(project, environment));
  const backupDir = path.join(config.dockerDir, 'backups');

  await fs.ensureDir(backupDir);

  const doclibPath = await ensureDoclibBackup({
    dockerEnvFile: config.files.dockerEnv,
    backupDir,
    project,
    environment,
    backupId,
    doclibDest: options?.doclibDest,
    background: Boolean(options?.background),
    printer: options?.printer,
  });

  return {
    ok: true,
    backupId,
    environment,
    project,
    backupDir,
    doclibPath,
    background: Boolean(options?.background),
  };
}

export function formatDbFilesDownload(result: DbFilesDownloadResult): string {
  return [
    `db-files-download OK: backupId=${result.backupId}`,
    `environment=${result.environment}`,
    `project=${result.project}`,
    `doclib=${result.doclibPath ?? 'pendiente'}`,
    `background=${result.background}`,
  ].join(' ');
}

async function ensureLcpAvailable(): Promise<void> {
  const version = await runProcess('lcp', ['version'], {reject: false});
  if (!version.ok) {
    const detail = version.stderr.trim() || version.stdout.trim();
    if (detail === '' || /not found/i.test(detail)) {
      throw new CliError('lcp is not available. Install the LCP CLI to download doclib.', {
        code: 'DB_LCP_NOT_AVAILABLE',
      });
    }

    throw new CliError('lcp is not authenticated or is not responding. Run login in the LCP CLI.', {
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
    throw new CliError(
      `No se pudieron listar backups de ${project}/${environment}: ${result.stderr.trim() || result.stdout.trim()}`,
      {
        code: 'DB_LCP_BACKUP_LIST_FAILED',
      },
    );
  }

  const backupId = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(Backup|ID|---|#)/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .find((value) => value !== '');

  if (!backupId) {
    throw new CliError(`No successful backup was found in ${project}/${environment}`, {
      code: 'DB_LCP_BACKUP_NOT_FOUND',
    });
  }

  return backupId;
}

async function ensureDoclibBackup(options: {
  dockerEnvFile: string;
  backupDir: string;
  project: string;
  environment: string;
  backupId: string;
  doclibDest?: string;
  background: boolean;
  printer?: Printer;
}): Promise<string | null> {
  const targetDoclibDir = options.doclibDest?.trim() || path.join(options.backupDir, 'doclib');
  await fs.ensureDir(targetDoclibDir);

  if (options.background) {
    return ensureDoclibBackupBackground(options);
  }

  await runStep(options.printer, 'Downloading doclib from LCP', async () => {
    const result = await runProcess(
      'lcp',
      [
        'backup',
        'download',
        '--project',
        options.project,
        '--environment',
        options.environment,
        '--backupId',
        options.backupId,
        '--doclib',
        '--dest',
        targetDoclibDir,
      ],
      {reject: false},
    );
    if (!result.ok) {
      throw new CliError(formatProcessError(result, 'lcp backup download --doclib'), {
        code: 'DB_LCP_DOCLIB_DOWNLOAD_FAILED',
      });
    }
  });

  const doclibDir = await findDirectoryNamed(targetDoclibDir, 'doclib', 3);
  const resolvedDoclibRoot = doclibDir ? await resolveDoclibRoot(doclibDir) : null;
  if (resolvedDoclibRoot) {
    const currentContent = await fs.readFile(options.dockerEnvFile, 'utf8').catch(() => '');
    const updatedContent = upsertEnvFileValues(currentContent, {DOCLIB_PATH: resolvedDoclibRoot});
    await fs.writeFile(options.dockerEnvFile, `${updatedContent}\n`);
  }

  return resolvedDoclibRoot ?? targetDoclibDir;
}

async function ensureDoclibBackupBackground(options: {
  dockerEnvFile: string;
  backupDir: string;
  project: string;
  environment: string;
  backupId: string;
  doclibDest?: string;
  background: boolean;
  printer?: Printer;
}): Promise<string | null> {
  const targetDoclibDir = options.doclibDest?.trim() || path.join(options.backupDir, 'doclib');
  const logFile = path.join(options.backupDir, 'doclib-download.log');
  const pidFile = path.join(options.backupDir, 'doclib-download.pid');

  if (await fs.pathExists(pidFile)) {
    const existingPid = (await fs.readFile(pidFile, 'utf8')).trim();
    if (existingPid !== '' && processExists(Number(existingPid))) {
      return null;
    }
    await fs.remove(pidFile);
  }

  const outFd = await fs.open(logFile, 'a');
  const normalizedEnv = normalizeProcessEnv(process.env);
  const child = spawnDetachedProcess(
    'lcp',
    [
      'backup',
      'download',
      '--project',
      options.project,
      '--environment',
      options.environment,
      '--backupId',
      options.backupId,
      '--doclib',
      '--dest',
      targetDoclibDir,
    ],
    {
      detached: true,
      env: normalizedEnv,
      shell: process.platform === 'win32',
      stdio: ['ignore', outFd, outFd],
    },
  );
  child.unref();
  await fs.close(outFd);
  await fs.writeFile(pidFile, `${child.pid}\n`);

  let resolvedDoclibRoot: string | null = null;

  try {
    await pWaitFor(
      async () => {
        const doclibDir = await findDirectoryNamed(targetDoclibDir, 'doclib', 3);
        if (doclibDir) {
          resolvedDoclibRoot = await resolveDoclibRoot(doclibDir);
          return true;
        }

        if (!processExists(child.pid ?? -1)) {
          await fs.remove(pidFile);
          throw new CliError(`The download failed during startup. Check: ${logFile}`, {
            code: 'DB_LCP_DOCLIB_DOWNLOAD_FAILED',
          });
        }

        return false;
      },
      {timeout: 120000, interval: 1000},
    );
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    try {
      process.kill(child.pid ?? -1);
    } catch {
      // no-op
    }
    await fs.remove(pidFile);
    throw new CliError(`Doclib download did not start before the timeout. Check: ${logFile}`, {
      code: 'DB_LCP_DOCLIB_DOWNLOAD_TIMEOUT',
    });
  }

  const currentContent = await fs.readFile(options.dockerEnvFile, 'utf8').catch(() => '');
  const updatedContent = upsertEnvFileValues(currentContent, {DOCLIB_PATH: resolvedDoclibRoot!});
  await fs.writeFile(options.dockerEnvFile, `${updatedContent}\n`);
  return resolvedDoclibRoot;
}

async function findDirectoryNamed(root: string, name: string, maxDepth: number): Promise<string | null> {
  if (!(await fs.pathExists(root))) {
    return null;
  }

  const queue: Array<{dir: string; depth: number}> = [{dir: root, depth: 0}];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current.dir, {withFileTypes: true}).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'ENOENT') {
        return [];
      }

      throw error;
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryPath = path.join(current.dir, entry.name);
      if (entry.name === name) {
        return entryPath;
      }

      if (current.depth + 1 < maxDepth) {
        queue.push({dir: entryPath, depth: current.depth + 1});
      }
    }
  }

  return null;
}

async function resolveDoclibRoot(doclibDir: string): Promise<string> {
  const entries = await fs.readdir(doclibDir, {withFileTypes: true}).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nestedPath = path.join(doclibDir, entry.name);
    const nestedEntries = await fs.readdir(nestedPath).catch(() => []);
    if (nestedEntries.some((value) => /^[0-9]+$/.test(value))) {
      return nestedPath;
    }
  }

  return doclibDir;
}

function processExists(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
