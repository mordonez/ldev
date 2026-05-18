import path from 'node:path';

import fs from 'fs-extra';

import {readEnvFile} from '../../core/config/env-file.js';
import {CliError} from '../../core/errors.js';
import {areSamePath, listGitWorktreeDetails, type GitWorktreeInfo} from '../../core/platform/git.js';
import {runDocker} from '../../core/platform/docker.js';
import {prepareWorktreeFlow} from './worktree-flow.js';
import {resolvePortSet, resolveWorktreeTargetForContext} from './worktree-paths.js';

type DockerRunner = typeof runDocker;

export type WorktreeRuntimeStatus = 'running' | 'stopped' | 'unknown';

export type WorktreeInspectEntry = {
  name: string;
  path: string;
  branch: string | null;
  isMain: boolean;
  detached: boolean;
  prunable: boolean;
  envFile: string;
  envConfigured: boolean;
  composeProjectName: string | null;
  runtimeStatus: WorktreeRuntimeStatus;
  runningContainers: number;
  portalUrl: string | null;
  ports: {
    httpPort: string | null;
    debugPort: string | null;
    gogoPort: string | null;
    postgresPort: string | null;
    esHttpPort: string | null;
  };
};

export type WorktreeListResult = {
  ok: true;
  worktrees: WorktreeInspectEntry[];
};

export type WorktreeStatusResult = {
  ok: true;
  worktree: WorktreeInspectEntry;
};

export async function runWorktreeList(options: {
  cwd: string;
  processEnv?: NodeJS.ProcessEnv;
  docker?: DockerRunner;
}): Promise<WorktreeListResult> {
  const {context} = await prepareWorktreeFlow({cwd: options.cwd, commandName: 'list'});
  const registered = await listGitWorktreeDetails(context.mainRepoRoot);
  const mainEnvValues = await readOptionalEnvFile(path.join(context.mainRepoRoot, 'docker', '.env'));
  const mainComposeProject = mainEnvValues.COMPOSE_PROJECT_NAME || 'liferay';

  const worktrees = await Promise.all(
    registered.map((worktree) =>
      inspectRegisteredWorktree({
        worktree,
        mainRepoRoot: context.mainRepoRoot,
        mainComposeProject,
        processEnv: options.processEnv,
        docker: options.docker ?? runDocker,
      }),
    ),
  );

  return {ok: true, worktrees};
}

export async function runWorktreeStatus(options: {
  cwd: string;
  name?: string;
  processEnv?: NodeJS.ProcessEnv;
  docker?: DockerRunner;
}): Promise<WorktreeStatusResult> {
  const {context} = await prepareWorktreeFlow({cwd: options.cwd, commandName: 'status'});
  const registered = await listGitWorktreeDetails(context.mainRepoRoot);
  const explicitName = options.name?.trim();
  const namedWorktree = explicitName
    ? registered.find((worktree) => resolveDisplayName(worktree, context.mainRepoRoot) === explicitName)
    : undefined;
  const target =
    explicitName && !namedWorktree
      ? resolveWorktreeTargetForContext(context, explicitName, registered)
      : !explicitName && context.isWorktree
        ? resolveWorktreeTargetForContext(context, undefined, registered)
        : null;

  const selected =
    namedWorktree ??
    (target
      ? registered.find((worktree) => areSamePath(worktree.path, target.worktreeDir))
      : registered.find((worktree) => areSamePath(worktree.path, context.currentRepoRoot)));

  if (!selected) {
    const label = options.name ?? context.currentWorktreeName ?? path.basename(context.currentRepoRoot);
    throw new CliError(`Worktree '${label}' is not registered.`, {code: 'WORKTREE_NOT_REGISTERED'});
  }

  const mainEnvValues = await readOptionalEnvFile(path.join(context.mainRepoRoot, 'docker', '.env'));
  const mainComposeProject = mainEnvValues.COMPOSE_PROJECT_NAME || 'liferay';
  const worktree = await inspectRegisteredWorktree({
    worktree: selected,
    mainRepoRoot: context.mainRepoRoot,
    mainComposeProject,
    processEnv: options.processEnv,
    docker: options.docker ?? runDocker,
  });

  return {ok: true, worktree};
}

export function formatWorktreeList(result: WorktreeListResult): string {
  if (result.worktrees.length === 0) {
    return 'No registered worktrees found.';
  }

  return formatTable(
    ['Name', 'Branch', 'Runtime', 'HTTP', 'Compose project', 'Path'],
    result.worktrees.map((entry) => [
      entry.name,
      entry.branch ?? (entry.detached ? '(detached)' : '-'),
      formatRuntime(entry),
      entry.ports.httpPort ?? '-',
      entry.composeProjectName ?? '-',
      entry.path,
    ]),
  );
}

