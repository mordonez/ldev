import type http from 'node:http';

import {formatMcpDoctor, runMcpDoctor} from '../mcp-server/mcp-server-doctor.js';
import {readJsonBody, writeDashboardError} from './dashboard-http.js';
import {queueDashboardTaskResponse} from './dashboard-task-commands.js';
import {writeTaskLines} from './dashboard-task-output.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';

type DashboardMcpDoctorPayload = {
  tool?: 'all' | 'claude-code' | 'cursor' | 'vscode';
  skipHandshake?: boolean;
};

export async function handleMcpDoctor(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMcpDoctorPayload;
    const tool = payload.tool ?? 'all';
    const handshake = payload.skipHandshake !== true;

    queueDashboardTaskResponse({
      taskManager,
      res,
      task: {kind: 'mcp-doctor', label: `Running MCP doctor (${tool})`},
      run: async (printer) => {
        const result = await runMcpDoctor({
          targetDir: cwd,
          tool,
          handshake,
          timeoutMs: handshake ? 10000 : 5000,
        });

        writeTaskLines(printer, formatMcpDoctor(result));

        if (!result.ok) {
          throw new Error('MCP doctor found issues');
        }
      },
      response: {action: 'mcp-doctor', tool},
    });
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid MCP doctor request payload',
      internalMessage: 'Could not queue the MCP doctor task',
    });
  }
}
