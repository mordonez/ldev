import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';

import {buildComposeEnv, resolveEnvContext} from './env-files.js';

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
    throw new CliError('Docker and docker compose are required for env stop.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  const stopTask = async () => {
    const composeEnv = buildComposeEnv(context, {baseEnv: options?.processEnv});
    await runDockerComposeOrThrow(context.dockerDir, ['stop'], {env: composeEnv});
    await runDockerComposeOrThrow(context.dockerDir, ['down'], {env: composeEnv});
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Stopping Docker environment', stopTask);
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
  return `Environment stopped from ${result.dockerDir}`;
}
