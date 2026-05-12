import type http from 'node:http';

import {loadConfig} from '../../core/config/load-config.js';
import {runDocker} from '../../core/platform/docker.js';
import {normalizeProcessEnv, resolveSpawnCommand, spawnPipedProcess} from '../../core/platform/process.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {collectEnvStatus} from '../../core/runtime/env-health.js';
import {writeDashboardError} from './dashboard-http.js';
import type {DashboardWorktreeResolver} from './dashboard-worktree-resolver.js';

export async function handleWorktreeLogs(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const {composeEnv, containerId, running} = await resolveWorktreeLogContext(resolver, worktreeName);

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

export async function handleWorktreeLogStream(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const {composeEnv, containerId, running} = await resolveWorktreeLogContext(resolver, worktreeName);

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

async function resolveWorktreeLogContext(resolver: DashboardWorktreeResolver, worktreeName: string) {
  const worktreePath = await resolver.resolvePath(worktreeName);
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
