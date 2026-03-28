import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';

import {collectEnvStatus, waitForServiceHealthy, type EnvStatusReport} from './env-health.js';
import {resolveEnvContext} from './env-files.js';

export type EnvWaitResult = EnvStatusReport;

export async function runEnvWait(
  config: AppConfig,
  options?: {timeoutSeconds?: number; pollIntervalSeconds?: number; processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvWaitResult> {
  const context = resolveEnvContext(config);

  const waitTask = async () => {
    try {
      await waitForServiceHealthy(context, 'liferay', {
        timeoutSeconds: options?.timeoutSeconds ?? 600,
        pollIntervalSeconds: options?.pollIntervalSeconds ?? 10,
        processEnv: options?.processEnv,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Timeout esperando a que Liferay quede healthy.';
      throw new CliError(message, {code: 'ENV_WAIT_TIMEOUT'});
    }
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Esperando a que liferay quede healthy', waitTask);
  } else {
    await waitTask();
  }

  return collectEnvStatus(context, {processEnv: options?.processEnv});
}

export function formatEnvWait(result: EnvWaitResult): string {
  const liferay = result.liferay;
  return [
    `Portal URL: ${result.portalUrl}`,
    `Portal reachable: ${result.portalReachable ? 'yes' : 'no'}`,
    `Liferay state: ${liferay?.state ?? 'unknown'}`,
    `Liferay health: ${liferay?.health ?? 'n/a'}`,
  ].join('\n');
}
