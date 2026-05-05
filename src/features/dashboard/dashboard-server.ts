import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {loadConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {runDocker} from '../../core/platform/docker.js';
import {listGitWorktreeDetails} from '../../core/platform/git.js';
import {normalizeProcessEnv, resolveSpawnCommand, spawnPipedProcess} from '../../core/platform/process.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {collectEnvStatus} from '../../core/runtime/env-health.js';
import {runEnvStart} from '../env/env-start.js';
import {runEnvStop} from '../env/env-stop.js';
import {formatDbDownload, runDbDownload} from '../db/db-download.js';
import {formatDbImport, runDbImport} from '../db/db-import.js';
import {formatDbQuery, runDbQuery} from '../db/db-query.js';
import {formatDbSync, runDbSync} from '../db/db-sync.js';
import {formatDeployCacheUpdate, runDeployCacheUpdate} from '../deploy/deploy-cache-update.js';
import {formatDeployStatus, runDeployStatus} from '../deploy/deploy-status.js';
import {runEnvRecreate, formatEnvRecreate} from '../env/env-recreate.js';
import {runEnvRestart, formatEnvRestart} from '../env/env-restart.js';
import {formatMcpDoctor, runMcpDoctor} from '../mcp-server/mcp-server-doctor.js';
import {formatMcpSetup, runMcpSetup} from '../mcp-server/mcp-server-setup.js';
import {
  formatLiferayResourceExportAdts,
  runLiferayResourceExportAdts,
} from '../liferay/resource/liferay-resource-export-adts.js';
import {
  formatLiferayResourceExportFragments,
  runLiferayResourceExportFragments,
} from '../liferay/resource/liferay-resource-export-fragments.js';
import {
  formatLiferayResourceExportStructures,
  runLiferayResourceExportStructures,
} from '../liferay/resource/liferay-resource-export-structures.js';
import {
  formatLiferayResourceExportTemplates,
  runLiferayResourceExportTemplates,
} from '../liferay/resource/liferay-resource-export-templates.js';
import {runWorktreeClean} from '../worktree/worktree-clean.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';
import {formatWorktreeGc, runWorktreeGc} from '../worktree/worktree-gc.js';
import {runWorktreeSetup} from '../worktree/worktree-setup.js';
import {formatDoctor, runDoctor} from '../doctor/doctor.service.js';
import {collectDashboardStatus} from './dashboard-data.js';
import {matchQueuedDashboardOperation} from './dashboard-operation-dispatcher.js';
import {createDashboardTaskManager} from './dashboard-tasks.js';

const DASHBOARD_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_CLIENT_DIST_DIRS = [
  path.resolve(DASHBOARD_SERVER_DIR, 'dashboard-client'),
  path.resolve(DASHBOARD_SERVER_DIR, '../../dashboard-client'),
];

function getContentType(filePath: string): string {
  const ext = path.extname(filePath);
  if (ext === '.css') {
    return 'text/css; charset=utf-8';
  }
  if (ext === '.js') {
    return 'text/javascript; charset=utf-8';
  }
  if (ext === '.html') {
    return 'text/html; charset=utf-8';
  }
  if (ext === '.map' || ext === '.json') {
    return 'application/json; charset=utf-8';
  }
  return 'application/octet-stream';
}

function readDashboardIndex(clientDistDirs: string[]): string | null {
  for (const distDir of clientDistDirs) {
    const distIndexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return fs.readFileSync(distIndexPath, 'utf8');
    }
  }

  return null;
}

function resolveDashboardAsset(urlPath: string, clientDistDirs: string[]): string | null {
  for (const distDir of clientDistDirs) {
    const distAssetPath = path.resolve(distDir, urlPath.replace(/^\/+/, ''));
    if (distAssetPath.startsWith(distDir + path.sep) && fs.existsSync(distAssetPath)) {
      return distAssetPath;
    }
  }

  return null;
}

export type DashboardServerOptions = {
  cwd: string;
  port: number;
  clientDistDirs?: string[];
  onReady?: (url: string) => void;
};

type DashboardCreateWorktreePayload = {
  name?: string;
  baseRef?: string;
  withEnv?: boolean;
  stopMainForClone?: boolean;
  restartMainAfterClone?: boolean;
};

type DashboardMcpDoctorPayload = {
  tool?: 'all' | 'claude-code' | 'cursor' | 'vscode';
  skipHandshake?: boolean;
};

