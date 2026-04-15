import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDocker} from '../../core/platform/docker.js';
import {resolveEnvContext, resolveRuntimeStorage, type RuntimeStorage} from '../env/env-files.js';
import {listDeployArtifacts, syncArtifactsToDirectory, escapeSingleQuotes} from './deploy-artifacts.js';
import {writePrepareCommit, readPrepareCommit, currentArtifactCommit, type DeployContext} from './deploy-gradle.js';

const CACHE_LOCK_FILE = '.ldev-cache.lock';
const CACHE_LOCK_ATTEMPTS = 50;
const CACHE_LOCK_DELAY_MS = 100;

export async function resolveDeployCacheDir(config: AppConfig): Promise<string> {
  const envContext = resolveEnvContext(config);
  return resolveRuntimeStorage(envContext, 'liferay-deploy-cache').bindPath;
}

export async function restoreArtifactsFromDeployCache(
  config: AppConfig,
  context: DeployContext,
): Promise<{cacheDir: string; copied: number; commit: string | null}> {
  const envContext = resolveEnvContext(config);
  const cacheStorage = resolveRuntimeStorage(envContext, 'liferay-deploy-cache');
  const cacheDir = cacheStorage.bindPath;
  const artifacts = await listCachedDeployArtifacts(cacheStorage);

  if (artifacts.length === 0) {
    return {
      cacheDir,
      copied: 0,
      commit: await readCachedPrepareCommit(cacheStorage),
    };
  }

  const copied = await syncCachedArtifactsToBuildDeploy(context.buildDeployDir, cacheStorage, artifacts);
  const commit = await readCachedPrepareCommit(cacheStorage);

  if (commit) {
    await writePrepareCommit(context, commit);
  }

  return {cacheDir, copied, commit};
}

export async function syncArtifactsToDeployCache(
  config: AppConfig,
  context: DeployContext,
  artifacts: string[],
  options?: {clean?: boolean},
): Promise<{cacheDir: string; copied: number; commit: string}> {
  const envContext = resolveEnvContext(config);
  const cacheStorage = resolveRuntimeStorage(envContext, 'liferay-deploy-cache');
  return withStorageLock(cacheStorage, async () => {
    const cacheDir = cacheStorage.bindPath;
    if (cacheStorage.mode === 'bind') {
      await fs.ensureDir(cacheDir);
    } else {
      await ensureStorageVolume(cacheStorage);
    }

    if (options?.clean ?? false) {
      await clearCachedDeployArtifacts(cacheStorage);
    }

    const copied =
      cacheStorage.mode === 'bind'
        ? await syncArtifactsToDirectory(cacheDir, artifacts)
        : await syncBuildArtifactsToCachedStorage(context.buildDeployDir, cacheStorage, artifacts);
    if (copied === 0) {
      throw new CliError(`No deployable artifacts were found to copy into ${cacheDir}.`, {
        code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
      });
    }

    const commit = await currentArtifactCommit(context);
    await writeCachedPrepareCommit(cacheStorage, commit);

    return {cacheDir, copied, commit};
  });
}

async function listCachedDeployArtifacts(storage: RuntimeStorage): Promise<string[]> {
  if (storage.mode === 'bind') {
    return listDeployArtifacts(storage.bindPath);
  }

  const result = await runDocker(
    ['run', '--rm', '-v', `${storage.volumeName}:/cache:ro`, 'alpine', 'sh', '-lc', 'find /cache -maxdepth 1 -type f'],
    {reject: false},
  );
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\.(jar|war|xml)$/i.test(line))
    .map((line) => path.join(storage.bindPath, path.basename(line)));
}

async function syncCachedArtifactsToBuildDeploy(
  buildDeployDir: string,
  storage: RuntimeStorage,
  artifacts: string[],
): Promise<number> {
  if (storage.mode === 'bind') {
    return syncArtifactsToDirectory(buildDeployDir, artifacts);
  }

  await fs.ensureDir(buildDeployDir);
  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      `${storage.volumeName}:/source:ro`,
      '-v',
      `${buildDeployDir}:/target`,
      'alpine',
      'sh',
      '-lc',
      'find /source -maxdepth 1 -type f \\( -name "*.jar" -o -name "*.war" -o -name "*.xml" \\) -exec cp -f {} /target/ \\;',
    ],
    {reject: false},
  );
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || 'Could not restore deploy cache artifacts.', {
      code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
    });
  }

  return artifacts.length;
}

