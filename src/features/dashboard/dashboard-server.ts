import http from 'node:http';
import path from 'node:path';

import {loadConfig} from '../../core/config/load-config.js';
import {runDockerCompose} from '../../core/platform/docker.js';
import {listGitWorktreeDetails} from '../../core/platform/git.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
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

async function handleWorktreeAction(
  cwd: string,
  worktreeName: string,
  action: 'start' | 'stop',
  res: http.ServerResponse,
): Promise<void> {
  try {
    const worktreeInfos = await listGitWorktreeDetails(cwd);
    const mainRepoRoot = path.resolve(cwd);

    const target = worktreeInfos.find((info) => {
      const isMain = path.normalize(info.path) === path.normalize(mainRepoRoot);
      const name = isMain ? path.basename(mainRepoRoot) : path.basename(info.path);
      return name === worktreeName;
    });

    if (!target) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: `Worktree '${worktreeName}' not found`}));
      return;
    }

    const config = loadConfig({cwd: target.path});
    if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'No docker environment configured for this worktree'}));
      return;
    }

    const context = resolveEnvContext(config);
    const composeEnv = buildComposeEnv(context);

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, action, worktree: worktreeName}));

    if (action === 'start') {
      runDockerCompose(context.dockerDir, ['up', '-d'], {env: composeEnv, reject: false}).catch(() => undefined);
    } else {
      runDockerCompose(context.dockerDir, ['stop'], {env: composeEnv, reject: false})
        .then(() => runDockerCompose(context.dockerDir, ['down'], {env: composeEnv, reject: false}))
        .catch(() => undefined);
    }
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

    const startMatch = /^\/api\/worktrees\/([^/]+)\/start$/.exec(url);
    if (method === 'POST' && startMatch) {
      void handleWorktreeAction(cwd, decodeURIComponent(startMatch[1]), 'start', res);
      return;
    }

    const stopMatch = /^\/api\/worktrees\/([^/]+)\/stop$/.exec(url);
    if (method === 'POST' && stopMatch) {
      void handleWorktreeAction(cwd, decodeURIComponent(stopMatch[1]), 'stop', res);
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
