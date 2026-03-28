import type {AppConfig} from '../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient, type TokenResponse} from '../../core/http/auth.js';

export type LiferayAuthCheckResult = {
  ok: true;
  baseUrl: string;
  clientId: string;
  tokenType: string;
  expiresIn: number;
};

export type LiferayAuthTokenResult = LiferayAuthCheckResult & {
  accessToken: string;
  accessTokenMasked: string;
};

export async function runLiferayAuthCheck(
  config: AppConfig,
  dependencies?: {tokenClient?: OAuthTokenClient},
): Promise<LiferayAuthCheckResult> {
  const token = await fetchToken(config, dependencies);

  return {
    ok: true,
    baseUrl: config.liferay.url,
    clientId: config.liferay.oauth2ClientId,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
  };
}

export async function runLiferayAuthToken(
  config: AppConfig,
  dependencies?: {tokenClient?: OAuthTokenClient},
): Promise<LiferayAuthTokenResult> {
  const token = await fetchToken(config, dependencies);

  return {
    ok: true,
    baseUrl: config.liferay.url,
    clientId: config.liferay.oauth2ClientId,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
    accessToken: token.accessToken,
    accessTokenMasked: maskToken(token.accessToken),
  };
}

export function formatLiferayAuthCheck(result: LiferayAuthCheckResult): string {
  return [
    'AUTH_OK',
    `baseUrl=${result.baseUrl}`,
    `clientId=${result.clientId}`,
    `tokenType=${result.tokenType}`,
    `expiresIn=${result.expiresIn}`,
  ].join('\n');
}

export function formatLiferayAuthToken(result: LiferayAuthTokenResult, options?: {raw?: boolean}): string {
  if (options?.raw ?? false) {
    return result.accessToken;
  }

  const lines = [
    'AUTH_TOKEN_OK',
    `baseUrl=${result.baseUrl}`,
    `clientId=${result.clientId}`,
    `tokenType=${result.tokenType}`,
    `expiresIn=${result.expiresIn}`,
    `accessTokenMasked=${result.accessTokenMasked}`,
  ];

  return lines.join('\n');
}

function maskToken(value: string): string {
  if (value.trim() === '' || value.length <= 8) {
    return '****';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function fetchToken(config: AppConfig, dependencies?: {tokenClient?: OAuthTokenClient}): Promise<TokenResponse> {
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  return tokenClient.fetchClientCredentialsToken(config.liferay);
}
