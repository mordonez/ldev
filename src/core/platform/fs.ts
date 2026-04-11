import path from 'node:path';
import {rm, access} from 'node:fs/promises';

import fs from 'fs-extra';

import {runDocker} from './docker.js';

export const fileSystem = {
  pathExists: fs.pathExists,
  readFile: fs.readFile,
  writeFile: fs.writeFile,
};

export async function removePathRobust(targetPath: string, options?: {processEnv?: NodeJS.ProcessEnv}): Promise<void> {
  // Use fs.promises.rm with native maxRetries — Node.js handles EBUSY/ENOTEMPTY
  // retry internally (important for Windows where rmdir can race with open readdir handles
  // or Docker Desktop releasing bind-mount locks after docker compose down).
  try {
    await rm(targetPath, {recursive: true, force: true, maxRetries: 15, retryDelay: 1000});
    return;
  } catch (error) {
    if (!isPermissionOrBusyError(error) || !(await pathExists(targetPath))) {
      throw error;
    }
  }

  // Fallback: Docker helper handles paths that native rm can't (e.g. Windows MAX_PATH
  // exceeded in deeply nested node_modules or Java source trees).
  await removePathWithDockerHelper(targetPath, options?.processEnv);

  if (await pathExists(targetPath)) {
    await rm(targetPath, {recursive: true, force: true, maxRetries: 5, retryDelay: 500});
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  return access(targetPath)
    .then(() => true)
    .catch(() => false);
}

function isPermissionOrBusyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EBUSY')
  );
}

async function removePathWithDockerHelper(targetPath: string, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  const resolvedPath = path.resolve(targetPath);
  const parentDir = path.dirname(resolvedPath);
  const baseName = path.basename(resolvedPath);

  await runDocker(
    ['run', '--rm', '-v', `${parentDir}:/parent`, 'alpine', 'sh', '-lc', `rm -rf "/parent/${baseName}"`],
    {
      env: processEnv,
      reject: false,
    },
  );
}
