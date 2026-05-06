import type {Printer} from '../../core/output/printer.js';
import type {DashboardOperation} from './dashboard-operation-dispatcher.js';

export type DashboardOperationHandlers = {
  deployAction: (worktreeName: string, action: 'status' | 'cache-update', printer: Printer) => Promise<void>;
  deployPreview: (worktreeName: string) => Promise<unknown>;
  doctorPreview: (worktreeName?: string) => Promise<unknown>;
  doctorRun: (worktreeName: string | undefined, printer: Printer) => Promise<void>;
  repairAction: (worktreeName: string, action: 'restart' | 'recreate', printer: Printer) => Promise<void>;
  worktreeDelete: (worktreeName: string, printer?: Printer) => Promise<void>;
  worktreeEnvInit: (worktreeName: string, printer?: Printer) => Promise<void>;
  worktreeMcpSetup: (worktreeName: string, printer?: Printer) => Promise<void>;
  worktreeStart: (worktreeName: string, printer?: Printer) => Promise<void>;
  worktreeStop: (worktreeName: string, printer?: Printer) => Promise<void>;
};

export async function runDashboardQueuedOperation(
  operation: DashboardOperation,
  handlers: DashboardOperationHandlers,
  printer: Printer,
): Promise<void> {
  switch (operation.key) {
    case 'repo-doctor':
      await handlers.doctorRun(undefined, printer);
      return;
    case 'worktree-start':
      await handlers.worktreeStart(operation.worktreeName!, printer);
      return;
    case 'worktree-env-init':
      await handlers.worktreeEnvInit(operation.worktreeName!, printer);
      return;
    case 'worktree-doctor':
      await handlers.doctorRun(operation.worktreeName, printer);
      return;
    case 'worktree-repair':
      await handlers.repairAction(operation.worktreeName!, operation.repairAction!, printer);
      return;
    case 'worktree-deploy':
      await handlers.deployAction(operation.worktreeName!, operation.deployAction!, printer);
      return;
    case 'worktree-stop':
      await handlers.worktreeStop(operation.worktreeName!, printer);
      return;
    case 'worktree-delete':
      await handlers.worktreeDelete(operation.worktreeName!, printer);
      return;
    case 'worktree-mcp-setup':
      await handlers.worktreeMcpSetup(operation.worktreeName!, printer);
      return;
  }
}

export async function runDashboardPreviewOperation(
  operation: DashboardOperation,
  handlers: DashboardOperationHandlers,
): Promise<unknown> {
  switch (operation.key) {
    case 'repo-doctor':
      return handlers.doctorPreview();
    case 'worktree-doctor':
      return handlers.doctorPreview(operation.worktreeName);
    case 'worktree-deploy':
      return handlers.deployPreview(operation.worktreeName!);
    default:
      throw new Error(`Dashboard operation '${operation.action}' does not support preview`);
  }
}
