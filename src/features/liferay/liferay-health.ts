import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../core/http/auth.js';
import {createLiferayApiClient, type LiferayApiClient} from '../../core/http/client.js';
import {authedGet} from './inventory/liferay-inventory-shared.js';

const DEFAULT_HEALTH_PATH = '/o/headless-admin-user/v1.0/sites/by-friendly-url-path/global';

export type LiferayHealthResult = {
  ok: true;
  baseUrl: string;
  clientId: string;
  tokenType: string;
  expiresIn: number;
  checkedPath: string;
  status: number;
};

type HealthDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export async function runLiferayHealth(
  config: AppConfig,
  dependencies?: HealthDependencies,
): Promise<LiferayHealthResult> {
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const token = await tokenClient.fetchClientCredentialsToken(config.liferay);
  const health = await performLiferayHealthCheck(config, token.accessToken, dependencies?.apiClient);

  return {
    ok: true,
    baseUrl: config.liferay.url,
    clientId: config.liferay.oauth2ClientId,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
    checkedPath: health.checkedPath,
    status: health.status,
  };
}

export async function performLiferayHealthCheck(
  config: AppConfig,
  accessToken: string,
  apiClient?: LiferayApiClient,
): Promise<{status: number; checkedPath: string}> {
  const client = apiClient ?? createLiferayApiClient();
  const response = await authedGet(config, client, accessToken, DEFAULT_HEALTH_PATH);

  if (!response.ok) {
    throw new CliError(`health check failed with status=${response.status}.`, {
      code: 'LIFERAY_HEALTH_ERROR',
    });
  }

  return {
    status: response.status,
    checkedPath: DEFAULT_HEALTH_PATH,
  };
}

export function formatLiferayHealth(result: LiferayHealthResult): string {
  return [
    'HEALTH_OK',
    `baseUrl=${result.baseUrl}`,
    `clientId=${result.clientId}`,
    `checkedPath=${result.checkedPath}`,
    `status=${result.status}`,
    `tokenType=${result.tokenType}`,
    `expiresIn=${result.expiresIn}`,
  ].join('\n');
}