async function syncBuildArtifactsToCachedStorage(
  buildDeployDir: string,
  storage: RuntimeStorage,
  artifacts: string[],
): Promise<number> {
  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      `${buildDeployDir}:/source:ro`,
      '-v',
      `${storage.volumeName}:/target`,
      'alpine',
      'sh',
      '-lc',
      'find /source -maxdepth 1 -type f \\( -name "*.jar" -o -name "*.war" -o -name "*.xml" \\) -exec cp -f {} /target/ \\;',
    ],
    {reject: false},
  );
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || 'Could not update deploy cache.', {
      code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
    });
  }

  return artifacts.length;
}

async function readCachedPrepareCommit(storage: RuntimeStorage): Promise<string | null> {
  if (storage.mode === 'bind') {
    return readPrepareCommit(storage.bindPath);
  }

  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      `${storage.volumeName}:/cache:ro`,
      'alpine',
      'sh',
      '-lc',
      'cat /cache/.prepare-commit 2>/dev/null || true',
    ],
    {reject: false},
  );
  if (!result.ok) {
    return null;
  }

  return result.stdout.trim() || null;
}

async function writeCachedPrepareCommit(storage: RuntimeStorage, commit: string): Promise<void> {
  if (storage.mode === 'bind') {
    await fs.writeFile(path.join(storage.bindPath, '.prepare-commit'), `${commit}\n`);
    return;
  }

  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      `${storage.volumeName}:/cache`,
      'alpine',
      'sh',
      '-lc',
      `printf '%s\\n' '${escapeSingleQuotes(commit)}' > /cache/.prepare-commit`,
    ],
    {reject: false},
  );
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || 'Could not write deploy cache commit.', {
      code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
    });
  }
}

async function clearCachedDeployArtifacts(storage: RuntimeStorage): Promise<void> {
  if (storage.mode === 'bind') {
    const existing = await listDeployArtifacts(storage.bindPath);
    for (const artifact of existing) {
      await fs.remove(artifact);
    }
    await fs.remove(path.join(storage.bindPath, '.prepare-commit')).catch(() => undefined);
    return;
  }

  const result = await runDocker(
    [
      'run',
      '--rm',
      '-v',
      `${storage.volumeName}:/cache`,
      'alpine',
      'sh',
      '-lc',
      'find /cache -mindepth 1 -maxdepth 1 -delete',
    ],
    {reject: false},
  );
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || 'Could not clear deploy cache.', {
      code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
    });
  }
}

async function ensureStorageVolume(storage: RuntimeStorage): Promise<void> {
  if (storage.mode !== 'volume') {
    return;
  }

  const result = await runDocker(['volume', 'create', storage.volumeName], {reject: false});
  if (!result.ok) {
    throw new CliError(
      result.stderr.trim() || result.stdout.trim() || `Could not create volume ${storage.volumeName}`,
      {
        code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
      },
    );
  }
}

async function withStorageLock<T>(storage: RuntimeStorage, run: () => Promise<T>): Promise<T> {
  if (storage.mode !== 'bind') {
    return run();
  }

  await fs.ensureDir(storage.bindPath);
  const lockPath = path.join(storage.bindPath, CACHE_LOCK_FILE);

  for (let attempt = 0; attempt < CACHE_LOCK_ATTEMPTS; attempt += 1) {
    try {
      const fd = await fs.open(lockPath, 'wx');

      try {
        return await run();
      } finally {
        await fs.close(fd).catch(() => undefined);
        await fs.remove(lockPath).catch(() => undefined);
      }
    } catch {
      await delay(CACHE_LOCK_DELAY_MS);
    }
  }

  throw new CliError(`Timed out waiting for deploy cache lock at ${lockPath}.`, {
    code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
