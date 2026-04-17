import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import pRetry, {AbortError} from 'p-retry';

import {CliError} from '../errors.js';
import {createLiferayApiClient, type HttpApiClient} from './client.js';

export type OAuthClientCredentialsConfig = {
  url: string;
  oauth2ClientId: string;
  oauth2ClientSecret: string;
  scopeAliases: string;
  timeoutSeconds: number;
};

export type TokenResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
};

export type OAuthTokenClient = {
  fetchClientCredentialsToken: (settings: OAuthClientCredentialsConfig) => Promise<TokenResponse>;
};

export function createOAuthTokenClient(options?: {
  apiClient?: HttpApiClient;
  invalidClientRetryDelayMs?: number;
  invalidClientMaxWaitMs?: number;
  cacheDir?: string;
  now?: () => number;
}): OAuthTokenClient {
  const apiClient = options?.apiClient ?? createLiferayApiClient();
  const invalidClientRetryDelayMs = options?.invalidClientRetryDelayMs ?? 5000;
  const invalidClientMaxWaitMs = options?.invalidClientMaxWaitMs ?? 90000;
  const cacheDir = options?.cacheDir ?? path.join(os.tmpdir(), 'ldev-oauth-cache');
  const now = options?.now ?? Date.now;

  return {
    async fetchClientCredentialsToken(settings) {
      if (settings.oauth2ClientId.trim() === '' || settings.oauth2ClientSecret.trim() === '') {
        throw new CliError('Missing OAuth2 credentials: set oauth2ClientId and oauth2ClientSecret.', {
          code: 'AUTH_CONFIG_ERROR',
        });
      }

      const cached = await readCachedToken(cacheDir, settings, now);
      if (cached) {
        return cached;
      }

      const scope = settings.scopeAliases.replaceAll(',', ' ').trim();

      return pRetry(
        async () => {
          const scopedAttempt = await requestWithFallback(apiClient, settings, scope);
          if (scopedAttempt.ok) {
            const token = parseTokenResponse(scopedAttempt.body, settings.oauth2ClientId);
            await writeCachedToken(cacheDir, settings, token, now);
            return token;
          }

          if (shouldRetryWithoutScope(scopedAttempt.body, scope)) {
            const unscopedAttempt = await requestWithFallback(apiClient, settings, '');
            if (unscopedAttempt.ok) {
              const token = parseTokenResponse(unscopedAttempt.body, settings.oauth2ClientId);
              await writeCachedToken(cacheDir, settings, token, now);
              return token;
            }
            if (!isInvalidClient(unscopedAttempt.status, unscopedAttempt.body)) {
              throw new AbortError(
                buildTokenError(unscopedAttempt.status, unscopedAttempt.body, settings.oauth2ClientId),
              );
            }
          } else if (!isInvalidClient(scopedAttempt.status, scopedAttempt.body)) {
            throw new AbortError(buildTokenError(scopedAttempt.status, scopedAttempt.body, settings.oauth2ClientId));
          }

          throw buildTokenError(scopedAttempt.status, scopedAttempt.body, settings.oauth2ClientId);
        },
        {
          maxRetryTime: invalidClientMaxWaitMs,
          minTimeout: invalidClientRetryDelayMs,
          maxTimeout: invalidClientRetryDelayMs,
          factor: 1,
        },
      );
    },
  };
}

type CachedTokenPayload = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number;
};

async function requestWithFallback(apiClient: HttpApiClient, settings: OAuthClientCredentialsConfig, scope: string) {
  const baseForm = {
    grant_type: 'client_credentials',
    ...(scope === '' ? {} : {scope}),
  };

  const basicAttempt = await apiClient.postForm(settings.url, '/o/oauth2/token', baseForm, {
    timeoutSeconds: settings.timeoutSeconds,
    headers: {
      Authorization: `Basic ${Buffer.from(`${settings.oauth2ClientId}:${settings.oauth2ClientSecret}`).toString('base64')}`,
    },
  });

  if (!shouldRetryWithClientSecretPost(basicAttempt.status, basicAttempt.body)) {
    return basicAttempt;
  }

  return apiClient.postForm(
    settings.url,
    '/o/oauth2/token',
    {
      ...baseForm,
      client_id: settings.oauth2ClientId,
      client_secret: settings.oauth2ClientSecret,
    },
    {
      timeoutSeconds: settings.timeoutSeconds,
    },
  );
}