type DashboardMcpSetupPayload = {
  tool?: 'all' | 'claude-code' | 'cursor' | 'vscode';
  strategy?: 'global' | 'local' | 'npx';
};

type DashboardDbActionPayload = {
  environment?: string;
  file?: string;
  force?: boolean;
  query?: string;
};

type DashboardMaintenancePayload = {
  days?: number;
  apply?: boolean;
};

const DASHBOARD_RESOURCE_EXPORT_KINDS = ['templates', 'structures', 'adts', 'fragments'] as const;

type DashboardResourceExportKind = (typeof DASHBOARD_RESOURCE_EXPORT_KINDS)[number];

type DashboardResourceExportPayload = {
  resources?: string[];
};

function isMissingResourceError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('not found');
}

function writeDashboardError(
  res: http.ServerResponse,
  err: unknown,
  options?: {badRequestMessage?: string; internalMessage?: string; notFoundMessage?: string},
): void {
  const status = err instanceof SyntaxError ? 400 : isMissingResourceError(err) ? 404 : 500;
  const errorMessage =
    status === 400
      ? (options?.badRequestMessage ?? 'Invalid request payload')
      : status === 404
        ? (options?.notFoundMessage ?? 'Requested resource was not found')
        : (options?.internalMessage ?? 'Internal dashboard error');

  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({error: errorMessage}));
}

