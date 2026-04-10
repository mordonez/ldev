import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';

import {collectEnvStatus, type EnvStatusReport} from './env-health.js';
import {buildComposeEnv, resolveEnvContext} from './env-files.js';

export async function runEnvStatus(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<EnvStatusReport> {
  const context = resolveEnvContext(config);
  return collectEnvStatus(context, {processEnv: buildComposeEnv(context, {baseEnv: options?.processEnv})});
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
