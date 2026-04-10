import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {runDocker} from '../../core/platform/docker.js';
import {runProcess} from '../../core/platform/process.js';
import {resolveEnvContext, resolveRuntimeStorage, type RuntimeStorage} from '../env/env-files.js';

export type DeployContext = {
  repoRoot: string;
  liferayDir: string;
  dockerDir: string;
  gradlewPath: string;
  buildDir: string;
  buildDeployDir: string;
};

export function resolveDeployContext(config: AppConfig): DeployContext {
  if (!config.repoRoot || !config.liferayDir || !config.dockerDir) {
    throw new CliError('deploy must be run inside a valid project with docker/ and liferay/.', {
      code: 'DEPLOY_REPO_NOT_FOUND',
    });
  }

  const gradlewBatPath = path.join(config.liferayDir, 'gradlew.bat');
  const gradlewShellPath = path.join(config.liferayDir, 'gradlew');

  return {
    repoRoot: config.repoRoot,
    liferayDir: config.liferayDir,
    dockerDir: config.dockerDir,
    gradlewPath: process.platform === 'win32' && fs.existsSync(gradlewBatPath) ? gradlewBatPath : gradlewShellPath,
    buildDir: path.join(config.liferayDir, 'build', 'docker'),
    buildDeployDir: path.join(config.liferayDir, 'build', 'docker', 'deploy'),
  };
}

export async function ensureGradleWrapper(context: DeployContext): Promise<void> {
  if (!(await fs.pathExists(context.gradlewPath))) {
    throw new CliError(`gradlew was not found in ${context.liferayDir}.`, {
      code: 'DEPLOY_GRADLEW_NOT_FOUND',
    });
  }
}

export async function runDeployStep<T>(printer: Printer | undefined, label: string, run: () => Promise<T>): Promise<T> {
  if (!printer) {
    return run();
  }

  return withProgress(printer, label, run);
}

export async function runGradleTask(context: DeployContext, args: string[]): Promise<void> {
  const result = await runProcess(context.gradlewPath, ['--console=plain', ...args], {cwd: context.liferayDir});
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `${context.gradlewPath} ${args.join(' ')}`, {
      code: 'DEPLOY_GRADLE_ERROR',
    });
  }
}

export async function resolveHeadCommit(repoRoot: string): Promise<string> {
  const result = await runProcess('git', ['rev-parse', 'HEAD'], {cwd: repoRoot});
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || 'git rev-parse HEAD', {
      code: 'GIT_ERROR',
    });
  }

  return result.stdout.trim();
}

export async function writePrepareCommit(context: DeployContext, commit: string): Promise<void> {
  await fs.ensureDir(context.buildDir);
  await fs.writeFile(path.join(context.buildDir, '.prepare-commit'), `${commit}\n`);
}

export async function readPrepareCommit(buildDir: string): Promise<string | null> {
  const markerPath = path.join(buildDir, '.prepare-commit');
  if (!(await fs.pathExists(markerPath))) {
    return null;
  }

  return (await fs.readFile(markerPath, 'utf8')).trim() || null;
}

export async function currentArtifactCommit(context: DeployContext): Promise<string> {
  return (await readPrepareCommit(context.buildDir)) || resolveHeadCommit(context.repoRoot);
}

export async function seedBuildDockerConfigs(context: DeployContext): Promise<boolean> {
  const sourceDir = path.join(context.liferayDir, 'configs', 'dockerenv');
  const targetDir = path.join(context.buildDir, 'configs', 'dockerenv');

  if (!(await fs.pathExists(sourceDir))) {
    return false;
  }

  await fs.ensureDir(targetDir);
  await fs.copy(sourceDir, targetDir, {overwrite: true});
  return true;
}

export async function shouldRunBuildService(modulesDir: string): Promise<boolean> {
  return hasMatchingFile(modulesDir, (entryPath) => path.basename(entryPath) === 'service.xml');
}

export async function restoreTrackedServiceProperties(repoRoot: string): Promise<void> {
  const result = await runProcess('git', ['ls-files', 'liferay/modules'], {cwd: repoRoot});
  if (!result.ok) {
    return;
  }

  const serviceProperties = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('service.properties'));

  if (serviceProperties.length === 0) {
    return;
  }

  const checkout = await runProcess('git', ['checkout', '--', ...serviceProperties], {cwd: repoRoot});
  if (!checkout.ok) {
    throw new CliError(checkout.stderr.trim() || checkout.stdout.trim() || 'git checkout -- service.properties', {
      code: 'GIT_ERROR',
    });
  }
}

export async function resolveDeployCacheDir(config: AppConfig): Promise<string> {
  const envContext = resolveEnvContext(config);
  return resolveRuntimeStorage(envContext, 'liferay-deploy-cache').bindPath;
}

export async function listDeployArtifacts(directory: string): Promise<string[]> {
  if (!(await fs.pathExists(directory))) {
    return [];
  }

  const entries = await fs.readdir(directory, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name))
    .filter((entryPath) => /\.(jar|war|xml)$/i.test(entryPath));
}

export async function syncArtifactsToBuildDeploy(context: DeployContext, artifacts: string[]): Promise<number> {
  return syncArtifactsToDirectory(context.buildDeployDir, artifacts);
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
}

export async function collectModuleArtifacts(context: DeployContext, module: string): Promise<string[]> {
  const candidates = [
    path.join(context.liferayDir, 'themes', module, 'dist'),
    path.join(context.liferayDir, 'modules', module, `${module}-api`, 'build', 'libs'),
    path.join(context.liferayDir, 'modules', module, `${module}-service`, 'build', 'libs'),
    path.join(context.liferayDir, 'modules', module, 'build', 'libs'),
  ];

  const artifacts: string[] = [];
  for (const candidate of candidates) {
    artifacts.push(...(await listDeployArtifacts(candidate)));
  }

  return uniquePaths(artifacts);
}

export function ensureDeployArtifactsFound(artifacts: string[], label: string): void {
  if (artifacts.length > 0) {
    return;
  }

  throw new CliError(`No artifacts were found for ${label}.`, {
    code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
  });
}

async function hasMatchingFile(root: string, matches: (entryPath: string) => boolean): Promise<boolean> {
  if (!(await fs.pathExists(root))) {
    return false;
  }

  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.isFile() && matches(entryPath)) {
        return true;
      }
    }
  }

  return false;
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

  await runDocker(['volume', 'create', storage.volumeName], {reject: false});
}

function escapeSingleQuotes(value: string): string {
  return value.replaceAll("'", "'\"'\"'");
}

async function syncArtifactsToDirectory(targetDir: string, artifacts: string[]): Promise<number> {
  await fs.ensureDir(targetDir);

  let copied = 0;
  for (const artifact of uniquePaths(artifacts)) {
    if (!(await fs.pathExists(artifact))) {
      continue;
    }

    await fs.copy(artifact, path.join(targetDir, path.basename(artifact)), {overwrite: true});
    copied += 1;
  }

  return copied;
}

function uniquePaths(values: string[]): string[] {
  return [...new Set(values)];
}
