import path from 'node:path';

import type {Printer} from '../../core/output/printer.js';
import {formatDeployCacheUpdate, runDeployCacheUpdate} from '../deploy/deploy-cache-update.js';
import {formatDeployStatus, runDeployStatus} from '../deploy/deploy-status.js';
import {formatDoctor, runDoctor} from '../doctor/doctor.service.js';
import {runEnvRecreate, formatEnvRecreate} from '../env/env-recreate.js';
import {runEnvRestart, formatEnvRestart} from '../env/env-restart.js';
import {runEnvStart} from '../env/env-start.js';
import {runEnvStop} from '../env/env-stop.js';
import {formatOAuthInstall, runOAuthInstall} from '../oauth/oauth-install.js';
import {runWorktreeClean} from '../worktree/worktree-clean.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';
import {
  DASHBOARD_WORKTREE_ACTIONS,
  worktreeActionPattern,
  type DashboardOperationKey,
} from './dashboard-action-catalog.js';
import {writeDashboardError, writeJson} from './dashboard-http.js';
import {matchDashboardOperation, type DashboardOperation} from './dashboard-operation-dispatcher.js';
import type {DashboardRoute, DashboardRouteContext} from './dashboard-router.js';
import {queueDashboardTaskResponse} from './dashboard-task-commands.js';
import {writeTaskLines} from './dashboard-task-output.js';
import type {createDashboardTaskManager} from './dashboard-tasks.js';
import type {DashboardWorktreeResolver} from './dashboard-worktree-resolver.js';

type DashboardTaskManager = ReturnType<typeof createDashboardTaskManager>;

export type DashboardOperationRouteDeps = {
  cwd: string;
  taskManager: DashboardTaskManager;
  worktrees: DashboardWorktreeResolver;
};

type QueuedOperationRunner = (
  operation: DashboardOperation,
  deps: DashboardOperationRouteDeps,
  printer: Printer,
  signal: AbortSignal,
) => Promise<void>;

type PreviewOperationRunner = (operation: DashboardOperation, deps: DashboardOperationRouteDeps) => Promise<unknown>;

const QUEUED_OPERATION_RUNNERS: Partial<Record<DashboardOperationKey, QueuedOperationRunner>> = {
  'repo-doctor': (_operation, deps, printer) => runDoctorOperation(deps.worktrees, undefined, printer),
  'worktree-delete': (operation, deps, printer) =>
    runWorktreeDelete(
      deps.cwd,
      deps.worktrees,
      requireWorktreeName(operation),
      Boolean(operation.deleteBranch),
      printer,
    ),
  'worktree-deploy': (operation, deps, printer) =>
    runDeployOperation(deps.worktrees, requireWorktreeName(operation), operation.deployAction!, printer),
  'worktree-doctor': (operation, deps, printer) => runDoctorOperation(deps.worktrees, operation.worktreeName, printer),
  'worktree-env-init': (operation, deps, printer) =>
    runWorktreeEnvInit(deps.worktrees, requireWorktreeName(operation), printer),
  'worktree-oauth-install': (operation, deps, printer) =>
    runWorktreeOAuthInstall(deps.worktrees, requireWorktreeName(operation), printer),
  'worktree-repair': (operation, deps, printer, signal) =>
    runRepairOperation(deps.worktrees, requireWorktreeName(operation), operation.repairAction!, printer, signal),
  'worktree-start': (operation, deps, printer, signal) =>
    runWorktreeStart(deps.worktrees, requireWorktreeName(operation), printer, signal),
  'worktree-stop': (operation, deps, printer, signal) =>
    runWorktreeStop(deps.worktrees, requireWorktreeName(operation), printer, signal),
};

const PREVIEW_OPERATION_RUNNERS: Partial<Record<DashboardOperationKey, PreviewOperationRunner>> = {
  'repo-doctor': (_operation, deps) => previewDoctorOperation(deps.worktrees),
  'worktree-deploy': (operation, deps) => previewDeployOperation(deps.worktrees, requireWorktreeName(operation)),
  'worktree-doctor': (operation, deps) => previewDoctorOperation(deps.worktrees, operation.worktreeName),
};

export function createDashboardOperationRoutes(deps: DashboardOperationRouteDeps): DashboardRoute[] {
  const routes: DashboardRoute[] = [
    operationRoute('GET', '/api/doctor', deps),
    operationRoute('POST', '/api/doctor', deps),
  ];

  for (const descriptor of DASHBOARD_WORKTREE_ACTIONS) {
    routes.push(operationRoute(descriptor.method, worktreeActionPattern(descriptor.route), deps));

    if (descriptor.previewRoute) {
      routes.push(operationRoute('GET', worktreeActionPattern(descriptor.previewRoute), deps));
    }
  }

  return routes;
}

function operationRoute(
  method: DashboardRoute['method'],
  route: string | RegExp,
  deps: DashboardOperationRouteDeps,
): DashboardRoute {
  return {
    method,
    ...(typeof route === 'string' ? {path: route} : {pattern: route}),
    handle: (context) => {
      const operation = matchDashboardOperation(context.method, context.url);
      if (!operation) {
        writeJson(context.res, 404, {error: 'Not found'});
        return;
      }

      void handleDashboardOperation(context, operation, deps);
    },
  };
}

