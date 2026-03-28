import {CliError} from '../../cli/errors.js';
import {createLiferayApiClient, type LiferayApiClient} from './client.js';

export type LiferayAuthConfig = {
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
  fetchClientCredentialsToken: (settings: LiferayAuthConfig) => Promise<TokenResponse>;
};

export function createOAuthTokenClient(options?: {
  apiClient?: LiferayApiClient;
  invalidClientRetryDelayMs?: number;
  invalidClientMaxWaitMs?: number;
  sleep?: (timeoutMs: number) => Promise<void>;
}): OAuthTokenClient {
  const apiClient = options?.apiClient ?? createLiferayApiClient();
  const invalidClientRetryDelayMs = options?.invalidClientRetryDelayMs ?? 5000;
  const invalidClientMaxWaitMs = options?.invalidClientMaxWaitMs ?? 90000;
  const sleepFn = options?.sleep ?? sleep;

  return {
    async fetchClientCredentialsToken(settings) {
      if (settings.oauth2ClientId.trim() === '' || settings.oauth2ClientSecret.trim() === '') {
        throw new CliError('Faltan credenciales OAuth2: configura clientId y clientSecret.', {
          code: 'LIFERAY_AUTH_CONFIG_ERROR',
        });
      }

      const scope = settings.scopeAliases.replaceAll(',', ' ').trim();
      const startedAt = Date.now();

      while (true) {
        const scopedAttempt = await requestWithFallback(apiClient, settings, scope);
        if (scopedAttempt.ok) {
          return parseTokenResponse(scopedAttempt.body, settings.oauth2ClientId);
        }

        if (shouldRetryWithoutScope(scopedAttempt.body, scope)) {
          const unscopedAttempt = await requestWithFallback(apiClient, settings, '');
          if (unscopedAttempt.ok) {
            return parseTokenResponse(unscopedAttempt.body, settings.oauth2ClientId);
          }
          if (!isInvalidClient(unscopedAttempt.status, unscopedAttempt.body)) {
            throw buildTokenError(unscopedAttempt.status, unscopedAttempt.body, settings.oauth2ClientId);
          }
        } else if (!isInvalidClient(scopedAttempt.status, scopedAttempt.body)) {
          throw buildTokenError(scopedAttempt.status, scopedAttempt.body, settings.oauth2ClientId);
        }

        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= invalidClientMaxWaitMs) {
          throw buildTokenError(scopedAttempt.status, scopedAttempt.body, settings.oauth2ClientId);
        }

        await sleepFn(invalidClientRetryDelayMs);
      }
    },
  };
}

async function requestWithFallback(apiClient: LiferayApiClient, settings: LiferayAuthConfig, scope: string) {
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
    throw new CliError(`Respuesta OAuth2 inválida para clientId=${clientId}.`, {code: 'LIFERAY_AUTH_ERROR'});
  }

  if (!isTokenPayload(parsed)) {
    throw new CliError(`Respuesta OAuth2 sin access_token para clientId=${clientId}.`, {code: 'LIFERAY_AUTH_ERROR'});
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
  return new CliError(`Token request failed (${status}) con clientId=${clientId}: ${sanitizeBody(body)}`, {
    code: 'LIFERAY_AUTH_ERROR',
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

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}
