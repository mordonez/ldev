import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';

import {collectEnvStatus, type EnvStatusReport} from './env-health.js';
import {resolveEnvContext} from './env-files.js';

export async function runEnvStatus(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<EnvStatusReport> {
  const context = resolveEnvContext(config);
  return collectEnvStatus(context, options);
}

export function formatEnvStatus(report: EnvStatusReport): string {
  if (!report.liferay) {
    throw new CliError('No se ha podido resolver el servicio liferay del compose.', {code: 'ENV_SERVICE_NOT_FOUND'});
  }

  return [
    `Proyecto: ${report.repoRoot}`,
    `Docker dir: ${report.dockerDir}`,
    `Compose project: ${report.composeProjectName}`,
    `Portal URL: ${report.portalUrl}`,
    `Portal reachable: ${report.portalReachable ? 'yes' : 'no'}`,
    `Liferay state: ${report.liferay.state ?? 'not-created'}`,
    `Liferay health: ${report.liferay.health ?? 'n/a'}`,
  ].join('\n');
}