async function handleDashboardOperation(
  context: DashboardRouteContext,
  operation: DashboardOperation,
  deps: DashboardOperationRouteDeps,
): Promise<void> {
  if (operation.mode === 'preview') {
    try {
      writeJson(context.res, 200, await runDashboardPreviewOperation(operation, deps));
    } catch (err) {
      writeDashboardError(context.res, err, {
        internalMessage: previewErrorMessage(operation),
        notFoundMessage: 'Worktree was not found',
      });
    }
    return;
  }

  queueDashboardTaskResponse({
    taskManager: deps.taskManager,
    res: context.res,
    task: {
      kind: operation.taskKind!,
      label: operation.label!,
      worktreeName: operation.worktreeName,
    },
    run: async (printer, signal) => {
      printer.info(`Executing ${operation.action}`);
      await runDashboardQueuedOperation(operation, deps, printer, signal);
    },
    response: operation.response,
    scopeLabel: operation.worktreeName ?? 'repository',
  });
}

async function runDashboardQueuedOperation(
  operation: DashboardOperation,
  deps: DashboardOperationRouteDeps,
  printer: Printer,
  signal: AbortSignal,
): Promise<void> {
  const runner = QUEUED_OPERATION_RUNNERS[operation.key];
  if (!runner) {
    throw new Error(`Dashboard operation '${operation.action}' does not support queueing`);
  }

  await runner(operation, deps, printer, signal);
}

async function runDashboardPreviewOperation(
  operation: DashboardOperation,
  deps: DashboardOperationRouteDeps,
): Promise<unknown> {
  const runner = PREVIEW_OPERATION_RUNNERS[operation.key];
  if (!runner) {
    throw new Error(`Dashboard operation '${operation.action}' does not support preview`);
  }

  return runner(operation, deps);
}

async function runWorktreeStart(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer: Printer | undefined,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  await runEnvStart(config, {wait: false, printer, signal});
}

async function runWorktreeStop(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer: Printer | undefined,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  await runEnvStop(config, {processEnv: process.env, printer, signal});
}

async function runWorktreeDelete(
  cwd: string,
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  deleteBranch: boolean,
  printer?: Printer,
): Promise<void> {
  const mainRepoRoot = path.resolve(cwd);
  const worktreePath = await resolver.resolvePath(worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  if (pathMatches(worktreePath, mainRepoRoot)) {
    throw new Error('Cannot delete the main worktree');
  }

  await runWorktreeClean({cwd, name: worktreeName, force: true, deleteBranch, printer});
}

async function runWorktreeEnvInit(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer?: Printer,
): Promise<void> {
  const worktreePath = await resolver.resolvePath(worktreeName);
  if (!worktreePath) {
    throw new Error(`Worktree '${worktreeName}' not found`);
  }

  await runWorktreeEnv({cwd: worktreePath, printer});
}

async function runDoctorOperation(
  resolver: DashboardWorktreeResolver,
  worktreeName: string | undefined,
  printer: Printer,
): Promise<void> {
  const report = await previewDoctorOperation(resolver, worktreeName);
  writeTaskLines(printer, formatDoctor(report));
}

async function previewDoctorOperation(resolver: DashboardWorktreeResolver, worktreeName?: string) {
  const scoped = await resolver.resolveScopedConfig(worktreeName);
  return runDoctor(scoped.cwd, {
    config: scoped.config,
    env: process.env,
    scopes: ['basic', 'runtime', 'portal'],
  });
}

async function runRepairOperation(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  action: 'restart' | 'recreate',
  printer: Printer,
  signal: AbortSignal,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  if (action === 'restart') {
    const result = await runEnvRestart(config, {printer, signal});
    writeTaskLines(printer, formatEnvRestart(result));
    return;
  }

  const result = await runEnvRecreate(config, {printer, signal});
  writeTaskLines(printer, formatEnvRecreate(result));
}

async function runDeployOperation(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  action: 'status' | 'cache-update',
  printer: Printer,
): Promise<void> {
  if (action === 'status') {
    const result = await previewDeployOperation(resolver, worktreeName);
    writeTaskLines(printer, formatDeployStatus(result));
    return;
  }

  const config = await resolver.resolveConfig(worktreeName);
  const result = await runDeployCacheUpdate(config, {printer});
  writeTaskLines(printer, formatDeployCacheUpdate(result));
}

async function previewDeployOperation(resolver: DashboardWorktreeResolver, worktreeName: string) {
  const config = await resolver.resolveConfig(worktreeName);
  return runDeployStatus(config, {processEnv: process.env});
}

async function runWorktreeOAuthInstall(
  resolver: DashboardWorktreeResolver,
  worktreeName: string,
  printer?: Printer,
): Promise<void> {
  const config = await resolver.resolveConfig(worktreeName);
  const result = await runOAuthInstall(config, {writeEnv: true, printer});
  if (printer) {
    writeTaskLines(printer, formatOAuthInstall(result));
  }
}

function requireWorktreeName(operation: DashboardOperation): string {
  if (!operation.worktreeName) {
    throw new Error(`Dashboard operation '${operation.action}' requires a worktree`);
  }

  return operation.worktreeName;
}

function previewErrorMessage(operation: DashboardOperation): string {
  if (operation.key === 'worktree-deploy') return 'Could not load deploy status preview';
  if (operation.key === 'worktree-doctor') return 'Could not load worktree doctor preview';
  return 'Could not load doctor preview';
}

function pathMatches(left: string, right: string): boolean {
  return left.replaceAll('\\', '/').toLowerCase() === right.replaceAll('\\', '/').toLowerCase();
}
