import type {ProjectContext} from '../../core/config/project-context.js';
import type {Presence} from './agent-context-types.js';

const OAUTH_CREDENTIAL_KEYS = {
  clientId: {
    profile: 'liferay.oauth2.clientId',
    dockerEnv: 'LIFERAY_CLI_OAUTH2_CLIENT_ID',
  },
  clientSecret: {
    profile: 'liferay.oauth2.clientSecret',
    dockerEnv: 'LIFERAY_CLI_OAUTH2_CLIENT_SECRET',
  },
} as const;

export function presence(value: string, source: Presence['source']): Presence {
  return {
    status: value.trim() === '' ? 'missing' : 'present',
    source,
  };
}

export function resolveOAuthCredentialSource(
  project: ProjectContext,
  credential: keyof typeof OAUTH_CREDENTIAL_KEYS,
): Presence['source'] {
  const keys = OAUTH_CREDENTIAL_KEYS[credential];
  if (hasKey(project.values.localProfile, keys.profile)) {
    return 'localProfile';
  }
  if (hasKey(project.values.dockerEnv, keys.dockerEnv)) {
    return 'dockerEnv';
  }
  if (hasKey(project.values.profile, keys.profile)) {
    return 'profile';
  }
  return 'fallback';
}

export function normalizeLiferayVersion(version: string | null): string | null {
  if (!version) {
    return null;
  }
  return version
    .replace(/^liferay\/(?:dxp|portal):/i, '')
    .replace(/^dxp-?/i, '')
    .replace(/^portal-?/i, '')
    .replace(/-lts$/i, '');
}

export function detectLiferayEdition(value: string | null): 'dxp' | 'portal' | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('dxp')) {
    return 'dxp';
  }
  if (normalized.includes('portal')) {
    return 'portal';
  }
  return null;
}

export function collapseHome(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const home = process.env.HOME || process.env.USERPROFILE;
  return home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

function hasKey(values: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}
