import {randomUUID} from 'node:crypto';

import type {Printer} from '../../core/output/printer.js';

export type DashboardTaskLevel = 'info' | 'error';
export type DashboardTaskStatus = 'running' | 'canceling' | 'succeeded' | 'failed' | 'canceled';

export type DashboardTaskLogEntry = {
  id: string;
  level: DashboardTaskLevel;
  message: string;
  timestamp: string;
};

export type DashboardTask = {
  id: string;
  kind: string;
  label: string;
  worktreeName: string | null;
  status: DashboardTaskStatus;
  startedAt: string;
  endedAt: string | null;
  logs: DashboardTaskLogEntry[];
};

type DashboardTaskSubscriber = (tasks: DashboardTask[]) => void;
type DashboardTaskRun = (printer: Printer, signal: AbortSignal) => Promise<void>;

const MAX_TASKS = 30;
const MAX_TASK_LOGS = 200;

export function createDashboardTaskManager() {
  const tasks: DashboardTask[] = [];
  const controllers = new Map<string, AbortController>();
  const subscribers = new Set<DashboardTaskSubscriber>();
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  const listTasks = (): DashboardTask[] =>
    tasks.map((task) => ({
      ...task,
      logs: task.logs.map((entry) => ({...entry})),
    }));

  const notify = () => {
    const snapshot = listTasks();
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  };

  const scheduleNotify = () => {
    if (notifyTimer) {
      return;
    }

    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      notify();
    }, 50);
  };

  const appendLog = (taskId: string, level: DashboardTaskLevel, message: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    task.logs.push({
      id: randomUUID(),
      level,
      message,
      timestamp: new Date().toISOString(),
    });

    if (task.logs.length > MAX_TASK_LOGS) {
      task.logs.splice(0, task.logs.length - MAX_TASK_LOGS);
    }

    scheduleNotify();
  };

  const createTaskPrinter = (taskId: string): Printer => ({
    format: 'text',
    write(value) {
      appendLog(taskId, 'info', serializeLogValue(value));
    },
    info(message) {
      appendLog(taskId, 'info', message);
    },
    error(message) {
      appendLog(taskId, 'error', message);
    },
  });

  return {
    listTasks,

    findRunningTask(options: {kind: string; worktreeName?: string | null}): DashboardTask | null {
      return (
        tasks.find(
          (task) =>
            isActiveTaskStatus(task.status) &&
            task.kind === options.kind &&
            task.worktreeName === (options.worktreeName ?? null),
        ) ?? null
      );
    },

    findActiveWorktreeTask(worktreeName: string): DashboardTask | null {
      return tasks.find((task) => isActiveTaskStatus(task.status) && task.worktreeName === worktreeName) ?? null;
    },

    cancelTask(taskId: string): DashboardTask | null {
      const task = tasks.find((item) => item.id === taskId);
      if (!task || !isActiveTaskStatus(task.status)) {
        return null;
      }

      if (task.status !== 'canceling') {
        task.status = 'canceling';
        appendLog(task.id, 'info', 'Cancel requested');
      }

      controllers.get(task.id)?.abort();
      notify();
      return listTasks().find((item) => item.id === task.id) ?? null;
    },

    subscribe(subscriber: DashboardTaskSubscriber): () => void {
      subscribers.add(subscriber);
      subscriber(listTasks());
      return () => {
        subscribers.delete(subscriber);
      };
    },

    startTask(options: {kind: string; label: string; worktreeName?: string | null}, run: DashboardTaskRun) {
      const controller = new AbortController();
      const task: DashboardTask = {
        id: randomUUID(),
        kind: options.kind,
        label: options.label,
        worktreeName: options.worktreeName ?? null,
        status: 'running',
        startedAt: new Date().toISOString(),
        endedAt: null,
        logs: [],
      };

      tasks.unshift(task);
      controllers.set(task.id, controller);
      if (tasks.length > MAX_TASKS) {
        tasks.splice(MAX_TASKS);
      }

      appendLog(task.id, 'info', 'Task started');

      void Promise.resolve()
        .then(async () => {
          const printer = createTaskPrinter(task.id);
          await run(printer, controller.signal);
          if (task.status === 'canceling') {
            task.status = 'canceled';
            task.endedAt = new Date().toISOString();
            appendLog(task.id, 'info', 'Task canceled');
            return;
          }

          task.status = 'succeeded';
          task.endedAt = new Date().toISOString();
          appendLog(task.id, 'info', 'Task completed');
        })
        .catch((error) => {
          if (controller.signal.aborted || task.status === 'canceling') {
            task.status = 'canceled';
            task.endedAt = new Date().toISOString();
            appendLog(task.id, 'info', 'Task canceled');
            return;
          }

          task.status = 'failed';
          task.endedAt = new Date().toISOString();
          appendLog(task.id, 'error', error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          controllers.delete(task.id);
          notify();
        });

      notify();
      return task;
    },
  };
}

function isActiveTaskStatus(status: DashboardTaskStatus): boolean {
  return status === 'running' || status === 'canceling';
}

function serializeLogValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
