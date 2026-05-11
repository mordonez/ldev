export const DEFAULT_OAUTH_SCOPE_ALIASES = [
  'Liferay.Headless.Admin.User.everything.read',
  'Liferay.Headless.Admin.Content.everything.read',
  'Liferay.Headless.Admin.Content.everything.write',
  'Liferay.Headless.Admin.Site.everything.read',
  'Liferay.Headless.Admin.Site.everything.write',
  'Liferay.Data.Engine.REST.everything.read',
  'Liferay.Data.Engine.REST.everything.write',
  'Liferay.Headless.Delivery.everything.read',
  'Liferay.Headless.Delivery.everything.write',
  'liferay-json-web-services.everything.read',
  'liferay-json-web-services.everything.write',
  'Liferay.Headless.Discovery.API.everything.read',
  'Liferay.Headless.Discovery.OpenAPI.everything.read',
] as const;

const MANAGED_OAUTH_SCOPE_ALIASES = DEFAULT_OAUTH_SCOPE_ALIASES;

export const PORTAL_INVENTORY_SCOPE_ALIAS = 'Liferay.Headless.Admin.Site.everything.read';

export const OAUTH_SCOPE_PROFILES = {
  'content-authoring': [
    'Liferay.Headless.Admin.Content.everything.read',
    'Liferay.Headless.Admin.Content.everything.write',
  ],
  'site-admin': ['Liferay.Headless.Admin.Site.everything.write', 'Liferay.Headless.Admin.User.everything.write'],
  objects: [
    'Liferay.Object.Admin.REST.everything.read',
    'Liferay.Object.Admin.REST.everything.write',
    'Liferay.Headless.Object.everything.read',
    'Liferay.Headless.Object.everything.write',
  ],
  'max-test': [
    'Liferay.Headless.Admin.Content.everything.read',
    'Liferay.Headless.Admin.Content.everything.write',
    'Liferay.Headless.Admin.Site.everything.write',
    'Liferay.Headless.Admin.User.everything.write',
    'Liferay.Object.Admin.REST.everything.read',
    'Liferay.Object.Admin.REST.everything.write',
    'Liferay.Headless.Object.everything.read',
    'Liferay.Headless.Object.everything.write',
  ],
} as const;

export type OAuthScopeProfileName = keyof typeof OAUTH_SCOPE_PROFILES;

export function resolveManagedOAuthScopeAliases(scopeAliases: Iterable<string | null | undefined>): string[] {
  const aliases = new Set<string>();

  for (const scopeAlias of MANAGED_OAUTH_SCOPE_ALIASES) {
    aliases.add(scopeAlias);
  }

  for (const scopeAlias of scopeAliases) {
    const normalizedScopeAlias = scopeAlias?.trim();

    if (normalizedScopeAlias) {
      aliases.add(normalizedScopeAlias);
    }
  }

  return Array.from(aliases);
}

export function resolveOAuthScopeProfileNames(): OAuthScopeProfileName[] {
  return Object.keys(OAUTH_SCOPE_PROFILES) as OAuthScopeProfileName[];
}

export function resolveOAuthScopeProfileAliases(profileNames: Iterable<OAuthScopeProfileName>): string[] {
  const aliases: string[] = [];

  for (const profileName of profileNames) {
    aliases.push(...OAUTH_SCOPE_PROFILES[profileName]);
  }

  return resolveManagedOAuthScopeAliases(aliases);
}

export const DEFAULT_OAUTH_SCOPE_ALIASES_STRING = DEFAULT_OAUTH_SCOPE_ALIASES.join(',');
