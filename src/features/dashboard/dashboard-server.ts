import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {collectDashboardStatus} from './dashboard-data.js';
import {handleWorktreeDbAction, type DashboardDbAction} from './dashboard-db-routes.js';
import {handleWorktreeLogs, handleWorktreeLogStream} from './dashboard-log-routes.js';
import {handleMaintenanceApply, handleMaintenancePreview} from './dashboard-maintenance-routes.js';
import {handleMcpDoctor, handleMcpSetup} from './dashboard-mcp-routes.js';
import {handleWorktreeResourceExport} from './dashboard-resource-export-routes.js';
import {serveDashboardClientAsset, serveDashboardClientIndex, writeDashboardError} from './dashboard-http.js';
import {createDashboardOperationRoutes} from './dashboard-operation-routes.js';
import {dispatchDashboardRoute, type DashboardRoute} from './dashboard-router.js';
import {writeTaskLines} from './dashboard-task-output.js';
import {handleTaskCancel, handleTaskList, handleTaskStream} from './dashboard-task-routes.js';
import {createDashboardTaskManager} from './dashboard-tasks.js';
import {createDashboardWorktreeResolver} from './dashboard-worktree-resolver.js';
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

async function handleStatus(cwd: string, res: http.ServerResponse): Promise<void> {
  try {
    const data = await collectDashboardStatus(cwd, {includeGit: true, includeRuntimeDetails: true});
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
  } catch (err) {
    writeDashboardError(res, err, {internalMessage: 'Could not load dashboard status'});
  }
}

export function createDashboardServer(options: DashboardServerOptions): http.Server {
  const {cwd, port} = options;
  const clientDistDirs = options.clientDistDirs ?? DASHBOARD_CLIENT_DIST_DIRS;
  const taskManager = createDashboardTaskManager();
  const worktrees = createDashboardWorktreeResolver(cwd);

  const routes: DashboardRoute[] = [
    {
      method: 'GET',
      path: '/api/status',
      handle: ({res}) => {
        void handleStatus(cwd, res);
      },
    },
    {
      method: 'GET',
      path: '/api/tasks',
      handle: ({res}) => {
        handleTaskList(res, taskManager);
      },
    },
    {
      method: 'GET',
      path: '/api/tasks/stream',
      handle: ({req, res}) => {
        handleTaskStream(req, res, taskManager);
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/tasks\/([^/]+)\/cancel$/,
      handle: ({res}, match) => {
        handleTaskCancel(decodeURIComponent(match![1]), res, taskManager);
      },
    },
    {
      method: 'GET',
      startsWith: '/api/maintenance/worktrees/gc',
      handle: ({req, res}) => void handleMaintenancePreview(cwd, req, res),
    },
    {
      method: 'POST',
      path: '/api/maintenance/worktrees/gc',
      handle: ({req, res}) => void handleMaintenanceApply(cwd, req, res, taskManager, writeTaskLines),
    },
    {
      method: 'POST',
      path: '/api/worktrees',
      handle: ({req, res}) => void handleWorktreeCreate(cwd, req, res, taskManager),
    },
    {
      method: 'POST',
      path: '/api/mcp/doctor',
      handle: ({req, res}) => void handleMcpDoctor(cwd, req, res, taskManager),
    },
    {
      method: 'POST',
      path: '/api/mcp/setup',
      handle: ({req, res}) => void handleMcpSetup(cwd, req, res, taskManager),
    },
    {
      method: 'GET',
      pattern: /^\/api\/worktrees\/([^/]+)\/logs$/,
      handle: ({res}, match) => void handleWorktreeLogs(worktrees, decodeURIComponent(match![1]), res),
    },
    {
      method: 'GET',
      pattern: /^\/api\/worktrees\/([^/]+)\/logs\/stream$/,
      handle: ({req, res}, match) => void handleWorktreeLogStream(worktrees, decodeURIComponent(match![1]), req, res),
    },
    {
      method: 'POST',
      pattern: /^\/api\/worktrees\/([^/]+)\/db\/(download|sync|import|query)$/,
      handle: ({req, res}, match) =>
        void handleWorktreeDbAction(
          {
            processEnv: process.env,
            resolveWorktreeConfig: (worktreeName) => worktrees.resolveConfig(worktreeName),
            taskManager,
            writeTaskLines,
          },
          decodeURIComponent(match![1]),
          match![2] as DashboardDbAction,
          req,
          res,
        ),
    },
    {
      method: 'POST',
      pattern: /^\/api\/worktrees\/([^/]+)\/resource\/export$/,
      handle: ({req, res}, match) =>
        void handleWorktreeResourceExport(worktrees, decodeURIComponent(match![1]), req, res, taskManager),
    },
    ...createDashboardOperationRoutes({cwd, taskManager, worktrees}),
  ];

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

    if (dispatchDashboardRoute(req, res, routes)) {
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
