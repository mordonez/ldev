import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import type {Printer} from '../../core/output/printer.js';
import {runEnvStart} from '../env/env-start.js';
import {runEnvStop} from '../env/env-stop.js';
import {formatDeployCacheUpdate, runDeployCacheUpdate} from '../deploy/deploy-cache-update.js';
import {formatDeployStatus, runDeployStatus} from '../deploy/deploy-status.js';
import {runEnvRecreate, formatEnvRecreate} from '../env/env-recreate.js';
import {runEnvRestart, formatEnvRestart} from '../env/env-restart.js';
import {runWorktreeClean} from '../worktree/worktree-clean.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';
import {formatDoctor, runDoctor} from '../doctor/doctor.service.js';
import {collectDashboardStatus} from './dashboard-data.js';
import {handleWorktreeDbAction, type DashboardDbAction} from './dashboard-db-routes.js';
import {handleWorktreeLogs, handleWorktreeLogStream} from './dashboard-log-routes.js';
import {handleMaintenanceApply, handleMaintenancePreview} from './dashboard-maintenance-routes.js';
import {handleMcpDoctor, handleMcpSetup, handleWorktreeMcpSetup, runWorktreeMcpSetup} from './dashboard-mcp-routes.js';
import {
  normalizeDashboardResourceKinds,
  runDashboardResourceExport,
  type DashboardResourceExportKind,
} from './dashboard-resource-export.js';
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
import {
  queueDashboardTaskOnce,
  writeDashboardTaskAccepted,
  writeDashboardTaskBlocked,
} from './dashboard-task-commands.js';
import {handleTaskCancel, handleTaskList, handleTaskStream} from './dashboard-task-routes.js';
import {createDashboardTaskManager} from './dashboard-tasks.js';
import {createDashboardWorktreeResolver, type DashboardWorktreeResolver} from './dashboard-worktree-resolver.js';
import {handleWorktreeCreate} from './dashboard-worktree-routes.js';

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

type DashboardResourceExportPayload = {
  resources?: string[];
};

async function handleStatus(cwd: string, res: http.ServerResponse): Promise<void> {
  try {
    const data = await collectDashboardStatus(cwd, {includeGit: true, includeRuntimeDetails: true});
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
  } catch (err) {
    writeDashboardError(res, err, {internalMessage: 'Could not load dashboard status'});
  }
}

async function handleWorktreeStart(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer: Printer | undefined,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  await runEnvStart(config, {wait: false, printer, signal});
}

async function handleWorktreeStop(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer: Printer | undefined,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  await runEnvStop(config, {processEnv: process.env, printer, signal});
}

