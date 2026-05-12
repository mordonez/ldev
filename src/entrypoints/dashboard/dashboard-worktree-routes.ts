import type http from 'node:http';

import {loadConfig} from '../../core/config/load-config.js';
import {formatEnvStart, runEnvStart} from '../../features/env/env-start.js';
import {runEnvStop} from '../../features/env/env-stop.js';
import {formatMcpSetup, runMcpSetup} from '../../features/mcp-server/mcp-server-setup.js';
import {formatWorktreeSetup, runWorktreeSetup} from '../../features/worktree/worktree-setup.js';
import {readJsonBody, writeDashboardError} from './dashboard-http.js';
import {queueDashboardTaskResponse} from './dashboard-task-commands.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';

type DashboardCreateWorktreePayload = {
  name?: string;
  baseRef?: string;
  startAfterCreate?: boolean;
  withEnv?: boolean;
  installMcp?: boolean;
  stopMainForClone?: boolean;
  restartMainAfterClone?: boolean;
};

export async function handleWorktreeCreate(
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
    const startAfterCreate = payload.startAfterCreate !== false;
    const withEnv = payload.withEnv !== false;
    const installMcp = payload.installMcp !== false;
    const stopMainForClone = withEnv ? payload.stopMainForClone !== false : false;
    const restartMainAfterClone = withEnv && Boolean(payload.restartMainAfterClone);

    queueDashboardTaskResponse({
      taskManager,
      res,
      task: {kind: 'worktree-create', label: `Creating worktree ${name}`, worktreeName: name},
      run: async (printer) => {
        const result = await runWorktreeSetup({
          cwd,
          name,
          baseRef,
          withEnv,
          stopMainForClone,
          restartMainAfterClone,
          stopEnv: runEnvStop,
          startEnv: (config, options) => runEnvStart(config, {...options, wait: true}),
          printer,
        });
        printer.info(formatWorktreeSetup(result));
        if (installMcp) {
          const mcpResult = await runMcpSetup({targetDir: result.worktreeDir, tool: 'all'});
          printer.info(formatMcpSetup(mcpResult));
        }
        if (restartMainAfterClone && result.mainEnvStoppedForClone && !result.mainEnvRestartedAfterClone) {
          throw new Error(result.mainRestartError ?? 'Main environment was stopped for clone but did not restart.');
        }
        if (startAfterCreate) {
          const worktreeConfig = loadConfig({cwd: result.worktreeDir, env: process.env});
          const startResult = await runEnvStart(worktreeConfig, {wait: false, printer});
          printer.info(formatEnvStart(startResult));
        }
      },
      response: {worktree: name, action: 'create'},
    });
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid worktree creation request',
      internalMessage: 'Could not create the worktree task',
    });
  }
}
