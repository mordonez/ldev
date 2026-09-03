import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import {EnvErrors} from './errors/env-error-factory.js';
import {buildComposeEnv, resolveEnvContext, resolveManagedStorages} from './env-files.js';

export type EnvCleanResult = {
  ok: true;
  dockerDir: string;
  composeProjectName: string;
  dataRootDeleted: boolean;
  dataRootSkipped: string | null;
  doclibVolumeRemoved: boolean;
};

export async function runEnvClean(
  config: AppConfig,
  options?: {force?: boolean; processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvCleanResult> {
  if (!(options?.force ?? false)) {
    throw EnvErrors.forceRequired('env clean is destructive; run it again with --force.');
  }

  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw EnvErrors.capabilityMissing('Docker and docker compose are required for env clean.');
  }

  // These steps use the non-throwing runDocker/runDockerCompose (not the
  // *OrThrow variants) and only inspect `.ok`: env clean is meant to be
  // idempotent, so a volume that was already removed by a prior clean (or by
  // hand) must not abort the rest of the cleanup.
  const cleanTask = async () => {
    await runDockerCompose(context.dockerDir, ['down', '-v'], {
      env: buildComposeEnv(context, {baseEnv: options?.processEnv}),
    });
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Removing Compose containers and volumes', cleanTask);
  } else {
    await cleanTask();
  }

  const doclibVolume = context.envValues.DOCLIB_VOLUME_NAME || `${context.composeProjectName}-doclib`;
  const volumeResult = await runDocker(['volume', 'rm', doclibVolume], {env: options?.processEnv});
  const doclibVolumeRemoved = volumeResult.ok;

  for (const storage of resolveManagedStorages(context)) {
    if (storage.mode !== 'volume') {
      continue;
    }
    await runDocker(['volume', 'rm', storage.volumeName], {env: options?.processEnv});
  }

  let dataRootDeleted = false;
  let dataRootSkipped: string | null = null;
  if (isPathInside(context.repoRoot, context.dataRoot)) {
    await removePathRobust(context.dataRoot, {processEnv: options?.processEnv});
    dataRootDeleted = true;
  } else {
    dataRootSkipped = context.dataRoot;
    if (options?.printer) {
      options.printer.info(`Keeping ENV_DATA_ROOT outside the repository: ${context.dataRoot}`);
    }
  }

  return {
    ok: true,
    dockerDir: context.dockerDir,
    composeProjectName: context.composeProjectName,
    dataRootDeleted,
    dataRootSkipped,
    doclibVolumeRemoved,
  };
}

export function formatEnvClean(result: EnvCleanResult): string {
  const lines = [
    `Environment cleaned: ${result.composeProjectName}`,
    `Data root deleted: ${result.dataRootDeleted ? 'yes' : 'no'}`,
    `Doclib volume removed: ${result.doclibVolumeRemoved ? 'yes' : 'no'}`,
  ];
  if (result.dataRootSkipped) {
    lines.push(`ENV_DATA_ROOT kept: ${result.dataRootSkipped}`);
  }
  return lines.join('\n');
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