async function handleStatus(cwd: string, res: http.ServerResponse): Promise<void> {
  try {
    const data = await collectDashboardStatus(cwd, {includeGit: true, includeRuntimeDetails: true});
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
  } catch (err) {
    writeDashboardError(res, err, {internalMessage: 'Could not load dashboard status'});
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    throw new Error('Unsupported request body chunk type');
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function resolveWorktreePath(cwd: string, worktreeName: string): Promise<string | null> {
  const worktreeInfos = await listGitWorktreeDetails(cwd);
  const mainRepoRoot = path.resolve(cwd);
  const target = worktreeInfos.find((info) => {
    const isMain = path.normalize(info.path) === path.normalize(mainRepoRoot);
    const name = isMain ? path.basename(mainRepoRoot) : path.basename(info.path);
    return name === worktreeName;
  });
  return target?.path ?? null;
}

async function resolveWorktreeConfig(cwd: string, worktreeName: string) {
  const worktreePath = await resolveWorktreePath(cwd, worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  const config = loadConfig({cwd: worktreePath});
  if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
    throw new Error('No docker environment configured for this worktree');
  }

  return config;
}

async function resolveScopedConfig(cwd: string, worktreeName?: string) {
  if (!worktreeName) {
    return {
      cwd,
      config: loadConfig({cwd}),
    };
  }

  const worktreePath = await resolveWorktreePath(cwd, worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  return {
    cwd: worktreePath,
    config: loadConfig({cwd: worktreePath}),
  };
}

async function handleWorktreeStart(cwd: string, worktreeName: string, printer?: Printer): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  await runEnvStart(config, {wait: false, printer});
}

async function handleWorktreeStop(cwd: string, worktreeName: string, printer?: Printer): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  await runEnvStop(config, {processEnv: process.env, printer});
}

async function handleWorktreeDelete(cwd: string, worktreeName: string, printer?: Printer): Promise<void> {
  const mainRepoRoot = path.resolve(cwd);
  const worktreePath = await resolveWorktreePath(cwd, worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  if (path.normalize(worktreePath) === path.normalize(mainRepoRoot)) {
    throw new Error('Cannot delete the main worktree');
  }

  await runWorktreeClean({cwd, name: worktreeName, force: true, printer});
}

async function handleWorktreeEnvInit(cwd: string, worktreeName: string, printer?: Printer): Promise<void> {
  const worktreePath = await resolveWorktreePath(cwd, worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  await runWorktreeEnv({cwd: worktreePath, printer});
}

function writeTaskLines(printer: Printer, output: string): void {
  for (const line of output.split('\n')) {
    if (line.trim()) {
      printer.info(line);
    }
  }
}

async function handleDoctorRun(cwd: string, worktreeName: string | undefined, printer: Printer): Promise<void> {
  const scoped = await resolveScopedConfig(cwd, worktreeName);
  const report = await runDoctor(scoped.cwd, {
    config: scoped.config,
    env: process.env,
    scopes: ['basic', 'runtime', 'portal'],
  });
  writeTaskLines(printer, formatDoctor(report));
}

async function handleDoctorPreview(cwd: string, worktreeName?: string) {
  const scoped = await resolveScopedConfig(cwd, worktreeName);
  return runDoctor(scoped.cwd, {
    config: scoped.config,
    env: process.env,
    scopes: ['basic', 'runtime', 'portal'],
  });
}

async function handleWorktreeRepairAction(
  cwd: string,
  worktreeName: string,
  action: 'restart' | 'recreate',
  printer: Printer,
): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  if (action === 'restart') {
    const result = await runEnvRestart(config, {printer});
    writeTaskLines(printer, formatEnvRestart(result));
    return;
  }

  const result = await runEnvRecreate(config, {printer});
  writeTaskLines(printer, formatEnvRecreate(result));
}

async function handleWorktreeDeployAction(
  cwd: string,
  worktreeName: string,
  action: 'status' | 'cache-update',
  printer: Printer,
): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  if (action === 'status') {
    const result = await runDeployStatus(config, {processEnv: process.env});
    writeTaskLines(printer, formatDeployStatus(result));
    return;
  }

  const result = await runDeployCacheUpdate(config, {printer});
  writeTaskLines(printer, formatDeployCacheUpdate(result));
}

async function handleWorktreeDeployPreview(cwd: string, worktreeName: string) {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  return runDeployStatus(config, {processEnv: process.env});
}

function normalizeDashboardResourceKinds(resources: unknown): DashboardResourceExportKind[] {
  if (!Array.isArray(resources)) {
    return [];
  }

  const allowed = new Set<string>(DASHBOARD_RESOURCE_EXPORT_KINDS);
  const unique = new Set<DashboardResourceExportKind>();

  for (const resource of resources) {
    if (typeof resource === 'string' && allowed.has(resource)) {
      unique.add(resource as DashboardResourceExportKind);
    }
  }

  return Array.from(unique);
}

async function handleWorktreeResourceExport(
  cwd: string,
  worktreeName: string,
  resources: DashboardResourceExportKind[],
  printer: Printer,
): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);

  for (const resource of resources) {
    printer.info(`Running resource export-${resource} --all-sites`);

    if (resource === 'templates') {
      const result = await runLiferayResourceExportTemplates(config, {allSites: true});
      writeTaskLines(printer, formatLiferayResourceExportTemplates(result));
      continue;
    }

    if (resource === 'structures') {
      const result = await runLiferayResourceExportStructures(config, {allSites: true});
      writeTaskLines(printer, formatLiferayResourceExportStructures(result));
      continue;
    }

    if (resource === 'adts') {
      const result = await runLiferayResourceExportAdts(config, {allSites: true});
      writeTaskLines(printer, formatLiferayResourceExportAdts(result));
      continue;
    }

    const result = await runLiferayResourceExportFragments(config, {allSites: true});
    writeTaskLines(printer, formatLiferayResourceExportFragments(result));
  }
}

async function handleMaintenancePreview(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const requestUrl = new URL(req.url ?? '/api/maintenance/worktrees/gc', 'http://127.0.0.1');
    const days = Number.parseInt(requestUrl.searchParams.get('days') ?? '7', 10) || 7;
    const result = await runWorktreeGc({cwd, days, apply: false, processEnv: process.env});
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('worktree gc must be run inside a valid git repository')) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          ok: true,
          apply: false,
          candidates: [],
          cleaned: [],
          unavailable: true,
          message: 'Maintenance preview is unavailable outside a git repository',
        }),
      );
      return;
    }

    writeDashboardError(res, err, {
      internalMessage: 'Could not load worktree maintenance preview',
    });
  }
}

async function handleMaintenanceApply(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMaintenancePayload;
    const days = Number.parseInt(String(payload.days ?? 7), 10) || 7;
    const task = taskManager.startTask(
      {kind: 'worktree-gc', label: `Applying worktree maintenance (${days}d)`},
      async (printer) => {
        const result = await runWorktreeGc({cwd, days, apply: true, processEnv: process.env, printer});
        writeTaskLines(printer, formatWorktreeGc(result));
      },
    );

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, action: 'worktree-gc'}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid maintenance request payload',
      internalMessage: 'Could not apply worktree maintenance',
    });
  }
}

