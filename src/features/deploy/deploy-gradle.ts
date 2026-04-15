import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {runProcess} from '../../core/platform/process.js';

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
