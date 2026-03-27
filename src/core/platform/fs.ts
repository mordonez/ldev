import path from 'node:path';

import fs from 'fs-extra';

import {runDocker} from './docker.js';

export const fileSystem = {
  pathExists: fs.pathExists,
  readFile: fs.readFile,
  writeFile: fs.writeFile,
};

export async function removePathRobust(targetPath: string, options?: {processEnv?: NodeJS.ProcessEnv}): Promise<void> {
  try {
    await fs.remove(targetPath);
    return;
  } catch (error) {
    if (!isPermissionError(error) || !(await fs.pathExists(targetPath))) {
      throw error;
    }
  }

  await removePathWithDockerHelper(targetPath, options?.processEnv);

  if (await fs.pathExists(targetPath)) {
    await fs.remove(targetPath);
  }
}

function isPermissionError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error.code === 'EACCES' || error.code === 'EPERM');
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
