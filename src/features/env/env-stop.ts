import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import type {EnvStopResult} from '../../core/runtime/env-types.js';

import {EnvErrors} from './errors/env-error-factory.js';
import {buildComposeEnv, resolveEnvContext} from './env-files.js';

export type {EnvStopResult} from '../../core/runtime/env-types.js';

export async function runEnvStop(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv; printer?: Printer; signal?: AbortSignal},
): Promise<EnvStopResult> {
  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw EnvErrors.capabilityMissing('Docker and docker compose are required for env stop.');
  }

  const stopTask = async () => {
    const composeEnv = buildComposeEnv(context, {baseEnv: options?.processEnv});
    await runDockerComposeOrThrow(context.dockerDir, ['stop'], {env: composeEnv, signal: options?.signal});
    await runDockerComposeOrThrow(context.dockerDir, ['down'], {env: composeEnv, signal: options?.signal});
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
