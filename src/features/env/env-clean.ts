import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {removePathRobust} from '../../core/platform/fs.js';
import {runDockerOrThrow, runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {resolveEnvContext} from './env-files.js';

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
    throw new CliError('env clean is destructive; run it again with --force.', {code: 'ENV_FORCE_REQUIRED'});
  }

  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker and docker compose are required for env clean.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  const cleanTask = async () => {
    await runDockerComposeOrThrow(context.dockerDir, ['down', '-v'], {env: options?.processEnv});
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Removing Compose containers and volumes', cleanTask);
  } else {
    await cleanTask();
  }

  let doclibVolumeRemoved = false;
  const doclibVolume = context.envValues.DOCLIB_VOLUME_NAME || `${context.composeProjectName}-doclib`;
  const volumeResult = await runDockerOrThrow(['volume', 'rm', doclibVolume], {
    env: options?.processEnv,
    reject: false,
  });
  doclibVolumeRemoved = volumeResult.ok;

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
