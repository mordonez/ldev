import http from 'node:http';
import path from 'node:path';

import {loadConfig} from '../../core/config/load-config.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import {listGitWorktreeDetails} from '../../core/platform/git.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {collectEnvStatus} from '../../core/runtime/env-health.js';
import {runEnvStart} from '../env/env-start.js';
import {runWorktreeClean} from '../worktree/worktree-clean.js';
import {collectDashboardStatus} from './dashboard-data.js';
import {dashboardHtml} from './dashboard-html.js';

export type DashboardServerOptions = {
  cwd: string;
  port: number;
  onReady?: (url: string) => void;
};

async function handleStatus(cwd: string, res: http.ServerResponse): Promise<void> {
  try {
    const data = await collectDashboardStatus(cwd);
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: String(err)}));
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

async function handleWorktreeStart(cwd: string, worktreeName: string, res: http.ServerResponse): Promise<void> {
  try {
    const worktreePath = await resolveWorktreePath(cwd, worktreeName);
    if (!worktreePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: `Worktree '${worktreeName}' not found`}));
      return;
    }

    const config = loadConfig({cwd: worktreePath});
    if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'No docker environment configured for this worktree'}));
      return;
    }

    // Respond immediately — runEnvStart runs setup + docker up in the background
    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, action: 'start', worktree: worktreeName}));

    // wait: false skips health polling but still runs runWorktreeEnv() + deploy cache restore
    runEnvStart(config, {wait: false}).catch(() => undefined);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: String(err)}));
    }
  }
}

async function handleWorktreeStop(cwd: string, worktreeName: string, res: http.ServerResponse): Promise<void> {
  try {
    const worktreePath = await resolveWorktreePath(cwd, worktreeName);
    if (!worktreePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: `Worktree '${worktreeName}' not found`}));
      return;
    }

    const config = loadConfig({cwd: worktreePath});
    if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'No docker environment configured for this worktree'}));
      return;
    }

    const context = resolveEnvContext(config);
    const composeEnv = buildComposeEnv(context);

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, action: 'stop', worktree: worktreeName}));

    runDockerCompose(context.dockerDir, ['stop'], {env: composeEnv, reject: false})
      .then(() => runDockerCompose(context.dockerDir, ['down'], {env: composeEnv, reject: false}))
      .catch(() => undefined);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: String(err)}));
    }
  }
}

async function handleWorktreeDelete(cwd: string, worktreeName: string, res: http.ServerResponse): Promise<void> {
  try {
    const mainRepoRoot = path.resolve(cwd);
    const worktreePath = await resolveWorktreePath(cwd, worktreeName);
    if (!worktreePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: `Worktree '${worktreeName}' not found`}));
      return;
    }

    if (path.normalize(worktreePath) === path.normalize(mainRepoRoot)) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Cannot delete the main worktree'}));
      return;
    }

    await runWorktreeClean({cwd, name: worktreeName, force: true});
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, deleted: worktreeName}));
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: String(err)}));
    }
  }
}

async function handleWorktreeLogs(cwd: string, worktreeName: string, res: http.ServerResponse): Promise<void> {
  try {
    const worktreePath = await resolveWorktreePath(cwd, worktreeName);
    if (!worktreePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: `Worktree '${worktreeName}' not found`}));
      return;
    }

    const config = loadConfig({cwd: worktreePath});
    if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'No docker environment configured'}));
      return;
    }

    const context = resolveEnvContext(config);
    const composeEnv = buildComposeEnv(context);
    const status = await collectEnvStatus(context, {processEnv: composeEnv});
    const containerId = status.liferay?.containerId ?? null;

    if (!containerId) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({logs: '', containerId: null, service: 'liferay', running: false}));
      return;
    }

    const result = await runDocker(['logs', '--tail', '200', '--timestamps', containerId], {
      env: composeEnv,
      reject: false,
    });

    const raw = result.stderr || result.stdout;
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({logs: raw, containerId, service: 'liferay', running: status.liferay?.state === 'running'}));
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: String(err)}));
    }
  }
}

export function createDashboardServer(options: DashboardServerOptions): http.Server {
  const {cwd, port} = options;

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && (url === '/' || url === '/index.html')) {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(dashboardHtml);
      return;
    }

    if (method === 'GET' && url === '/api/status') {
      void handleStatus(cwd, res);
      return;
    }

    const logsMatch = /^\/api\/worktrees\/([^/]+)\/logs$/.exec(url);
    if (method === 'GET' && logsMatch) {
      void handleWorktreeLogs(cwd, decodeURIComponent(logsMatch[1]), res);
      return;
    }

    const startMatch = /^\/api\/worktrees\/([^/]+)\/start$/.exec(url);
    if (method === 'POST' && startMatch) {
      void handleWorktreeStart(cwd, decodeURIComponent(startMatch[1]), res);
      return;
    }

    const stopMatch = /^\/api\/worktrees\/([^/]+)\/stop$/.exec(url);
    if (method === 'POST' && stopMatch) {
      void handleWorktreeStop(cwd, decodeURIComponent(stopMatch[1]), res);
      return;
    }

    const deleteMatch = /^\/api\/worktrees\/([^/]+)$/.exec(url);
    if (method === 'DELETE' && deleteMatch) {
      void handleWorktreeDelete(cwd, decodeURIComponent(deleteMatch[1]), res);
      return;
    }

    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Not found'}));
  });

  server.listen(port, '127.0.0.1', () => {
    options.onReady?.(`http://localhost:${port}`);
  });

  return server;
}