async function handleWorktreeDbAction(
  cwd: string,
  worktreeName: string,
  action: 'download' | 'sync' | 'import' | 'query',
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardDbActionPayload;
    const config = await resolveWorktreeConfig(cwd, worktreeName);

    const task = taskManager.startTask(
      {kind: `db-${action}`, label: `DB ${action} for ${worktreeName}`, worktreeName},
      async (printer) => {
        if (action === 'download') {
          const result = await runDbDownload(config, {
            environment: payload.environment,
            printer,
          });
          writeTaskLines(printer, formatDbDownload(result));
          return;
        }

        if (action === 'sync') {
          const result = await runDbSync(config, {
            environment: payload.environment,
            force: payload.force !== false,
            printer,
          });
          writeTaskLines(printer, formatDbSync(result));
          return;
        }

        if (action === 'import') {
          const result = await runDbImport(config, {
            file: payload.file,
            force: payload.force !== false,
            printer,
          });
          writeTaskLines(printer, formatDbImport(result));
          return;
        }

        const result = await runDbQuery(config, {
          query: payload.query,
          file: payload.file,
          processEnv: process.env,
        });
        writeTaskLines(printer, formatDbQuery(result));
      },
    );

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, worktree: worktreeName, action: `db-${action}`}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid database request payload',
      internalMessage: 'Could not queue the database task',
      notFoundMessage: 'Worktree was not found',
    });
  }
}

async function handleWorktreeCreate(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardCreateWorktreePayload;
    const name = payload.name?.trim();

    if (!name) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Worktree name is required'}));
      return;
    }

    const baseRef = payload.baseRef?.trim() || undefined;
    const withEnv = payload.withEnv !== false;
    const stopMainForClone = withEnv ? payload.stopMainForClone !== false : false;
    const restartMainAfterClone = withEnv && Boolean(payload.restartMainAfterClone);

    const task = taskManager.startTask(
      {kind: 'worktree-create', label: `Creating worktree ${name}`, worktreeName: name},
      async (printer) => {
        const result = await runWorktreeSetup({
          cwd,
          name,
          baseRef,
          withEnv,
          stopMainForClone,
          restartMainAfterClone,
          stopEnv: runEnvStop,
          startEnv: runEnvStart,
          printer,
        });
        printer.info(`Worktree ready: ${result.worktreeDir}`);
      },
    );

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, worktree: name, action: 'create'}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid worktree creation request',
      internalMessage: 'Could not create the worktree task',
    });
  }
}

async function handleMcpDoctor(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMcpDoctorPayload;
    const tool = payload.tool ?? 'all';
    const handshake = payload.skipHandshake !== true;

    const task = taskManager.startTask({kind: 'mcp-doctor', label: `Running MCP doctor (${tool})`}, async (printer) => {
      const result = await runMcpDoctor({
        targetDir: cwd,
        tool,
        handshake,
        timeoutMs: handshake ? 10000 : 5000,
      });

      for (const line of formatMcpDoctor(result).split('\n')) {
        if (line.trim()) {
          printer.info(line);
        }
      }

      if (!result.ok) {
        throw new Error('MCP doctor found issues');
      }
    });

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, action: 'mcp-doctor', tool}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid MCP doctor request payload',
      internalMessage: 'Could not queue the MCP doctor task',
    });
  }
}

async function handleMcpSetup(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMcpSetupPayload;
    const tool = payload.tool ?? 'all';
    const strategy = payload.strategy;

    const task = taskManager.startTask({kind: 'mcp-setup', label: `Running MCP setup (${tool})`}, async (printer) => {
      const result = await runMcpSetup({targetDir: cwd, tool, strategy});

      for (const line of formatMcpSetup(result).split('\n')) {
        if (line.trim()) {
          printer.info(line);
        }
      }
    });

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, action: 'mcp-setup', tool, strategy: strategy ?? null}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid MCP setup request payload',
      internalMessage: 'Could not queue the MCP setup task',
    });
  }
}

