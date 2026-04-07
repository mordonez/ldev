import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../core/http/auth.js';
import {createLiferayApiClient, type LiferayApiClient} from '../../core/http/client.js';
import {authedGet} from './inventory/liferay-inventory-shared.js';

const DEFAULT_HEALTH_PATH = '/o/headless-admin-site/v1.0/sites?pageSize=1';

export type LiferayHealthResult = {
  ok: true;
  baseUrl: string;
  clientId: string;
  tokenType: string;
  expiresIn: number;
  checkedPath: string;
  status: number;
  permissionDenied: boolean;
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
    permissionDenied: health.permissionDenied,
  };
}

export async function performLiferayHealthCheck(
  config: AppConfig,
  accessToken: string,
  apiClient?: LiferayApiClient,
): Promise<{status: number; checkedPath: string; permissionDenied: boolean}> {
  const client = apiClient ?? createLiferayApiClient();
  const response = await authedGet(config, client, accessToken, DEFAULT_HEALTH_PATH);

  if (response.status === 403) {
    return {
      status: response.status,
      checkedPath: DEFAULT_HEALTH_PATH,
      permissionDenied: true,
    };
  }

  if (!response.ok) {
    throw new CliError(`health check failed with status=${response.status}.`, {
      code: 'LIFERAY_HEALTH_ERROR',
    });
  }

  return {
    status: response.status,
    checkedPath: DEFAULT_HEALTH_PATH,
    permissionDenied: false,
  };
}

export function formatLiferayHealth(result: LiferayHealthResult): string {
  const lines = [
    result.permissionDenied ? 'HEALTH_PARTIAL' : 'HEALTH_OK',
    `baseUrl=${result.baseUrl}`,
    `clientId=${result.clientId}`,
    `checkedPath=${result.checkedPath}`,
    `status=${result.status}`,
    `tokenType=${result.tokenType}`,
    `expiresIn=${result.expiresIn}`,
  ];

  if (result.permissionDenied) {
    lines.push(
      'note=OAuth token retrieval succeeded, but the default site inventory probe was denied by this runtime. Portal auth is working; inventory and other API workflows may still require broader API scopes.',
    );
  }

  return lines.join('\n');
}
