import {createOAuthTokenClient} from '../../core/http/auth.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthInstallResult} from './oauth-install.js';

export async function verifyProvisionedOAuthInstall(
  config: AppConfig,
  credentials: {
    clientId: string;
    clientSecret: string;
  },
): Promise<OAuthInstallResult['verification']> {
  if (!config.liferay.url || config.liferay.url.trim() === '') {
    return {
      attempted: false,
      verified: false,
      sanitized: false,
      tokenType: null,
      expiresIn: null,
      error: null,
    };
  }

  try {
    const tokenClient = createOAuthTokenClient({
      invalidClientRetryDelayMs: 3000,
      invalidClientMaxWaitMs: 30000,
    });
    const token = await tokenClient.fetchClientCredentialsToken({
      ...config.liferay,
      oauth2ClientId: credentials.clientId,
      oauth2ClientSecret: credentials.clientSecret,
    });

    return {
      attempted: true,
      verified: true,
      sanitized: false,
      tokenType: token.tokenType,
      expiresIn: token.expiresIn,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      verified: false,
      sanitized: false,
      tokenType: null,
      expiresIn: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function shouldSanitizeProvisionedOAuthConfig(verification: OAuthInstallResult['verification']): boolean {
  if (verification.verified) {
    return true;
  }

  if (!verification.attempted || !verification.error) {
    return false;
  }

  const normalized = verification.error.toLowerCase();

  return normalized.includes('token request failed (');
}

export function shouldPersistProvisionedOAuthCredentials(verification: OAuthInstallResult['verification']): boolean {
  if (verification.verified || !verification.attempted) {
    return true;
  }

  return Boolean(verification.error) && !shouldSanitizeProvisionedOAuthConfig(verification);
}
