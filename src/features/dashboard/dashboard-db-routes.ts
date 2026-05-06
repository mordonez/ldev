import type http from 'node:http';

import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {formatDbDownload, runDbDownload} from '../db/db-download.js';
import {formatDbImport, runDbImport} from '../db/db-import.js';
import {formatDbQuery, runDbQuery} from '../db/db-query.js';
import {formatDbSync, runDbSync} from '../db/db-sync.js';
import {readJsonBody, writeDashboardError} from './dashboard-http.js';
import {
  queueDashboardTaskOnce,
  writeDashboardTaskAccepted,
  writeDashboardTaskBlocked,
} from './dashboard-task-commands.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';

export type DashboardDbAction = 'download' | 'sync' | 'import' | 'query';

export type DashboardDbRouteDeps = {
  processEnv: NodeJS.ProcessEnv;
  resolveWorktreeConfig: (worktreeName: string) => Promise<AppConfig>;
  taskManager: ReturnType<typeof createDashboardTaskManager>;
  writeTaskLines: (printer: Printer, output: string) => void;
};

type DashboardDbActionPayload = {
  backupId?: string;
  environment?: string;
  file?: string;
  force?: boolean;
  project?: string;
  query?: string;
};

export async function handleWorktreeDbAction(
  deps: DashboardDbRouteDeps,
  worktreeName: string,
  action: DashboardDbAction,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardDbActionPayload;
    const config = await deps.resolveWorktreeConfig(worktreeName);

    const queued = queueDashboardTaskOnce(
      deps.taskManager,
      {kind: `db-${action}`, label: `DB ${action} for ${worktreeName}`, worktreeName},
      async (printer, signal) => {
        await runDbAction(deps, config, action, payload, printer, signal);
      },
    );

    if (queued.blocked) {
      writeDashboardTaskBlocked(res, queued, worktreeName);
      return;
    }

    writeDashboardTaskAccepted(res, queued, {worktree: worktreeName, action: `db-${action}`});
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid database request payload',
      internalMessage: 'Could not queue the database task',
      notFoundMessage: 'Worktree was not found',
    });
  }
}

async function runDbAction(
  deps: DashboardDbRouteDeps,
  config: AppConfig,
  action: DashboardDbAction,
  payload: DashboardDbActionPayload,
  printer: Printer,
  signal: AbortSignal,
): Promise<void> {
  if (action === 'download') {
    const result = await runDbDownload(config, {
      backupId: payload.backupId,
      environment: payload.environment,
      printer,
      project: payload.project,
      signal,
    });
    deps.writeTaskLines(printer, formatDbDownload(result));
    return;
  }

  if (action === 'sync') {
    const result = await runDbSync(config, {
      backupId: payload.backupId,
      environment: payload.environment,
      force: payload.force !== false,
      printer,
      project: payload.project,
      signal,
    });
    deps.writeTaskLines(printer, formatDbSync(result));
    return;
  }

  if (action === 'import') {
    const result = await runDbImport(config, {
      file: payload.file,
      force: payload.force !== false,
      printer,
      signal,
    });
    deps.writeTaskLines(printer, formatDbImport(result));
    return;
  }

  const result = await runDbQuery(config, {
    query: payload.query,
    file: payload.file,
    processEnv: deps.processEnv,
  });
  deps.writeTaskLines(printer, formatDbQuery(result));
}
