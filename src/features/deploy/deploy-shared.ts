import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';
import {withProgress} from '../../core/output/print.js';
import {runProcess} from '../../core/platform/process.js';
import {resolveEnvContext} from '../env/env-files.js';

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
    throw new CliError('deploy requiere ejecutarse dentro de un proyecto válido con docker/ y liferay/.', {
      code: 'DEPLOY_REPO_NOT_FOUND',
    });
  }

  return {
    repoRoot: config.repoRoot,
    liferayDir: config.liferayDir,
    dockerDir: config.dockerDir,
    gradlewPath: path.join(config.liferayDir, 'gradlew'),
    buildDir: path.join(config.liferayDir, 'build', 'docker'),
    buildDeployDir: path.join(config.liferayDir, 'build', 'docker', 'deploy'),
  };
}

export async function ensureGradleWrapper(context: DeployContext): Promise<void> {
  if (!(await fs.pathExists(context.gradlewPath))) {
    throw new CliError(`No existe gradlew en ${context.liferayDir}.`, {
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
  if (!(await hasMatchingFile(modulesDir, (entryPath) => path.basename(entryPath) === 'service.xml'))) {
    return false;
  }

  return !(await hasMatchingFile(modulesDir, (entryPath) => {
    const normalized = entryPath.split(path.sep);
    const size = normalized.length;
    return size >= 3
      && normalized[size - 3] === 'build'
      && normalized[size - 2] === 'libs'
      && entryPath.endsWith('.jar');
  }));
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
  return path.join(envContext.dataRoot, 'liferay-deploy-cache');
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
  const cacheDir = await resolveDeployCacheDir(config);
  const artifacts = await listDeployArtifacts(cacheDir);

  if (artifacts.length === 0) {
    return {
      cacheDir,
      copied: 0,
      commit: await readPrepareCommit(cacheDir),
    };
  }

  const copied = await syncArtifactsToDirectory(context.buildDeployDir, artifacts);
  const commit = await readPrepareCommit(cacheDir);

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
  const cacheDir = await resolveDeployCacheDir(config);
  await fs.ensureDir(cacheDir);

  if (options?.clean ?? false) {
    const existing = await listDeployArtifacts(cacheDir);
    for (const artifact of existing) {
      await fs.remove(artifact);
    }
  }

  const copied = await syncArtifactsToDirectory(cacheDir, artifacts);
  if (copied === 0) {
    throw new CliError(`No se encontraron artefactos desplegables para copiar a ${cacheDir}.`, {
      code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
    });
  }

  const commit = await currentArtifactCommit(context);
  await fs.writeFile(path.join(cacheDir, '.prepare-commit'), `${commit}\n`);

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

  throw new CliError(`No se encontraron artefactos para ${label}.`, {
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
