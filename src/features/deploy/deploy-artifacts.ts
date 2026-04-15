import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {DeployContext} from './deploy-gradle.js';

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

export async function syncArtifactsToDirectory(targetDir: string, artifacts: string[]): Promise<number> {
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

export function uniquePaths(values: string[]): string[] {
  return [...new Set(values)];
}

export function escapeSingleQuotes(value: string): string {
  return value.replaceAll("'", "'\"'\"'");
}

export function escapeShellArg(value: string): string {
  return `'${escapeSingleQuotes(value)}'`;
}