async function handleWorktreeMcpSetup(
  cwd: string,
  worktreeName: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMcpSetupPayload;
    const tool = payload.tool ?? 'all';
    const strategy = payload.strategy;
    const worktreePath = await resolveWorktreePath(cwd, worktreeName);

    if (!worktreePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: `Worktree '${worktreeName}' not found`}));
      return;
    }

    const task = taskManager.startTask(
      {kind: 'mcp-setup', label: `Running MCP setup for ${worktreeName}`, worktreeName},
      async (printer) => {
        const result = await runMcpSetup({targetDir: worktreePath, tool, strategy});

        for (const line of formatMcpSetup(result).split('\n')) {
          if (line.trim()) {
            printer.info(line);
          }
        }
      },
    );

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, action: 'mcp-setup', worktree: worktreeName, tool}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid worktree MCP setup request payload',
      internalMessage: 'Could not queue the worktree MCP setup task',
      notFoundMessage: 'Worktree was not found',
    });
  }
}

async function handleWorktreeLogs(cwd: string, worktreeName: string, res: http.ServerResponse): Promise<void> {
  try {
    const {composeEnv, containerId, running} = await resolveWorktreeLogContext(cwd, worktreeName);

    if (!containerId) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({logs: '', containerId: null, service: 'liferay', running: false}));
      return;
    }

    const result = await runDocker(['logs', '--tail', '200', '--timestamps', containerId], {
      env: composeEnv,
      reject: false,
    });

    const raw = [result.stdout, result.stderr].filter(Boolean).join('');
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({logs: raw, containerId, service: 'liferay', running}));
  } catch (err) {
    if (!res.headersSent) {
      writeDashboardError(res, err, {
        internalMessage: 'Could not load worktree logs',
        notFoundMessage: 'Worktree was not found',
      });
    }
  }
}

async function resolveWorktreeLogContext(cwd: string, worktreeName: string) {
  const worktreePath = await resolveWorktreePath(cwd, worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  const config = loadConfig({cwd: worktreePath});
  if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
    throw new Error('No docker environment configured');
  }

  const context = resolveEnvContext(config);
  const composeEnv = buildComposeEnv(context);
  const status = await collectEnvStatus(context, {processEnv: composeEnv});

  return {
    composeEnv,
    containerId: status.liferay?.containerId ?? null,
    running: status.liferay?.state === 'running',
  };
}

