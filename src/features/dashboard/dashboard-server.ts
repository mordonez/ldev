import http from 'node:http';
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
import {
  readJsonBody,
  serveDashboardClientAsset,
  serveDashboardClientIndex,
  writeDashboardError,
  writeJson,
} from './dashboard-http.js';
import {matchDashboardOperation} from './dashboard-operation-dispatcher.js';
import {
  runDashboardPreviewOperation,
  runDashboardQueuedOperation,
  type DashboardOperationHandlers,
} from './dashboard-operations.js';
import {createDashboardTaskManager, type DashboardTask} from './dashboard-tasks.js';

const DASHBOARD_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_CLIENT_DIST_DIRS = [
  path.resolve(DASHBOARD_SERVER_DIR, 'dashboard-client'),
  path.resolve(DASHBOARD_SERVER_DIR, '../../dashboard-client'),
];

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

function serializeDashboardTask(task: DashboardTask): DashboardTask {
  return {
    ...task,
    logs: task.logs.map((entry) => ({...entry})),
  };
}

function startDashboardTaskOnce(
  taskManager: ReturnType<typeof createDashboardTaskManager>,
  options: {kind: string; label: string; worktreeName?: string | null},
  run: Parameters<ReturnType<typeof createDashboardTaskManager>['startTask']>[1],
) {
  const existingTask = taskManager.findRunningTask(options);
  if (existingTask) {
    return {blocked: false, duplicate: true, task: existingTask};
  }

  const activeWorktreeTask = options.worktreeName ? taskManager.findActiveWorktreeTask(options.worktreeName) : null;
  if (activeWorktreeTask) {
    return {blocked: true, duplicate: false, task: activeWorktreeTask};
  }

  return {blocked: false, duplicate: false, task: taskManager.startTask(options, run)};
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

async function handleWorktreeStart(
  cwd: string,
  worktreeName: string,
  printer: Printer | undefined,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  await runEnvStart(config, {wait: false, printer, signal});
}

async function handleWorktreeStop(
  cwd: string,
  worktreeName: string,
  printer: Printer | undefined,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  await runEnvStop(config, {processEnv: process.env, printer, signal});
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
  signal: AbortSignal,
): Promise<void> {
  const config = await resolveWorktreeConfig(cwd, worktreeName);
  if (action === 'restart') {
    const result = await runEnvRestart(config, {printer, signal});
    writeTaskLines(printer, formatEnvRestart(result));
    return;
  }

  const result = await runEnvRecreate(config, {printer, signal});
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

    const {blocked, duplicate, task} = startDashboardTaskOnce(
      taskManager,
      {kind: `db-${action}`, label: `DB ${action} for ${worktreeName}`, worktreeName},
      async (printer, signal) => {
        if (action === 'download') {
          const result = await runDbDownload(config, {
            environment: payload.environment,
            printer,
            signal,
          });
          writeTaskLines(printer, formatDbDownload(result));
          return;
        }

        if (action === 'sync') {
          const result = await runDbSync(config, {
            environment: payload.environment,
            force: payload.force !== false,
            printer,
            signal,
          });
          writeTaskLines(printer, formatDbSync(result));
          return;
        }

        if (action === 'import') {
          const result = await runDbImport(config, {
            file: payload.file,
            force: payload.force !== false,
            printer,
            signal,
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

    if (blocked) {
      writeJson(res, 409, {
        error: `Task already running for ${worktreeName}: ${task.label}`,
        task: serializeDashboardTask(task),
        taskId: task.id,
      });
      return;
    }

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(
      JSON.stringify({
        ok: true,
        task: serializeDashboardTask(task),
        taskId: task.id,
        worktree: worktreeName,
        action: `db-${action}`,
        duplicate,
      }),
    );
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

    const {blocked, duplicate, task} = startDashboardTaskOnce(
      taskManager,
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

    if (blocked) {
      writeJson(res, 409, {
        error: `Task already running for ${worktreeName}: ${task.label}`,
        task: serializeDashboardTask(task),
        taskId: task.id,
      });
      return;
    }

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(
      JSON.stringify({
        ok: true,
        task: serializeDashboardTask(task),
        taskId: task.id,
        action: 'mcp-setup',
        worktree: worktreeName,
        tool,
        duplicate,
      }),
    );
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid worktree MCP setup request payload',
      internalMessage: 'Could not queue the worktree MCP setup task',
      notFoundMessage: 'Worktree was not found',
    });
  }
}

async function handleWorktreeMcpSetupRun(cwd: string, worktreeName: string, printer?: Printer): Promise<void> {
  const worktreePath = await resolveWorktreePath(cwd, worktreeName);

  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  const result = await runMcpSetup({targetDir: worktreePath, tool: 'all'});
  if (printer) {
    writeTaskLines(printer, formatMcpSetup(result));
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
  const operationHandlers: DashboardOperationHandlers = {
    deployAction: (worktreeName, action, printer) => handleWorktreeDeployAction(cwd, worktreeName, action, printer),
    deployPreview: (worktreeName) => handleWorktreeDeployPreview(cwd, worktreeName),
    doctorPreview: (worktreeName) => handleDoctorPreview(cwd, worktreeName),
    doctorRun: (worktreeName, printer) => handleDoctorRun(cwd, worktreeName, printer),
    repairAction: (worktreeName, action, printer, signal) =>
      handleWorktreeRepairAction(cwd, worktreeName, action, printer, signal),
    worktreeDelete: (worktreeName, printer) => handleWorktreeDelete(cwd, worktreeName, printer),
    worktreeEnvInit: (worktreeName, printer) => handleWorktreeEnvInit(cwd, worktreeName, printer),
    worktreeMcpSetup: (worktreeName, printer) => handleWorktreeMcpSetupRun(cwd, worktreeName, printer),
    worktreeStart: (worktreeName, printer, signal) => handleWorktreeStart(cwd, worktreeName, printer, signal),
    worktreeStop: (worktreeName, printer, signal) => handleWorktreeStop(cwd, worktreeName, printer, signal),
  };

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && (url === '/' || url === '/index.html')) {
      serveDashboardClientIndex(res, clientDistDirs);
      return;
    }

    if (method === 'GET') {
      const requestUrl = new URL(url, 'http://127.0.0.1');
      if (serveDashboardClientAsset(res, requestUrl.pathname, clientDistDirs)) {
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

    const cancelTaskMatch = /^\/api\/tasks\/([^/]+)\/cancel$/.exec(url);
    if (method === 'POST' && cancelTaskMatch) {
      const task = taskManager.cancelTask(decodeURIComponent(cancelTaskMatch[1]));
      if (!task) {
        writeJson(res, 404, {error: 'Running task was not found'});
        return;
      }

      writeJson(res, 202, {ok: true, task: serializeDashboardTask(task), taskId: task.id});
      return;
    }

    const worktreeMcpSetupMatch = /^\/api\/worktrees\/([^/]+)\/mcp\/setup$/.exec(url);
    if (method === 'POST' && worktreeMcpSetupMatch) {
      void handleWorktreeMcpSetup(cwd, decodeURIComponent(worktreeMcpSetupMatch[1]), req, res, taskManager);
      return;
    }

    const dashboardOperation = matchDashboardOperation(method, url);
    if (dashboardOperation?.mode === 'preview') {
      void runDashboardPreviewOperation(dashboardOperation, operationHandlers)
        .then((result) => {
          writeJson(res, 200, result);
        })
        .catch((err) => {
          writeDashboardError(res, err, {
            internalMessage:
              dashboardOperation.key === 'worktree-deploy'
                ? 'Could not load deploy status preview'
                : dashboardOperation.key === 'worktree-doctor'
                  ? 'Could not load worktree doctor preview'
                  : 'Could not load doctor preview',
            notFoundMessage: 'Worktree was not found',
          });
        });
      return;
    }

    if (dashboardOperation?.mode === 'queue') {
      const {blocked, task, duplicate} = startDashboardTaskOnce(
        taskManager,
        {
          kind: dashboardOperation.taskKind!,
          label: dashboardOperation.label!,
          worktreeName: dashboardOperation.worktreeName,
        },
        async (printer, signal) => {
          printer.info(`Executing ${dashboardOperation.action}`);
          await runDashboardQueuedOperation(dashboardOperation, operationHandlers, printer, signal);
        },
      );

      if (blocked) {
        writeJson(res, 409, {
          error: `Task already running for ${dashboardOperation.worktreeName}: ${task.label}`,
          task: serializeDashboardTask(task),
          taskId: task.id,
        });
        return;
      }

      writeJson(res, 202, {
        ok: true,
        task: serializeDashboardTask(task),
        taskId: task.id,
        ...dashboardOperation.response,
        duplicate,
      });
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

          const {blocked, task, duplicate} = startDashboardTaskOnce(
            taskManager,
            {kind: 'resource-export', label: `Exporting resources for ${worktreeName}`, worktreeName},
            async (printer) => {
              await handleWorktreeResourceExport(cwd, worktreeName, resources, printer);
            },
          );
          if (blocked) {
            writeJson(res, 409, {
              error: `Task already running for ${worktreeName}: ${task.label}`,
              task: serializeDashboardTask(task),
              taskId: task.id,
            });
            return;
          }

          writeJson(res, 202, {
            ok: true,
            task: serializeDashboardTask(task),
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
