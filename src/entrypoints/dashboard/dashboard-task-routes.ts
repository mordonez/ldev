import type http from 'node:http';

import {writeJson} from './dashboard-http.js';
import {serializeDashboardTask} from './dashboard-task-commands.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';

type DashboardTaskManager = ReturnType<typeof createDashboardTaskManager>;

export function handleTaskList(res: http.ServerResponse, taskManager: DashboardTaskManager): void {
  writeJson(res, 200, {tasks: taskManager.listTasks()});
}

export function handleTaskStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  taskManager: DashboardTaskManager,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const send = (tasks: ReturnType<typeof taskManager.listTasks>) => {
    res.write(`data: ${JSON.stringify({tasks})}\n\n`);
  };

  send(taskManager.listTasks());
  const unsubscribe = taskManager.subscribe(send);
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}

export function handleTaskCancel(taskId: string, res: http.ServerResponse, taskManager: DashboardTaskManager): void {
  const task = taskManager.cancelTask(taskId);
  if (!task) {
    writeJson(res, 404, {error: 'Running task was not found'});
    return;
  }

  writeJson(res, 202, {ok: true, task: serializeDashboardTask(task), taskId: task.id});
}
