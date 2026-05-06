import type http from 'node:http';

import {runEnvStart} from '../env/env-start.js';
import {runEnvStop} from '../env/env-stop.js';
import {runWorktreeSetup} from '../worktree/worktree-setup.js';
import {readJsonBody, writeDashboardError} from './dashboard-http.js';
import {queueDashboardTaskResponse} from './dashboard-task-commands.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';

type DashboardCreateWorktreePayload = {
  name?: string;
  baseRef?: string;
  withEnv?: boolean;
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
    const withEnv = payload.withEnv !== false;
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
          startEnv: runEnvStart,
          printer,
        });
        printer.info(`Worktree ready: ${result.worktreeDir}`);
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
