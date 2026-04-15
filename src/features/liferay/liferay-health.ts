import type {AppConfig} from '../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../core/http/auth.js';
import {type LiferayApiClient} from '../../core/http/client.js';
import {createLiferayGateway, type LiferayGateway} from './liferay-gateway.js';
import {LiferayErrors} from './errors/index.js';

const HEALTH_PATH = '/o/headless-admin-user/v1.0/my-user-account';

export type LiferayHealthResult = {
  ok: true;
  baseUrl: string;
  clientId: string;
  tokenType: string;
  expiresIn: number;
  checkedPath: string;
  status: number;
  permissionDenied: boolean;
  probeUnavailable: boolean;
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
  const gateway = createLiferayGateway(config, dependencies?.apiClient, tokenClient);
  const health = await performLiferayHealthCheck(gateway);

  return {
    ok: true,
    baseUrl: config.liferay.url,
    clientId: config.liferay.oauth2ClientId,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
    checkedPath: health.checkedPath,
    status: health.status,
    permissionDenied: health.permissionDenied,
    probeUnavailable: health.probeUnavailable,
  };
}

export async function performLiferayHealthCheck(
  gateway: LiferayGateway,
): Promise<{status: number; checkedPath: string; permissionDenied: boolean; probeUnavailable: boolean}> {
  const response = await gateway.getRaw<unknown>(HEALTH_PATH);

  if (response.ok) {
    return {
      status: response.status,
      checkedPath: HEALTH_PATH,
      permissionDenied: false,
      probeUnavailable: false,
    };
  }

  if (response.status === 403) {
    return {
      status: response.status,
      checkedPath: HEALTH_PATH,
      permissionDenied: true,
      probeUnavailable: false,
    };
  }

  if (response.status === 404) {
    return {
      status: response.status,
      checkedPath: HEALTH_PATH,
      permissionDenied: false,
      probeUnavailable: true,
    };
  }

  throw LiferayErrors.healthError(
    `Health check failed with status=${response.status} on ${HEALTH_PATH}. Verify portal URL, OAuth client scopes, and token permissions.`,
  );
}

export function formatLiferayHealth(result: LiferayHealthResult): string {
  const lines = [
    result.permissionDenied || result.probeUnavailable ? 'HEALTH_PARTIAL' : 'HEALTH_OK',
    `baseUrl=${result.baseUrl}`,
    `clientId=${result.clientId}`,
    `checkedPath=${result.checkedPath}`,
    `status=${result.status}`,
    `tokenType=${result.tokenType}`,
    `expiresIn=${result.expiresIn}`,
  ];

  if (result.permissionDenied) {
    lines.push(
      'note=OAuth token retrieval succeeded, but the available health probes were denied by this runtime. Portal auth is working; inventory and other API workflows may still require broader API scopes.',
    );
  }

  if (result.probeUnavailable) {
    lines.push(
      'note=OAuth token retrieval succeeded, but the health probe endpoints returned 404 on this runtime. Portal auth is working; this environment does not expose the default probe paths consistently.',
    );
  }

  return lines.join('\n');
}
