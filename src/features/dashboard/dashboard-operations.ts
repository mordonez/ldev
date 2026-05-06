import type {Printer} from '../../core/output/printer.js';
import type {DashboardOperationKey} from './dashboard-action-catalog.js';
import type {DashboardOperation} from './dashboard-operation-dispatcher.js';

export type DashboardOperationHandlers = {
  deployAction: (
    worktreeName: string,
    action: 'status' | 'cache-update',
    printer: Printer,
    signal: AbortSignal,
  ) => Promise<void>;
  deployPreview: (worktreeName: string) => Promise<unknown>;
  doctorPreview: (worktreeName?: string) => Promise<unknown>;
  doctorRun: (worktreeName: string | undefined, printer: Printer, signal: AbortSignal) => Promise<void>;
  repairAction: (
    worktreeName: string,
    action: 'restart' | 'recreate',
    printer: Printer,
    signal: AbortSignal,
  ) => Promise<void>;
  worktreeDelete: (worktreeName: string, printer: Printer, signal: AbortSignal) => Promise<void>;
  worktreeEnvInit: (worktreeName: string, printer: Printer, signal: AbortSignal) => Promise<void>;
  worktreeMcpSetup: (worktreeName: string, printer: Printer, signal: AbortSignal) => Promise<void>;
  worktreeStart: (worktreeName: string, printer: Printer, signal: AbortSignal) => Promise<void>;
  worktreeStop: (worktreeName: string, printer: Printer, signal: AbortSignal) => Promise<void>;
};

type QueuedOperationRunner = (
  operation: DashboardOperation,
  handlers: DashboardOperationHandlers,
  printer: Printer,
  signal: AbortSignal,
) => Promise<void>;

type PreviewOperationRunner = (operation: DashboardOperation, handlers: DashboardOperationHandlers) => Promise<unknown>;

const QUEUED_OPERATION_RUNNERS: Partial<Record<DashboardOperationKey, QueuedOperationRunner>> = {
  'repo-doctor': (_operation, handlers, printer, signal) => handlers.doctorRun(undefined, printer, signal),
  'worktree-delete': (operation, handlers, printer, signal) =>
    handlers.worktreeDelete(operation.worktreeName!, printer, signal),
  'worktree-deploy': (operation, handlers, printer, signal) =>
    handlers.deployAction(operation.worktreeName!, operation.deployAction!, printer, signal),
  'worktree-doctor': (operation, handlers, printer, signal) =>
    handlers.doctorRun(operation.worktreeName, printer, signal),
  'worktree-env-init': (operation, handlers, printer, signal) =>
    handlers.worktreeEnvInit(operation.worktreeName!, printer, signal),
  'worktree-mcp-setup': (operation, handlers, printer, signal) =>
    handlers.worktreeMcpSetup(operation.worktreeName!, printer, signal),
  'worktree-repair': (operation, handlers, printer, signal) =>
    handlers.repairAction(operation.worktreeName!, operation.repairAction!, printer, signal),
  'worktree-start': (operation, handlers, printer, signal) =>
    handlers.worktreeStart(operation.worktreeName!, printer, signal),
  'worktree-stop': (operation, handlers, printer, signal) =>
    handlers.worktreeStop(operation.worktreeName!, printer, signal),
};

const PREVIEW_OPERATION_RUNNERS: Partial<Record<DashboardOperationKey, PreviewOperationRunner>> = {
  'repo-doctor': (_operation, handlers) => handlers.doctorPreview(),
  'worktree-deploy': (operation, handlers) => handlers.deployPreview(operation.worktreeName!),
  'worktree-doctor': (operation, handlers) => handlers.doctorPreview(operation.worktreeName),
};

export async function runDashboardQueuedOperation(
  operation: DashboardOperation,
  handlers: DashboardOperationHandlers,
  printer: Printer,
  signal: AbortSignal,
): Promise<void> {
  const runner = QUEUED_OPERATION_RUNNERS[operation.key];
  if (!runner) {
    throw new Error(`Dashboard operation '${operation.action}' does not support queueing`);
  }

  await runner(operation, handlers, printer, signal);
}

export async function runDashboardPreviewOperation(
  operation: DashboardOperation,
  handlers: DashboardOperationHandlers,
): Promise<unknown> {
  const runner = PREVIEW_OPERATION_RUNNERS[operation.key];
  if (!runner) {
    throw new Error(`Dashboard operation '${operation.action}' does not support preview`);
  }

  return runner(operation, handlers);
}