async function handleWorktreeDelete(
  cwd: string,
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer?: Printer,
): Promise<void> {
  const mainRepoRoot = path.resolve(cwd);
  const worktreePath = await resolver.resolvePath(worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  if (path.normalize(worktreePath) === path.normalize(mainRepoRoot)) {
    throw new Error('Cannot delete the main worktree');
  }

  await runWorktreeClean({cwd, name: worktreeName, force: true, printer});
}

async function handleWorktreeEnvInit(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer?: Printer,
): Promise<void> {
  const worktreePath = await resolver.resolvePath(worktreeName);
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

async function handleDoctorRun(
  resolver: DashboardWorktreeResolver,
  worktreeName: string | undefined,
  printer: Printer,
): Promise<void> {
  const scoped = await resolver.resolveScopedConfig(worktreeName);
  const report = await runDoctor(scoped.cwd, {
    config: scoped.config,
    env: process.env,
    scopes: ['basic', 'runtime', 'portal'],
  });
  writeTaskLines(printer, formatDoctor(report));
}

async function handleDoctorPreview(resolver: DashboardWorktreeResolver, worktreeName?: string) {
  const scoped = await resolver.resolveScopedConfig(worktreeName);
  return runDoctor(scoped.cwd, {
    config: scoped.config,
    env: process.env,
    scopes: ['basic', 'runtime', 'portal'],
  });
}

async function handleWorktreeRepairAction(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  action: 'restart' | 'recreate',
  printer: Printer,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  if (action === 'restart') {
    const result = await runEnvRestart(config, {printer, signal});
    writeTaskLines(printer, formatEnvRestart(result));
    return;
  }

  const result = await runEnvRecreate(config, {printer, signal});
  writeTaskLines(printer, formatEnvRecreate(result));
}

async function handleWorktreeDeployAction(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  action: 'status' | 'cache-update',
  printer: Printer,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  if (action === 'status') {
    const result = await runDeployStatus(config, {processEnv: process.env});
    writeTaskLines(printer, formatDeployStatus(result));
    return;
  }

  const result = await runDeployCacheUpdate(config, {printer});
  writeTaskLines(printer, formatDeployCacheUpdate(result));
}

async function handleWorktreeDeployPreview(resolver: DashboardWorktreeResolver, worktreeName: string) {
  const config = await resolver.resolveConfig(worktreeName);
  return runDeployStatus(config, {processEnv: process.env});
}

async function handleWorktreeResourceExport(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  resources: DashboardResourceExportKind[],
  printer: Printer,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  await runDashboardResourceExport(config, resources, printer, writeTaskLines);
}

export function createDashboardServer(options: DashboardServerOptions): http.Server {
  const {cwd, port} = options;
  const clientDistDirs = options.clientDistDirs ?? DASHBOARD_CLIENT_DIST_DIRS;
  const taskManager = createDashboardTaskManager();
  const worktrees = createDashboardWorktreeResolver(cwd);
  const operationHandlers: DashboardOperationHandlers = {
    deployAction: (worktreeName, action, printer) =>
      handleWorktreeDeployAction(worktrees, worktreeName, action, printer),
    deployPreview: (worktreeName) => handleWorktreeDeployPreview(worktrees, worktreeName),
    doctorPreview: (worktreeName) => handleDoctorPreview(worktrees, worktreeName),
    doctorRun: (worktreeName, printer) => handleDoctorRun(worktrees, worktreeName, printer),
    repairAction: (worktreeName, action, printer, signal) =>
      handleWorktreeRepairAction(worktrees, worktreeName, action, printer, signal),
    worktreeDelete: (worktreeName, printer) => handleWorktreeDelete(cwd, worktrees, worktreeName, printer),
    worktreeEnvInit: (worktreeName, printer) => handleWorktreeEnvInit(worktrees, worktreeName, printer),
    worktreeMcpSetup: (worktreeName, printer) => runWorktreeMcpSetup(worktrees, worktreeName, printer),
    worktreeStart: (worktreeName, printer, signal) => handleWorktreeStart(worktrees, worktreeName, printer, signal),
    worktreeStop: (worktreeName, printer, signal) => handleWorktreeStop(worktrees, worktreeName, printer, signal),
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
      handleTaskList(res, taskManager);
      return;
    }

    if (method === 'GET' && url === '/api/tasks/stream') {
      handleTaskStream(req, res, taskManager);
      return;
    }

    const cancelTaskMatch = /^\/api\/tasks\/([^/]+)\/cancel$/.exec(url);
    if (method === 'POST' && cancelTaskMatch) {
      handleTaskCancel(decodeURIComponent(cancelTaskMatch[1]), res, taskManager);
      return;
    }

    const worktreeMcpSetupMatch = /^\/api\/worktrees\/([^/]+)\/mcp\/setup$/.exec(url);
    if (method === 'POST' && worktreeMcpSetupMatch) {
      void handleWorktreeMcpSetup(worktrees, decodeURIComponent(worktreeMcpSetupMatch[1]), req, res, taskManager);
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
      const queued = queueDashboardTaskOnce(
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

      if (queued.blocked) {
        writeDashboardTaskBlocked(res, queued, dashboardOperation.worktreeName ?? 'repository');
        return;
      }

      writeDashboardTaskAccepted(res, queued, dashboardOperation.response ?? {});
      return;
    }

    if (method === 'GET' && url.startsWith('/api/maintenance/worktrees/gc')) {
      void handleMaintenancePreview(cwd, req, res);
      return;
    }

    if (method === 'POST' && url === '/api/maintenance/worktrees/gc') {
      void handleMaintenanceApply(cwd, req, res, taskManager, writeTaskLines);
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
      void handleWorktreeLogs(worktrees, decodeURIComponent(logsMatch[1]), res);
      return;
    }

    const logStreamMatch = /^\/api\/worktrees\/([^/]+)\/logs\/stream$/.exec(url);
    if (method === 'GET' && logStreamMatch) {
      void handleWorktreeLogStream(worktrees, decodeURIComponent(logStreamMatch[1]), req, res);
      return;
    }

    const worktreeDbMatch = /^\/api\/worktrees\/([^/]+)\/db\/(download|sync|import|query)$/.exec(url);
    if (method === 'POST' && worktreeDbMatch) {
      void handleWorktreeDbAction(
        {
          processEnv: process.env,
          resolveWorktreeConfig: (worktreeName) => worktrees.resolveConfig(worktreeName),
          taskManager,
          writeTaskLines,
        },
        decodeURIComponent(worktreeDbMatch[1]),
        worktreeDbMatch[2] as DashboardDbAction,
        req,
        res,
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

          const queued = queueDashboardTaskOnce(
            taskManager,
            {kind: 'resource-export', label: `Exporting resources for ${worktreeName}`, worktreeName},
            async (printer) => {
              await handleWorktreeResourceExport(worktrees, worktreeName, resources, printer);
            },
          );
          if (queued.blocked) {
            writeDashboardTaskBlocked(res, queued, worktreeName);
            return;
          }

          writeDashboardTaskAccepted(res, queued, {
            worktree: worktreeName,
            action: 'resource-export',
            resources,
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