export function formatWorktreeStatus(result: WorktreeStatusResult): string {
  const entry = result.worktree;
  const lines = [
    `Worktree: ${entry.name}`,
    `Path: ${entry.path}`,
    `Branch: ${entry.branch ?? (entry.detached ? '(detached)' : '-')}`,
    `Runtime: ${formatRuntime(entry)}`,
    `Compose project: ${entry.composeProjectName ?? '-'}`,
    `Portal URL: ${entry.portalUrl ?? '-'}`,
    `Env file: ${entry.envConfigured ? entry.envFile : 'not configured'}`,
  ];

  lines.push(
    `Ports: http=${entry.ports.httpPort ?? '-'} debug=${entry.ports.debugPort ?? '-'} gogo=${
      entry.ports.gogoPort ?? '-'
    } postgres=${entry.ports.postgresPort ?? '-'} es=${entry.ports.esHttpPort ?? '-'}`,
  );

  return lines.join('\n');
}

async function inspectRegisteredWorktree(options: {
  worktree: GitWorktreeInfo;
  mainRepoRoot: string;
  mainComposeProject: string;
  processEnv?: NodeJS.ProcessEnv;
  docker: DockerRunner;
}): Promise<WorktreeInspectEntry> {
  const isMain = areSamePath(options.worktree.path, options.mainRepoRoot);
  const name = resolveDisplayName(options.worktree, options.mainRepoRoot);
  const envFile = path.join(options.worktree.path, 'docker', '.env');
  const hasEnvFile = await fs.pathExists(envFile);
  const envValues = await readOptionalEnvFile(envFile);
  const envConfigured = Object.keys(envValues).length > 0 || hasEnvFile;
  const fallbackPorts = !isMain && hasEnvFile ? resolvePortSet(name) : null;
  const httpPort = envValues.LIFERAY_HTTP_PORT ?? fallbackPorts?.httpPort ?? null;
  const bindIp = envValues.BIND_IP || '127.0.0.1';
  const composeProjectName = envValues.COMPOSE_PROJECT_NAME ?? (isMain ? options.mainComposeProject : null);
  const runningContainers = composeProjectName
    ? await countRunningComposeContainers(composeProjectName, options.docker, options.processEnv)
    : null;

  return {
    name,
    path: options.worktree.path,
    branch: options.worktree.branch,
    isMain,
    detached: options.worktree.detached,
    prunable: options.worktree.prunable,
    envFile,
    envConfigured,
    composeProjectName,
    runtimeStatus: runningContainers === null ? 'unknown' : runningContainers > 0 ? 'running' : 'stopped',
    runningContainers: runningContainers ?? 0,
    portalUrl: httpPort ? `http://${bindIp}:${httpPort}` : null,
    ports: {
      httpPort,
      debugPort: envValues.LIFERAY_DEBUG_PORT ?? fallbackPorts?.debugPort ?? null,
      gogoPort: envValues.GOGO_PORT ?? fallbackPorts?.gogoPort ?? null,
      postgresPort: envValues.POSTGRES_PORT ?? fallbackPorts?.postgresPort ?? null,
      esHttpPort: envValues.ES_HTTP_PORT ?? fallbackPorts?.esHttpPort ?? null,
    },
  };
}

function resolveDisplayName(worktree: GitWorktreeInfo, mainRepoRoot: string): string {
  return areSamePath(worktree.path, mainRepoRoot) ? path.basename(mainRepoRoot) : path.basename(worktree.path);
}

async function readOptionalEnvFile(filePath: string): Promise<Partial<Record<string, string>>> {
  if (!(await fs.pathExists(filePath))) {
    return {};
  }

  return readEnvFile(filePath);
}

async function countRunningComposeContainers(
  composeProjectName: string,
  docker: DockerRunner,
  processEnv?: NodeJS.ProcessEnv,
): Promise<number | null> {
  const result = await docker(['ps', '-q', '--filter', `label=com.docker.compose.project=${composeProjectName}`], {
    env: processEnv,
    reject: false,
  });

  if (!result.ok) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function formatRuntime(entry: WorktreeInspectEntry): string {
  if (entry.runtimeStatus === 'running') {
    return `running (${entry.runningContainers})`;
  }

  if (entry.runtimeStatus === 'unknown') {
    return 'unknown';
  }

  return 'stopped';
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const formatRow = (row: string[]) =>
    row
      .map((cell, index) => cell.padEnd(widths[index]))
      .join('  ')
      .trimEnd();

  return [formatRow(headers), formatRow(widths.map((width) => '-'.repeat(width))), ...rows.map(formatRow)].join('\n');
}
