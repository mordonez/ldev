import path from 'node:path';

import fs from 'fs-extra';

export async function normalizeEnvDataPermissions(dataRoot: string): Promise<void> {
  const elasticsearchDataDir = path.join(dataRoot, 'elasticsearch-data');

  if (await fs.pathExists(elasticsearchDataDir)) {
    await fs.chmod(elasticsearchDataDir, 0o777);
  }
}

export async function resolveDockerConfigSourceDirs(liferayDir: string): Promise<string[]> {
  const dockerenvDir = path.join(liferayDir, 'configs', 'dockerenv');
  if (await fs.pathExists(dockerenvDir)) {
    return [dockerenvDir];
  }

  const sourceDirs: string[] = [];
  const commonDir = path.join(liferayDir, 'configs', 'common');
  const localDir = path.join(liferayDir, 'configs', 'local');

  if (await fs.pathExists(commonDir)) {
    sourceDirs.push(commonDir);
  }

  if (await fs.pathExists(localDir)) {
    sourceDirs.push(localDir);
  }

  return sourceDirs;
}

export async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  const entries = await fs.readdir(sourceDir);

  for (const entry of entries) {
    await fs.copy(path.join(sourceDir, entry), path.join(targetDir, entry), {overwrite: true});
  }
}
