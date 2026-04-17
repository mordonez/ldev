import {CliError} from '../../core/errors.js';
import {writeLocalLiferayProfile} from '../../core/config/liferay-profile.js';

export async function writeCredentialsToLocalProfile(
  localProfileFile: string | null,
  clientId: string,
  clientSecret: string,
  scopeAliases?: string[],
): Promise<boolean> {
  if (!localProfileFile) {
    throw new CliError('No .liferay-cli.local.yml was detected to persist OAuth2 credentials.', {
      code: 'OAUTH_LOCAL_PROFILE_NOT_FOUND',
    });
  }

  await writeLocalLiferayProfile(localProfileFile, {
    oauth2ClientId: clientId,
    oauth2ClientSecret: clientSecret,
    ...(scopeAliases ? {oauth2ScopeAliases: scopeAliases.join(',')} : {}),
  });

  return true;
}
