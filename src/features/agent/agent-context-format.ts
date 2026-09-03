import path from 'node:path';

import type {ProjectContext} from '../../core/config/project-context.js';
import type {AgentContextReport, Presence} from './agent-context-types.js';

export function formatAgentContext(report: AgentContextReport): string {
  const tools = Object.entries(report.platform.tools)
    .filter(([, available]) => available)
    .map(([name]) => name);
  const missingTools = Object.entries(report.platform.tools)
    .filter(([, available]) => !available)
    .map(([name]) => name);
  const commands = Object.entries(report.commands)
    .filter(([, command]) => command.supported)
    .map(([name]) => name);

  return [
    `${path.basename(report.project.root ?? report.project.cwd)} | ${report.project.type} | ${report.liferay.product ?? 'liferay'} | branch ${report.project.branch ?? 'n/a'}`,
    `Portal:   ${report.liferay.portalUrl ?? 'n/a'}   (oauth2 ${oauthMarker(report)}  scopes ${report.liferay.auth.oauth2.scopes})`,
    `Modules:  ${report.inventory.modules.count}   Themes: ${report.inventory.themes.count}   CE: ${report.inventory.clientExtensions.count}   WARs: ${report.inventory.wars.count}`,
    `Resources: ${report.paths.resources.structures.count} structures | ${report.paths.resources.templates.count} templates | ${report.paths.resources.adts.count} adts | ${report.paths.resources.fragments.count} fragments | ${report.paths.resources.migrations.count} migrations`,
    `Tools:    ${tools.join(' ') || 'none'}${missingTools.length > 0 ? `  (missing: ${missingTools.join(', ')})` : ''}`,
    `Commands: ${commands.join(', ') || 'none'} available`,
    `Issues:   ${report.issues.length}`,
  ].join('\n');
}

export function presence(value: string, source: Presence['source']): Presence {
  return {
    status: value.trim() === '' ? 'missing' : 'present',
    source,
  };
}

export function resolveClientIdSource(project: ProjectContext): Presence['source'] {
  if (hasKey(project.values.localProfile, 'liferay.oauth2.clientId')) {
    return 'localProfile';
  }
  if (hasKey(project.values.dockerEnv, 'LIFERAY_CLI_OAUTH2_CLIENT_ID')) {
    return 'dockerEnv';
  }
  if (hasKey(project.values.profile, 'liferay.oauth2.clientId')) {
    return 'profile';
  }
  return 'fallback';
}

export function resolveClientSecretSource(project: ProjectContext): Presence['source'] {
  if (hasKey(project.values.localProfile, 'liferay.oauth2.clientSecret')) {
    return 'localProfile';
  }
  if (hasKey(project.values.dockerEnv, 'LIFERAY_CLI_OAUTH2_CLIENT_SECRET')) {
    return 'dockerEnv';
  }
  if (hasKey(project.values.profile, 'liferay.oauth2.clientSecret')) {
    return 'profile';
  }
  return 'fallback';
}

function hasKey(values: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
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

function oauthMarker(report: AgentContextReport): string {
  const oauth = report.liferay.auth.oauth2;
  return oauth.clientId.status === 'present' && oauth.clientSecret.status === 'present' ? 'yes' : 'no';
}
