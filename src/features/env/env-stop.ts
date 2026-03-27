import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';
import {withProgress} from '../../core/output/print.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';

import {resolveEnvContext} from './env-files.js';

export type EnvStopResult = {
  ok: true;
  dockerDir: string;
  stopped: boolean;
};

export async function runEnvStop(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvStopResult> {
  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker y docker compose son obligatorios para env stop.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  const stopTask = async () => {
    await runDockerComposeOrThrow(context.dockerDir, ['stop'], {env: options?.processEnv});
    await runDockerComposeOrThrow(context.dockerDir, ['down'], {env: options?.processEnv});
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Parando entorno Docker', stopTask);
  } else {
    await stopTask();
  }

  return {
    ok: true,
    dockerDir: context.dockerDir,
    stopped: true,
  };
}

export function formatEnvStop(result: EnvStopResult): string {
  return `Entorno parado desde ${result.dockerDir}`;
}
