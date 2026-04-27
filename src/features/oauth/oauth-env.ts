import {OAuthErrors} from './errors/oauth-error-factory.js';
import {writeLocalLiferayProfile} from '../../core/config/liferay-profile.js';

export function writeCredentialsToLocalProfile(
  localProfileFile: string | null,
  clientId: string,
  clientSecret: string,
  scopeAliases?: string[],
): boolean {
  if (!localProfileFile) {
    throw OAuthErrors.localProfileNotFound('No .liferay-cli.local.yml was detected to persist OAuth2 credentials.');
  }

  writeLocalLiferayProfile(localProfileFile, {
    oauth2ClientId: clientId,
    oauth2ClientSecret: clientSecret,
    ...(scopeAliases ? {oauth2ScopeAliases: scopeAliases.join(',')} : {}),
  });

  return true;
}