async function handleWorktreeLogStream(
  cwd: string,
  worktreeName: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const {composeEnv, containerId, running} = await resolveWorktreeLogContext(cwd, worktreeName);

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const writeEvent = (payload: Record<string, unknown>) => {
      res.write(`${JSON.stringify(payload)}\n`);
    };

    writeEvent({type: 'meta', containerId, running, service: 'liferay'});

    if (!containerId) {
      writeEvent({type: 'end', exitCode: 0});
      res.end();
      return;
    }

    const keepAlive = setInterval(() => {
      writeEvent({type: 'keepalive'});
    }, 15_000);

    const child = spawnPipedProcess(
      resolveSpawnCommand('docker', composeEnv),
      ['logs', '--tail', '200', '--timestamps', '-f', containerId],
      {
        env: normalizeProcessEnv(composeEnv),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let closed = false;
    const cleanup = () => {
      if (closed) {
        return;
      }

      closed = true;
      clearInterval(keepAlive);
    };

    const writeChunk = (stream: 'stdout' | 'stderr') => (chunk: Buffer | string) => {
      if (closed) {
        return;
      }

      writeEvent({type: 'chunk', stream, chunk: Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk});
    };

    child.stdout.on('data', writeChunk('stdout'));
    child.stderr.on('data', writeChunk('stderr'));

    child.on('error', (error) => {
      if (closed) {
        return;
      }

      writeEvent({type: 'error', message: error instanceof Error ? error.message : String(error)});
      writeEvent({type: 'end', exitCode: 1});
      cleanup();
      res.end();
    });

    child.on('close', (code, signal) => {
      if (closed) {
        return;
      }

      writeEvent({type: 'end', exitCode: code ?? 0, signal: signal ?? null});
      cleanup();
      res.end();
    });

    const stopStream = () => {
      if (closed) {
        return;
      }

      cleanup();
      child.kill();
    };

    req.on('close', stopStream);
    res.on('close', stopStream);
  } catch (err) {
    if (!res.headersSent) {
      writeDashboardError(res, err, {
        internalMessage: 'Could not open the worktree log stream',
        notFoundMessage: 'Worktree was not found',
      });
    }
  }
}

export function createDashboardServer(options: DashboardServerOptions): http.Server {
  const {cwd, port} = options;
  const clientDistDirs = options.clientDistDirs ?? DASHBOARD_CLIENT_DIST_DIRS;
  const taskManager = createDashboardTaskManager();

  const writeJson = (res: http.ServerResponse, status: number, payload: unknown) => {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(payload));
  };

  const startTaskOnce = (
    options: {kind: string; label: string; worktreeName?: string | null},
    run: Parameters<typeof taskManager.startTask>[1],
  ) => {
    const existingTask = taskManager.findRunningTask(options);
    if (existingTask) {
      return {task: existingTask, duplicate: true};
    }

    return {task: taskManager.startTask(options, run), duplicate: false};
  };

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && (url === '/' || url === '/index.html')) {
      const dashboardIndex = readDashboardIndex(clientDistDirs);
      if (!dashboardIndex) {
        res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
        res.end('Dashboard client bundle not found. Run npm run build:dashboard before starting the dashboard.');
        return;
      }

      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(dashboardIndex);
      return;
    }

    if (method === 'GET') {
      const requestUrl = new URL(url, 'http://127.0.0.1');
      const assetPath = resolveDashboardAsset(requestUrl.pathname, clientDistDirs);
      if (assetPath) {
        res.writeHead(200, {'Content-Type': getContentType(assetPath)});
        fs.createReadStream(assetPath).pipe(res);
        return;
      }
    }

    if (method === 'GET' && url === '/api/status') {
      void handleStatus(cwd, res);
      return;
    }

    if (method === 'GET' && url === '/api/tasks') {
      writeJson(res, 200, {tasks: taskManager.listTasks()});
      return;
    }

    if (method === 'GET' && url === '/api/doctor') {
      void handleDoctorPreview(cwd)
        .then((report) => {
          writeJson(res, 200, report);
        })
        .catch((err) => {
          writeDashboardError(res, err, {internalMessage: 'Could not load doctor preview'});
        });
      return;
    }

    if (method === 'GET' && url === '/api/tasks/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });

      const send = (tasks: ReturnType<typeof taskManager.listTasks>) => {
        res.write(`data: ${JSON.stringify({tasks})}\n\n`);
      };

      send(taskManager.listTasks());
      const unsubscribe = taskManager.subscribe(send);
      const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
      }, 15_000);

      req.on('close', () => {
        clearInterval(keepAlive);
        unsubscribe();
      });
      return;
    }

    const queuedOperation = matchQueuedDashboardOperation(method, url);
    if (queuedOperation) {
      const {task, duplicate} = startTaskOnce(
        {kind: queuedOperation.taskKind, label: queuedOperation.label, worktreeName: queuedOperation.worktreeName},
        async (printer) => {
          switch (queuedOperation.key) {
            case 'repo-doctor':
              await handleDoctorRun(cwd, undefined, printer);
              break;
            case 'worktree-start':
              await handleWorktreeStart(cwd, queuedOperation.worktreeName!, printer);
              break;
            case 'worktree-env-init':
              await handleWorktreeEnvInit(cwd, queuedOperation.worktreeName!, printer);
              break;
            case 'worktree-doctor':
              await handleDoctorRun(cwd, queuedOperation.worktreeName, printer);
              break;
            case 'worktree-repair':
              await handleWorktreeRepairAction(
                cwd,
                queuedOperation.worktreeName!,
                queuedOperation.repairAction!,
                printer,
              );
              break;
            case 'worktree-deploy':
              await handleWorktreeDeployAction(
                cwd,
                queuedOperation.worktreeName!,
                queuedOperation.deployAction!,
                printer,
              );
              break;
            case 'worktree-stop':
              await handleWorktreeStop(cwd, queuedOperation.worktreeName!, printer);
              break;
            case 'worktree-delete':
              await handleWorktreeDelete(cwd, queuedOperation.worktreeName!, printer);
              break;
          }
        },
      );
      writeJson(res, 202, {ok: true, taskId: task.id, ...queuedOperation.response, duplicate});
      return;
    }

    if (method === 'GET' && url.startsWith('/api/maintenance/worktrees/gc')) {
      void handleMaintenancePreview(cwd, req, res);
      return;
    }

    if (method === 'POST' && url === '/api/maintenance/worktrees/gc') {
      void handleMaintenanceApply(cwd, req, res, taskManager);
      return;
    }

    if (method === 'POST' && url === '/api/worktrees') {
      void handleWorktreeCreate(cwd, req, res, taskManager);
      return;
    }

    if (method === 'POST' && url === '/api/mcp/doctor') {
      void handleMcpDoctor(cwd, req, res, taskManager);
      return;
    }

    if (method === 'POST' && url === '/api/mcp/setup') {
      void handleMcpSetup(cwd, req, res, taskManager);
      return;
    }

    const logsMatch = /^\/api\/worktrees\/([^/]+)\/logs$/.exec(url);
    if (method === 'GET' && logsMatch) {
      void handleWorktreeLogs(cwd, decodeURIComponent(logsMatch[1]), res);
      return;
    }

    const logStreamMatch = /^\/api\/worktrees\/([^/]+)\/logs\/stream$/.exec(url);
    if (method === 'GET' && logStreamMatch) {
      void handleWorktreeLogStream(cwd, decodeURIComponent(logStreamMatch[1]), req, res);
      return;
    }

    const worktreeMcpSetupMatch = /^\/api\/worktrees\/([^/]+)\/mcp\/setup$/.exec(url);
    if (method === 'POST' && worktreeMcpSetupMatch) {
      void handleWorktreeMcpSetup(cwd, decodeURIComponent(worktreeMcpSetupMatch[1]), req, res, taskManager);
      return;
    }

    const worktreeDbMatch = /^\/api\/worktrees\/([^/]+)\/db\/(download|sync|import|query)$/.exec(url);
    if (method === 'POST' && worktreeDbMatch) {
      void handleWorktreeDbAction(
        cwd,
        decodeURIComponent(worktreeDbMatch[1]),
        worktreeDbMatch[2] as 'download' | 'sync' | 'import' | 'query',
        req,
        res,
        taskManager,
      );
      return;
    }

    const worktreeResourceExportMatch = /^\/api\/worktrees\/([^/]+)\/resource\/export$/.exec(url);
    if (method === 'POST' && worktreeResourceExportMatch) {
      const worktreeName = decodeURIComponent(worktreeResourceExportMatch[1]);
      void readJsonBody(req)
        .then((payload) => {
          const resources = normalizeDashboardResourceKinds((payload as DashboardResourceExportPayload).resources);
          if (resources.length === 0) {
            writeJson(res, 400, {error: 'Select at least one resource export'});
            return;
          }

          const {task, duplicate} = startTaskOnce(
            {kind: 'resource-export', label: `Exporting resources for ${worktreeName}`, worktreeName},
            async (printer) => {
              await handleWorktreeResourceExport(cwd, worktreeName, resources, printer);
            },
          );
          writeJson(res, 202, {
            ok: true,
            taskId: task.id,
            worktree: worktreeName,
            action: 'resource-export',
            resources,
            duplicate,
          });
        })
        .catch((err) => {
          writeDashboardError(res, err, {
            badRequestMessage: 'Invalid resource export request payload',
            internalMessage: 'Could not queue the resource export task',
          });
        });
      return;
    }

    const worktreeDoctorMatch = /^\/api\/worktrees\/([^/]+)\/doctor$/.exec(url);
    if (method === 'GET' && worktreeDoctorMatch) {
      const worktreeName = decodeURIComponent(worktreeDoctorMatch[1]);
      void handleDoctorPreview(cwd, worktreeName)
        .then((report) => {
          writeJson(res, 200, report);
        })
        .catch((err) => {
          writeDashboardError(res, err, {
            internalMessage: 'Could not load worktree doctor preview',
            notFoundMessage: 'Worktree was not found',
          });
        });
      return;
    }

    const worktreeDeployMatch = /^\/api\/worktrees\/([^/]+)\/deploy\/(status|cache-update)$/.exec(url);
    if (method === 'GET' && worktreeDeployMatch && worktreeDeployMatch[2] === 'status') {
      const worktreeName = decodeURIComponent(worktreeDeployMatch[1]);
      void handleWorktreeDeployPreview(cwd, worktreeName)
        .then((result) => {
          writeJson(res, 200, result);
        })
        .catch((err) => {
          writeDashboardError(res, err, {
            internalMessage: 'Could not load deploy status preview',
            notFoundMessage: 'Worktree was not found',
          });
        });
      return;
    }

    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Not found'}));
  });

  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    const resolvedPort = typeof address === 'object' && address ? address.port : port;
    options.onReady?.(`http://localhost:${resolvedPort}`);
  });

  return server;
}
