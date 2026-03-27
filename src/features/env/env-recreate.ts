import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';
import {withProgress} from '../../core/output/print.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';

import {resolveEnvContext} from './env-files.js';
import {runEnvWait} from './env-wait.js';

export type EnvRecreateResult = {
  ok: true;
  portalUrl: string;
  waitedForHealth: boolean;
};

export async function runEnvRecreate(
  config: AppConfig,
  options?: {wait?: boolean; timeoutSeconds?: number; processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvRecreateResult> {
  const context = resolveEnvContext(config);

  const recreateTask = async () => {
    await runDockerComposeOrThrow(context.dockerDir, ['stop', 'liferay'], {env: options?.processEnv});
    await runDockerComposeOrThrow(context.dockerDir, ['up', '-d', '--force-recreate', 'liferay'], {env: options?.processEnv});
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Recreando contenedor liferay', recreateTask);
  } else {
    await recreateTask();
  }

  if (options?.wait ?? true) {
    await runEnvWait(config, {
      timeoutSeconds: options?.timeoutSeconds ?? 250,
      pollIntervalSeconds: 5,
      processEnv: options?.processEnv,
      printer: options?.printer,
    });
  }

  return {
    ok: true,
    portalUrl: context.portalUrl,
    waitedForHealth: options?.wait ?? true,
  };
}

export function formatEnvRecreate(result: EnvRecreateResult): string {
  return [`Contenedor liferay recreado`, `Portal URL: ${result.portalUrl}`, `Espera de salud: ${result.waitedForHealth ? 'sí' : 'no'}`].join(
    '\n',
  );
}
