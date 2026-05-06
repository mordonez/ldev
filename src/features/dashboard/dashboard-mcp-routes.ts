import type http from 'node:http';

import type {Printer} from '../../core/output/printer.js';
import {formatMcpDoctor, runMcpDoctor} from '../mcp-server/mcp-server-doctor.js';
import {formatMcpSetup, runMcpSetup} from '../mcp-server/mcp-server-setup.js';
import {readJsonBody, writeDashboardError} from './dashboard-http.js';
import {
  queueDashboardTaskOnce,
  writeDashboardTaskAccepted,
  writeDashboardTaskBlocked,
} from './dashboard-task-commands.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';
import type {DashboardWorktreeResolver} from './dashboard-worktree-resolver.js';

type DashboardMcpDoctorPayload = {
  tool?: 'all' | 'claude-code' | 'cursor' | 'vscode';
  skipHandshake?: boolean;
};

type DashboardMcpSetupPayload = {
  tool?: 'all' | 'claude-code' | 'cursor' | 'vscode';
  strategy?: 'global' | 'local' | 'npx';
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

    const task = taskManager.startTask({kind: 'mcp-doctor', label: `Running MCP doctor (${tool})`}, async (printer) => {
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
    });

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, action: 'mcp-doctor', tool}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid MCP doctor request payload',
      internalMessage: 'Could not queue the MCP doctor task',
    });
  }
}

export async function handleMcpSetup(
  cwd: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMcpSetupPayload;
    const tool = payload.tool ?? 'all';
    const strategy = payload.strategy;

    const task = taskManager.startTask({kind: 'mcp-setup', label: `Running MCP setup (${tool})`}, async (printer) => {
      const result = await runMcpSetup({targetDir: cwd, tool, strategy});
      writeTaskLines(printer, formatMcpSetup(result));
    });

    res.writeHead(202, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, taskId: task.id, action: 'mcp-setup', tool, strategy: strategy ?? null}));
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid MCP setup request payload',
      internalMessage: 'Could not queue the MCP setup task',
    });
  }
}

export async function handleWorktreeMcpSetup(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: ReturnType<typeof createDashboardTaskManager>,
): Promise<void> {
  try {
    const payload = (await readJsonBody(req)) as DashboardMcpSetupPayload;
    const tool = payload.tool ?? 'all';
    const strategy = payload.strategy;
    const worktreePath = await resolver.resolvePath(worktreeName);

    if (!worktreePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: `Worktree '${worktreeName}' not found`}));
      return;
    }

    const queued = queueDashboardTaskOnce(
      taskManager,
      {kind: 'mcp-setup', label: `Running MCP setup for ${worktreeName}`, worktreeName},
      async (printer) => {
        const result = await runMcpSetup({targetDir: worktreePath, tool, strategy});
        writeTaskLines(printer, formatMcpSetup(result));
      },
    );

    if (queued.blocked) {
      writeDashboardTaskBlocked(res, queued, worktreeName);
      return;
    }

    writeDashboardTaskAccepted(res, queued, {action: 'mcp-setup', worktree: worktreeName, tool});
  } catch (err) {
    writeDashboardError(res, err, {
      badRequestMessage: 'Invalid worktree MCP setup request payload',
      internalMessage: 'Could not queue the worktree MCP setup task',
      notFoundMessage: 'Worktree was not found',
    });
  }
}

export async function runWorktreeMcpSetup(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer?: Printer,
): Promise<void> {
  const worktreePath = await resolver.resolvePath(worktreeName);

  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  const result = await runMcpSetup({targetDir: worktreePath, tool: 'all'});
  if (printer) {
    writeTaskLines(printer, formatMcpSetup(result));
  }
}

function writeTaskLines(printer: Printer, output: string): void {
  for (const line of output.split('\n')) {
    if (line.trim()) {
      printer.info(line);
    }
  }
}
