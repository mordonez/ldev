import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';
import {withProgress} from '../../core/output/print.js';
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
    throw new CliError('env clean es destructivo; vuelve a ejecutar con --force.', {code: 'ENV_FORCE_REQUIRED'});
  }

  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker y docker compose son obligatorios para env clean.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  const cleanTask = async () => {
    await runDockerComposeOrThrow(context.dockerDir, ['down', '-v'], {env: options?.processEnv});
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Eliminando contenedores y volúmenes Compose', cleanTask);
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
      options.printer.info(`Se conserva ENV_DATA_ROOT fuera del repo: ${context.dataRoot}`);
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
    `Entorno limpiado: ${result.composeProjectName}`,
    `Data root eliminado: ${result.dataRootDeleted ? 'sí' : 'no'}`,
    `Volumen doclib eliminado: ${result.doclibVolumeRemoved ? 'sí' : 'no'}`,
  ];
  if (result.dataRootSkipped) {
    lines.push(`ENV_DATA_ROOT conservado: ${result.dataRootSkipped}`);
  }
  return lines.join('\n');
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
