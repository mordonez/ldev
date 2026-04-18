import {OAuthErrors} from './errors/index.js';
import {writeLocalLiferayProfile} from '../../core/config/liferay-profile.js';

export async function writeCredentialsToLocalProfile(
  localProfileFile: string | null,
  clientId: string,
  clientSecret: string,
  scopeAliases?: string[],
): Promise<boolean> {
  if (!localProfileFile) {
    throw OAuthErrors.localProfileNotFound('No .liferay-cli.local.yml was detected to persist OAuth2 credentials.');
  }

  await writeLocalLiferayProfile(localProfileFile, {
    oauth2ClientId: clientId,
    oauth2ClientSecret: clientSecret,
    ...(scopeAliases ? {oauth2ScopeAliases: scopeAliases.join(',')} : {}),
  });

  return true;
}
