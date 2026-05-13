import type http from 'node:http';

import type {Printer} from '../../core/output/printer.js';
import {readJsonBody, writeDashboardError, writeJson} from './dashboard-http.js';
import {
  normalizeDashboardResourceKinds,
  runDashboardResourceExport,
  type DashboardResourceExportKind,
} from './dashboard-resource-export.js';
import {queueDashboardTaskResponse} from './dashboard-task-commands.js';
import {writeTaskLines} from './dashboard-task-output.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';
import type {DashboardWorktreeResolver} from './dashboard-worktree-resolver.js';

type DashboardResourceExportPayload = {
  resources?: string[];
};

export async function handleWorktreeResourceExport(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardResourceExportPayload;
    const resources = normalizeDashboardResourceKinds(payload.resources);
    if (resources.length === 0) {
      writeJson(res, 400, {error: 'Select at least one resource export'});
      return;
    }

    queueDashboardTaskResponse({
      taskManager,
      res,
      task: {kind: 'resource-export', label: `Exporting resources for ${worktreeName}`, worktreeName},
      run: async (printer) => {
        await runWorktreeResourceExport(resolver, worktreeName, resources, printer);
      },
      response: {
        worktree: worktreeName,
        action: 'resource-export',
        resources,
      },
    });
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid resource export request payload',
      internalMessage: 'Could not queue the resource export task',
    });
  }
}

async function runWorktreeResourceExport(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  resources: DashboardResourceExportKind[],
  printer: Printer,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  await runDashboardResourceExport(config, resources, printer, writeTaskLines);
}
