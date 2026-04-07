import type {AppConfig} from '../../core/config/load-config.js';

import {collectEnvStatus, type EnvStatusReport} from './env-health.js';
import {resolveEnvContext} from './env-files.js';

export type EnvHealthResult = {
  ok: boolean;
  healthy: boolean;
  portalUrl: string;
  portalReachable: boolean;
  liferayState: string | null;
  liferayHealth: string | null;
};

export async function runEnvIsHealthy(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<EnvHealthResult> {
  const context = resolveEnvContext(config);
  const status = await collectEnvStatus(context, {processEnv: options?.processEnv});

  return healthFromStatus(status);
}

export function formatEnvIsHealthy(result: EnvHealthResult): string {
  return [
    `healthy=${result.healthy ? 'true' : 'false'}`,
    `portalUrl=${result.portalUrl}`,
    `portalReachable=${result.portalReachable ? 'true' : 'false'}`,
    `liferayState=${result.liferayState ?? 'unknown'}`,
    `liferayHealth=${result.liferayHealth ?? 'n/a'}`,
  ].join('\n');
}

export function healthFromStatus(status: EnvStatusReport): EnvHealthResult {
  const liferayState = status.liferay?.state ?? null;
  const liferayHealth = status.liferay?.health ?? null;
  const healthy = liferayHealth === 'healthy' || (liferayState === 'running' && liferayHealth === null);

  return {
    ok: healthy,
    healthy,
    portalUrl: status.portalUrl,
    portalReachable: status.portalReachable,
    liferayState,
    liferayHealth,
  };
}