function parseTokenResponse(body: string, clientId: string): TokenResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new CliError(`Invalid OAuth2 response for clientId=${clientId}.`, {code: 'AUTH_ERROR'});
  }

  if (!isTokenPayload(parsed)) {
    throw new CliError(`OAuth2 response missing access_token for clientId=${clientId}.`, {code: 'AUTH_ERROR'});
  }

  return {
    accessToken: parsed.access_token,
    tokenType: parsed.token_type || 'Bearer',
    expiresIn: parsed.expires_in || 0,
  };
}

function shouldRetryWithClientSecretPost(status: number, body: string): boolean {
  const normalized = body.trim().toLowerCase();
  if (status === 400 || status === 401) {
    return normalized.includes('invalid_client');
  }

  if (status >= 200 && status < 300) {
    if (normalized === '') {
      return true;
    }
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      return typeof parsed.access_token !== 'string' || parsed.access_token.trim() === '';
    } catch {
      return true;
    }
  }

  return false;
}

function shouldRetryWithoutScope(body: string, scope: string): boolean {
  return scope !== '' && body.toLowerCase().includes('invalid_grant');
}

function isInvalidClient(status: number, body: string): boolean {
  return (status === 400 || status === 401) && body.toLowerCase().includes('invalid_client');
}

function buildTokenError(status: number, body: string, clientId: string): CliError {
  return new CliError(`Token request failed (${status}) for clientId=${clientId}: ${sanitizeBody(body)}`, {
    code: 'AUTH_ERROR',
  });
}

function sanitizeBody(body: string): string {
  return body.replaceAll(/\s+/g, ' ').trim();
}

function isTokenPayload(value: unknown): value is {
  access_token: string;
  token_type?: string;
  expires_in?: number;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'access_token' in value &&
    typeof value.access_token === 'string' &&
    value.access_token.trim() !== ''
  );
}

async function readCachedToken(
  cacheDir: string,
  settings: OAuthClientCredentialsConfig,
  now: () => number,
): Promise<TokenResponse | null> {
  const file = tokenCacheFile(cacheDir, settings);

  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isCachedTokenPayload(parsed)) {
    return null;
  }

  if (parsed.expiresAt <= now() + tokenRefreshBufferMs(parsed.expiresIn)) {
    return null;
  }

  return {
    accessToken: parsed.accessToken,
    tokenType: parsed.tokenType,
    expiresIn: parsed.expiresIn,
  };
}

async function writeCachedToken(
  cacheDir: string,
  settings: OAuthClientCredentialsConfig,
  token: TokenResponse,
  now: () => number,
): Promise<void> {
  const file = tokenCacheFile(cacheDir, settings);
  const payload: CachedTokenPayload = {
    accessToken: token.accessToken,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
    expiresAt: now() + token.expiresIn * 1000,
  };

  await fs.mkdir(cacheDir, {recursive: true});
  await fs.writeFile(file, JSON.stringify(payload), {mode: 0o600});
}

function tokenCacheFile(cacheDir: string, settings: OAuthClientCredentialsConfig): string {
  const key = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        url: settings.url,
        clientId: settings.oauth2ClientId,
        clientSecret: settings.oauth2ClientSecret,
        scopeAliases: settings.scopeAliases,
      }),
    )
    .digest('hex');

  return path.join(cacheDir, `${key}.json`);
}

function tokenRefreshBufferMs(expiresIn: number): number {
  const seconds = Math.max(5, Math.min(60, Math.floor(expiresIn * 0.1)));
  return seconds * 1000;
}

function isCachedTokenPayload(value: unknown): value is CachedTokenPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    typeof value.accessToken === 'string' &&
    value.accessToken.trim() !== '' &&
    'tokenType' in value &&
    typeof value.tokenType === 'string' &&
    'expiresIn' in value &&
    typeof value.expiresIn === 'number' &&
    Number.isFinite(value.expiresIn) &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt)
  );
}
