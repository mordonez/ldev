import type http from 'node:http';

import type {Printer} from '../../core/output/printer.js';
import {formatWorktreeGc, runWorktreeGc} from '../../features/worktree/worktree-gc.js';
import {readJsonBody, writeDashboardError} from './dashboard-http.js';
import {queueDashboardTaskResponse} from './dashboard-task-commands.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';

type DashboardMaintenancePayload = {
  days?: number;
  apply?: boolean;
};

export async function handleMaintenancePreview(
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
          protected: [],
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

export async function handleMaintenanceApply(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
  writeTaskLines: (printer: Printer, output: string) => void,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMaintenancePayload;
    const days = Number.parseInt(String(payload.days ?? 7), 10) || 7;
    queueDashboardTaskResponse({
      taskManager,
      res,
      task: {kind: 'worktree-gc', label: `Applying worktree maintenance (${days}d)`},
      run: async (printer) => {
        const result = await runWorktreeGc({cwd, days, apply: true, processEnv: process.env, printer});
        writeTaskLines(printer, formatWorktreeGc(result));
      },
      response: {action: 'worktree-gc'},
    });
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid maintenance request payload',
      internalMessage: 'Could not apply worktree maintenance',
    });
  }
}
