import {resolveRuntimeNumberConfig, resolveRuntimeStringConfig} from '../../core/config/liferay-runtime-config.js';
import {DEFAULT_OAUTH_SCOPE_ALIASES_STRING} from '../oauth/oauth-scope-aliases.js';

export type ResolvedLiferayConfigInput = {
  processEnv: NodeJS.ProcessEnv;
  dockerEnv: Record<string, string>;
  localProfile: Record<string, string>;
};

export function resolveLiferayConfig(input: ResolvedLiferayConfigInput) {
  const {processEnv, dockerEnv, localProfile} = input;

  const bindIpValue = dockerEnv.BIND_IP;
  const rawBindIp = typeof bindIpValue === 'string' ? bindIpValue.trim() : '';
  const hasSpecificBindIp = rawBindIp !== '' && !['0.0.0.0', '127.0.0.1', 'localhost'].includes(rawBindIp);
  const bindIp = hasSpecificBindIp ? rawBindIp : 'localhost';
  const httpPortValue: unknown = dockerEnv.LIFERAY_HTTP_PORT;
  const httpPort = typeof httpPortValue === 'string' && httpPortValue.trim() !== '' ? httpPortValue.trim() : '8080';
  const bindIpUrl = hasSpecificBindIp ? `http://${bindIp}:${httpPort}` : undefined;
  const fallbackUrl = `http://${bindIp}:${httpPort}`;

  return {
    url: resolveRuntimeStringConfig({
      envValue: processEnv.LIFERAY_CLI_URL,
      localProfileValue: localProfile['liferay.url'],
      dockerEnvValue: dockerEnv.LIFERAY_CLI_URL,
      fallbackValue: bindIpUrl || fallbackUrl,
    }),
    oauth2ClientId: resolveRuntimeStringConfig({
      envValue: processEnv.LIFERAY_CLI_OAUTH2_CLIENT_ID,
      localProfileValue: localProfile['liferay.oauth2.clientId'],
      dockerEnvValue: dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_ID,
      fallbackValue: '',
    }),
    oauth2ClientSecret: resolveRuntimeStringConfig({
      envValue: processEnv.LIFERAY_CLI_OAUTH2_CLIENT_SECRET,
      localProfileValue: localProfile['liferay.oauth2.clientSecret'],
      dockerEnvValue: dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_SECRET,
      fallbackValue: '',
    }),
    scopeAliases: resolveRuntimeStringConfig({
      envValue: processEnv.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES,
      localProfileValue: localProfile['liferay.oauth2.scopeAliases'],
      dockerEnvValue: dockerEnv.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES,
      fallbackValue: DEFAULT_OAUTH_SCOPE_ALIASES_STRING,
    }),
    timeoutSeconds: resolveRuntimeNumberConfig({
      envValue: processEnv.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS,
      localProfileValue: localProfile['liferay.oauth2.timeoutSeconds'],
      dockerEnvValue: dockerEnv.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS,
      fallbackValue: 30,
    }),
  };
}
