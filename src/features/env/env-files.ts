import path from 'node:path';

import fs from 'fs-extra';

import {readEnvFile, upsertEnvFileValues} from '../../core/config/env-file.js';
import type {EnvContext} from '../../core/runtime/env-context.js';
import {resolveDockerConfigSourceDirs, copyDirectoryContents} from './env-data-utils.js';
import {ensureDoclibVolume} from './env-doclib-volume.js';

export {
  buildComposeEnv,
  buildComposeFilesEnv,
  ensureEnvDataLayout,
  resolveDataRoot,
  resolveEnvContext,
  resolveManagedStorages,
  resolvePostgresStorage,
  resolveRuntimeStorage,
} from '../../core/runtime/env-context.js';
export type {EnvContext, PostgresStorage, RuntimeStorage, RuntimeStorageKey} from '../../core/runtime/env-context.js';
export {ensureDoclibVolume};

export async function ensureEnvFile(context: EnvContext): Promise<{created: boolean; mergedKeys: string[]}> {
  if (!(await fs.pathExists(context.dockerEnvFile))) {
    if (context.dockerEnvExampleFile) {
      await fs.copy(context.dockerEnvExampleFile, context.dockerEnvFile);
      return {created: true, mergedKeys: []};
    }

    await fs.writeFile(context.dockerEnvFile, '');
    return {created: true, mergedKeys: []};
  }

  if (!context.dockerEnvExampleFile) {
    return {created: false, mergedKeys: []};
  }

  const currentContent = await fs.readFile(context.dockerEnvFile, 'utf8');
  const exampleValues = readEnvFile(context.dockerEnvExampleFile);
  const currentValues = readEnvFile(context.dockerEnvFile);
  const missingEntries = Object.fromEntries(Object.entries(exampleValues).filter(([key]) => !(key in currentValues)));

  if (Object.keys(missingEntries).length === 0) {
    return {created: false, mergedKeys: []};
  }

  const updatedContent = upsertEnvFileValues(currentContent, missingEntries);
  await fs.writeFile(context.dockerEnvFile, `${updatedContent}\n`);
  return {created: false, mergedKeys: Object.keys(missingEntries)};
}

export async function seedBuildDockerConfigs(context: EnvContext): Promise<boolean> {
  const targetDir = path.join(context.liferayDir, 'build', 'docker', 'configs', 'dockerenv');
  const deployDir = path.join(context.liferayDir, 'build', 'docker', 'deploy');

  await fs.ensureDir(deployDir);
  await fs.chmod(deployDir, 0o775);

  const sourceDirs = await resolveDockerConfigSourceDirs(context.liferayDir);
  if (sourceDirs.length === 0) {
    return false;
  }

  const hasExplicitDockerenv = await fs.pathExists(path.join(context.liferayDir, 'configs', 'dockerenv'));
  if (!hasExplicitDockerenv) {
    await fs.emptyDir(targetDir);
  } else {
    await fs.ensureDir(targetDir);
  }

  for (const sourceDir of sourceDirs) {
    await copyDirectoryContents(sourceDir, targetDir);
  }

  return true;
}
