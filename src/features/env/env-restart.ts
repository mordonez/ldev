import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';

import {resolveEnvContext} from './env-files.js';
import {runEnvStart} from './env-start.js';
import {runEnvStop} from './env-stop.js';

export type EnvRestartResult = {
  ok: true;
  portalUrl: string;
  waitedForHealth: boolean;
};

export async function runEnvRestart(
  config: AppConfig,
  options?: {wait?: boolean; timeoutSeconds?: number; processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvRestartResult> {
  const context = resolveEnvContext(config);
  await runEnvStop(config, {
    processEnv: options?.processEnv,
    printer: options?.printer,
  });
  await runEnvStart(config, {
    wait: options?.wait ?? true,
    timeoutSeconds: options?.timeoutSeconds ?? 250,
    processEnv: options?.processEnv,
    printer: options?.printer,
  });

  return {
    ok: true,
    portalUrl: context.portalUrl,
    waitedForHealth: options?.wait ?? true,
  };
}

export function formatEnvRestart(result: EnvRestartResult): string {
  return [
    `Liferay container restarted`,
    `Portal URL: ${result.portalUrl}`,
    `Health wait: ${result.waitedForHealth ? 'yes' : 'no'}`,
  ].join('\n');
}
