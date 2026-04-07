import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {upsertEnvFileValues} from '../../core/config/env-file.js';

export type DbFilesDetectResult = {
  ok: true;
  detectedPath: string;
};

export async function runDbFilesDetect(config: AppConfig, options?: {baseDir?: string}): Promise<DbFilesDetectResult> {
  if (!config.files.dockerEnv) {
    throw new CliError('db files-detect requires a resolvable docker/.env.', {
      code: 'DB_REPO_NOT_FOUND',
    });
  }

  const baseDir = options?.baseDir?.trim() || process.env.HOME || process.cwd();
  if (!(await fs.pathExists(baseDir))) {
    throw new CliError(`document_library was not found in ${baseDir}`, {
      code: 'DB_DOCLIB_NOT_FOUND',
    });
  }

  const detectedPath = await findDocumentLibrary(baseDir);
  if (!detectedPath) {
    throw new CliError(`document_library was not found in ${baseDir}`, {
      code: 'DB_DOCLIB_NOT_FOUND',
    });
  }

  const envFile = config.files.dockerEnv;
  const currentContent = await fs.readFile(envFile, 'utf8').catch(() => '');
  const updatedContent = upsertEnvFileValues(currentContent, {DOCLIB_PATH: detectedPath});
  await fs.writeFile(envFile, `${updatedContent}\n`);

  return {
    ok: true,
    detectedPath,
  };
}

export function formatDbFilesDetect(result: DbFilesDetectResult): string {
  return `DOCLIB_PATH=${result.detectedPath}`;
}

async function findDocumentLibrary(baseDir: string): Promise<string | null> {
  const queue = [path.resolve(baseDir)];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, {withFileTypes: true}).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.name === 'document_library') {
        return entryPath;
      }
      queue.push(entryPath);
    }
  }

  return null;
}
