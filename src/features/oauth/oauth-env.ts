import {CliError} from '../../core/errors.js';
import {writeLocalLiferayProfile} from '../../core/config/liferay-profile.js';

export async function writeCredentialsToLocalProfile(
  localProfileFile: string | null,
  clientId: string,
  clientSecret: string,
  scopeAliases?: string[],
): Promise<boolean> {
  if (!localProfileFile) {
    throw new CliError('No se ha detectado .liferay-cli.local.yml para persistir las credenciales OAuth2.', {
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
