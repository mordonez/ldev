export type ResolvedLiferayConfigInput = {
  processEnv: NodeJS.ProcessEnv;
  dockerEnv: Record<string, string>;
  profile: Record<string, string>;
};

const DEFAULT_SCOPE_ALIASES = [
  'Liferay.Headless.Admin.User.everything.read',
  'Liferay.Data.Engine.REST.everything.read',
  'Liferay.Data.Engine.REST.everything.write',
  'Liferay.Headless.Delivery.everything.read',
  'Liferay.Headless.Delivery.everything.write',
  'Liferay.Headless.Admin.Content.everything.read',
  'liferay-json-web-services.everything.read',
  'liferay-json-web-services.everything.write',
].join(',');

export function resolveLiferayConfig(input: ResolvedLiferayConfigInput) {
  const {processEnv, dockerEnv, profile} = input;

  const rawBindIp = dockerEnv.BIND_IP?.trim();
  const hasSpecificBindIp =
    rawBindIp !== undefined && rawBindIp !== '' && !['0.0.0.0', '127.0.0.1', 'localhost'].includes(rawBindIp);
  const bindIp = hasSpecificBindIp ? rawBindIp : 'localhost';
  const httpPort = dockerEnv.LIFERAY_HTTP_PORT ?? '8080';
  const bindIpUrl = hasSpecificBindIp ? `http://${bindIp}:${httpPort}` : undefined;
  const fallbackUrl = `http://${bindIp}:${httpPort}`;

  return {
    url: processEnv.LIFERAY_CLI_URL ?? dockerEnv.LIFERAY_CLI_URL ?? bindIpUrl ?? profile['liferay.url'] ?? fallbackUrl,
    oauth2ClientId:
      processEnv.LIFERAY_CLI_OAUTH2_CLIENT_ID ??
      dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_ID ??
      profile['liferay.oauth2.clientId'] ??
      '',
    oauth2ClientSecret:
      processEnv.LIFERAY_CLI_OAUTH2_CLIENT_SECRET ??
      dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_SECRET ??
      profile['liferay.oauth2.clientSecret'] ??
      '',
    scopeAliases:
      processEnv.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES ??
      dockerEnv.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES ??
      profile['liferay.oauth2.scopeAliases'] ??
      DEFAULT_SCOPE_ALIASES,
    timeoutSeconds: parsePositiveInt(
      processEnv.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS ??
        dockerEnv.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS ??
        profile['liferay.oauth2.timeoutSeconds'],
      30,
    ),
  };
}

function parsePositiveInt(rawValue: string | undefined, fallbackValue: number): number {
  if (!rawValue) {
    return fallbackValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}
