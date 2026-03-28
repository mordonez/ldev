import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import {readEnvFile} from '../../core/config/env-file.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {deleteGitBranch, isGitRepository, listGitWorktrees, removeGitWorktree} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import {resolveBtrfsConfig} from './worktree-state.js';
import {resolveWorktreeContext, resolveWorktreeTarget} from './worktree-paths.js';

export type WorktreeCleanResult = {
  ok: true;
  worktreeName: string;
  worktreeDir: string;
  branchDeleted: boolean;
  dataRootsDeleted: string[];
  dataRootsSkipped: string[];
  doclibVolumesRemoved: string[];
};

export async function runWorktreeClean(options: {
  cwd: string;
  name?: string;
  force?: boolean;
  deleteBranch?: boolean;
  processEnv?: NodeJS.ProcessEnv;
  printer?: Printer;
}): Promise<WorktreeCleanResult> {
  if (!(options.force ?? false)) {
    throw new CliError('worktree clean es destructivo; vuelve a ejecutar con --force.', {
      code: 'WORKTREE_FORCE_REQUIRED',
    });
  }

  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot || !(await isGitRepository(config.repoRoot))) {
    throw new CliError('worktree clean requiere ejecutarse dentro de un repositorio git válido.', {
      code: 'WORKTREE_REPO_NOT_FOUND',
    });
  }

  const context = resolveWorktreeContext(config.repoRoot);
  const target = resolveTarget(context, options.name);
  const mainEnvFile = path.join(context.mainRepoRoot, 'docker', '.env');
  const mainEnvValues = readEnvFile(mainEnvFile);
  const mainDockerDir = path.join(context.mainRepoRoot, 'docker');
  const btrfs = await resolveBtrfsConfig(
    {
      repoRoot: context.mainRepoRoot,
      liferayDir: path.join(context.mainRepoRoot, 'liferay'),
      dockerDir: mainDockerDir,
      dockerComposeFile: path.join(mainDockerDir, 'docker-compose.yml'),
      dockerEnvFile: mainEnvFile,
      dockerEnvExampleFile: null,
      envValues: mainEnvValues,
      dataRoot: '',
      bindIp: '',
      httpPort: '',
      portalUrl: '',
      composeProjectName: mainEnvValues.COMPOSE_PROJECT_NAME || 'liferay',
    },
    mainEnvValues,
  );
  const registered = await listGitWorktrees(context.mainRepoRoot);
  const isRegistered = registered.includes(target.worktreeDir);
  const worktreeDirExists = await fs.pathExists(target.worktreeDir);
  if (
    !isRegistered &&
    !worktreeDirExists &&
    !isOwnedBtrfsWorktreeDataRoot(path.join(btrfs.envsDir ?? '', target.name), target.name, btrfs.envsDir)
  ) {
    throw new CliError(`El path no es un git worktree registrado: ${target.worktreeDir}`, {
      code: 'WORKTREE_NOT_REGISTERED',
    });
  }

  const envValues = (await fs.pathExists(target.envFile)) ? readEnvFile(target.envFile) : {};
  const composeProjectName = envValues.COMPOSE_PROJECT_NAME || `liferay-${target.name}`;
  const mainDoclibVolume =
    mainEnvValues.DOCLIB_VOLUME_NAME || `${mainEnvValues.COMPOSE_PROJECT_NAME || 'liferay'}-doclib`;
  const doclibCandidates = [envValues.DOCLIB_VOLUME_NAME || '', `${composeProjectName}-doclib`].filter(
    (value) => value !== '' && value !== mainDoclibVolume,
  );

  const cleanTask = async () => {
    if (await fs.pathExists(target.dockerDir)) {
      await runDockerCompose(target.dockerDir, ['down', '--remove-orphans'], {env: options.processEnv});
    }
    await runDocker(['rm', '-f', ...((await listComposeContainers(composeProjectName, options.processEnv)) || [])], {
      env: options.processEnv,
      reject: false,
    });
    if (isRegistered) {
      await removeGitWorktree(context.mainRepoRoot, target.worktreeDir).catch(async () => {
        await removePathRobust(target.worktreeDir, {processEnv: options.processEnv});
      });
    } else if (await fs.pathExists(target.worktreeDir)) {
      await removePathRobust(target.worktreeDir, {processEnv: options.processEnv});
    }
  };

  if (options.printer) {
    await withProgress(options.printer, `Eliminando worktree ${target.name}`, cleanTask);
  } else {
    await cleanTask();
  }

  const dataRootsDeleted: string[] = [];
  const dataRootsSkipped: string[] = [];
  const candidateDataRoots = [path.join(target.dockerDir, 'data', target.name)];
  if (envValues.ENV_DATA_ROOT) {
    candidateDataRoots.push(resolveWorktreeDataRoot(target.dockerDir, envValues.ENV_DATA_ROOT));
  }
  if (btrfs.envsDir) {
    candidateDataRoots.push(path.join(btrfs.envsDir, target.name));
  }

  for (const candidate of unique(candidateDataRoots)) {
    if (candidate === '' || !(await fs.pathExists(candidate))) {
      continue;
    }
    if (
      isPathInside(target.worktreeDir, candidate) ||
      isOwnedBtrfsWorktreeDataRoot(candidate, target.name, btrfs.envsDir)
    ) {
      await removePathRobust(candidate, {processEnv: options.processEnv});
      dataRootsDeleted.push(candidate);
    } else {
      dataRootsSkipped.push(candidate);
    }
  }

  const doclibVolumesRemoved: string[] = [];
  for (const volume of unique(doclibCandidates)) {
    const result = await runDocker(['volume', 'rm', volume], {env: options.processEnv, reject: false});
    if (result.ok) {
      doclibVolumesRemoved.push(volume);
    }
  }

  let branchDeleted = false;
  if (options.deleteBranch ?? false) {
    try {
      await deleteGitBranch(context.mainRepoRoot, target.branch);
      branchDeleted = true;
    } catch {
      branchDeleted = false;
    }
  }

  return {
    ok: true,
    worktreeName: target.name,
    worktreeDir: target.worktreeDir,
    branchDeleted,
    dataRootsDeleted,
    dataRootsSkipped,
    doclibVolumesRemoved,
  };
}

