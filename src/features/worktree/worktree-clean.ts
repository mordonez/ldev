import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import {readEnvFile} from '../../core/config/env-file.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {
  deleteGitBranch,
  isGitRepository,
  listGitWorktrees,
  pruneGitWorktrees,
  removeGitWorktree,
} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import {buildComposeEnv, resolveManagedStorages, type RuntimeStorageKey} from '../env/env-shared.js';
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
    throw new CliError('worktree clean is destructive; re-run with --force to confirm.', {
      code: 'WORKTREE_FORCE_REQUIRED',
    });
  }

  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot || !(await isGitRepository(config.repoRoot))) {
    throw new CliError('worktree clean must be run inside a valid git repository.', {
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
  const mainComposeProject = mainEnvValues.COMPOSE_PROJECT_NAME || 'liferay';
  const composeProjectName = envValues.COMPOSE_PROJECT_NAME || `${mainComposeProject}-${target.name}`;
  const worktreeEnvContext = {
    repoRoot: context.mainRepoRoot,
    liferayDir: path.join(target.worktreeDir, 'liferay'),
    dockerDir: target.dockerDir,
    dockerComposeFile: path.join(target.dockerDir, 'docker-compose.yml'),
    dockerEnvFile: target.envFile,
    dockerEnvExampleFile: null,
    envValues,
    dataRoot: resolveWorktreeDataRoot(target.dockerDir, envValues.ENV_DATA_ROOT || `./data/envs/${target.name}`),
    bindIp: envValues.BIND_IP || '',
    httpPort: envValues.LIFERAY_HTTP_PORT || '',
    portalUrl: '',
    composeProjectName,
  };
  const managedStorages = resolveManagedStorages(worktreeEnvContext);
  const mainDoclibVolume =
    mainEnvValues.DOCLIB_VOLUME_NAME || `${mainEnvValues.COMPOSE_PROJECT_NAME || 'liferay'}-doclib`;
  const doclibCandidates = [envValues.DOCLIB_VOLUME_NAME || '', `${composeProjectName}-doclib`].filter(
    (value) => value !== '' && value !== mainDoclibVolume,
  );
  const runtimeVolumeCandidates = managedStorages
    .filter((storage) => storage.mode === 'volume')
    .flatMap((storage) => [storage.volumeName, `${composeProjectName}-${storage.key}`]);

  const doclibVolumesRemoved: string[] = [];

  const cleanTask = async () => {
    // === Docker cleanup first: containers â†’ volumes â†’ images ===
    // Must run before any filesystem operations so that Docker resources are
    // always freed even if a later git/file removal throws EBUSY.
    if (await fs.pathExists(target.dockerDir)) {
      await runDockerCompose(target.dockerDir, ['down', '--remove-orphans'], {
        env: buildComposeEnv(worktreeEnvContext, {baseEnv: options.processEnv}),
      });
    }
    await runDocker(['rm', '-f', ...((await listComposeContainers(composeProjectName, options.processEnv)) || [])], {
      env: options.processEnv,
      reject: false,
    });
    for (const volume of unique([...doclibCandidates, ...runtimeVolumeCandidates])) {
      const result = await runDocker(['volume', 'rm', volume], {env: options.processEnv, reject: false});
      if (result.ok) {
        doclibVolumesRemoved.push(volume);
      }
    }
    await removeWorktreeImages(composeProjectName, options.processEnv);

    // === Filesystem cleanup ===
    if (isRegistered) {
      // Remove the directory first (with EBUSY retries), then let git prune the
      // stale reference â€” avoids git's own rmdir attempt racing with Docker handle release.
      if (await fs.pathExists(target.worktreeDir)) {
        await removePathRobust(target.worktreeDir, {processEnv: options.processEnv}).catch(async () => {
          // Fallback: let git try its own force-remove
          await removeGitWorktree(context.mainRepoRoot, target.worktreeDir).catch(() => undefined);
        });
      }

      await pruneGitWorktrees(context.mainRepoRoot).catch(() => undefined);
      const stillRegistered = (await listGitWorktrees(context.mainRepoRoot)).includes(target.worktreeDir);
      if (stillRegistered) {
        throw new CliError(
          `Git still has the worktree registered after cleanup: ${target.worktreeDir}\nRun 'git worktree prune' and retry.`,
          {code: 'WORKTREE_CLEAN_GIT_STALE'},
        );
      }

      if (await fs.pathExists(target.worktreeDir)) {
        throw new CliError(`Could not fully remove the worktree directory: ${target.worktreeDir}`, {
          code: 'WORKTREE_CLEAN_FAILED',
        });
      }
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

  const attemptedVolumes = unique([...doclibCandidates, ...runtimeVolumeCandidates]);
  const fallbackRuntimePrefixes = runtimeStorageKeys().map((key) => `${composeProjectName}-${key}`);
  const remainingOwnedVolumes: string[] = [];
  for (const volume of unique([...attemptedVolumes, ...fallbackRuntimePrefixes])) {
    const inspect = await runDocker(['volume', 'inspect', volume], {env: options.processEnv, reject: false});
    if (inspect.ok) {
      remainingOwnedVolumes.push(volume);
    }
  }
  if (remainingOwnedVolumes.length > 0) {
    throw new CliError(`Could not remove worktree volumes: ${remainingOwnedVolumes.join(', ')}`, {
      code: 'WORKTREE_CLEAN_VOLUMES_REMAIN',
    });
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
    lines.push('Local branch deleted: yes');
  }
  if (result.dataRootsDeleted.length > 0) {
    lines.push(`Data roots eliminados: ${result.dataRootsDeleted.length}`);
  }
  if (result.dataRootsSkipped.length > 0) {
    lines.push(`Data roots kept outside the cleanup perimeter: ${result.dataRootsSkipped.length}`);
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

function runtimeStorageKeys(): RuntimeStorageKey[] {
  return ['postgres-data', 'liferay-data', 'liferay-osgi-state', 'elasticsearch-data'];
}

async function removeWorktreeImages(composeProjectName: string, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  const result = await runDocker(
    ['images', '--filter', `reference=${composeProjectName}-elasticsearch`, '--format', '{{.ID}}'],
    {env: processEnv, reject: false},
  );
  if (!result.ok) return;
  const imageIds = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (imageIds.length === 0) return;
  await runDocker(['rmi', '-f', ...imageIds], {env: processEnv, reject: false});
}

function isOwnedBtrfsWorktreeDataRoot(candidate: string, worktreeName: string, btrfsEnvsDir: string | null): boolean {
  if (!btrfsEnvsDir) {
    return false;
  }

  const expected = path.resolve(btrfsEnvsDir, worktreeName);
  return path.resolve(candidate) === expected;
}
