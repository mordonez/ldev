import type {AppConfig} from '../../core/config/load-config.js';

import {runEnvStatus} from './env-status.js';

export type EnvInfoResult = Awaited<ReturnType<typeof runEnvStatus>>;

export async function runEnvInfo(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<EnvInfoResult> {
  return runEnvStatus(config, options);
}

export function formatEnvInfo(result: EnvInfoResult): string {
  const serviceLines = result.services.map((service) => {
    return `  - ${service.service}: state=${service.state ?? 'not-created'} health=${service.health ?? 'n/a'}`;
  });

  return [
    `Docker services (${result.composeProjectName}):`,
    ...serviceLines,
    '',
    `Portal URL: ${result.portalUrl}`,
    `Portal reachable: ${result.portalReachable ? 'yes' : 'no'}`,
  ].join('\n');
}