export function formatWorktreeClean(result: WorktreeCleanResult): string {
  const lines = [`Worktree eliminado: ${result.worktreeName}`];
  if (result.branchDeleted) {
    lines.push('Branch local eliminada: sí');
  }
  if (result.dataRootsDeleted.length > 0) {
    lines.push(`Data roots eliminados: ${result.dataRootsDeleted.length}`);
  }
  if (result.dataRootsSkipped.length > 0) {
    lines.push(`Data roots conservados fuera del perímetro: ${result.dataRootsSkipped.length}`);
  }
  return lines.join('\n');
}

function resolveTarget(
  context: ReturnType<typeof resolveWorktreeContext>,
  explicitName?: string,
): ReturnType<typeof resolveWorktreeTarget> {
  if (explicitName && explicitName.trim() !== '') {
    return resolveWorktreeTarget(context.mainRepoRoot, explicitName);
  }
  if (context.isWorktree && context.currentWorktreeName) {
    return resolveWorktreeTarget(context.mainRepoRoot, context.currentWorktreeName);
  }
  throw new CliError('worktree clean necesita un NAME o ejecutarse dentro del worktree objetivo.', {
    code: 'WORKTREE_NAME_REQUIRED',
  });
}

async function listComposeContainers(composeProjectName: string, processEnv?: NodeJS.ProcessEnv): Promise<string[]> {
  const result = await runDocker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${composeProjectName}`], {
    env: processEnv,
    reject: false,
  });
  if (!result.ok) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function resolveWorktreeDataRoot(dockerDir: string, configured: string): string {
  return path.isAbsolute(configured) ? configured : path.resolve(dockerDir, configured);
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isOwnedBtrfsWorktreeDataRoot(candidate: string, worktreeName: string, btrfsEnvsDir: string | null): boolean {
  if (!btrfsEnvsDir) {
    return false;
  }

  const expected = path.resolve(btrfsEnvsDir, worktreeName);
  return path.resolve(candidate) === expected;
}
