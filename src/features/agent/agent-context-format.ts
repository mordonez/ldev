import path from 'node:path';

import type {AgentContextReport} from './agent-context-types.js';

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

function oauthMarker(report: AgentContextReport): string {
  const oauth = report.liferay.auth.oauth2;
  return oauth.clientId.status === 'present' && oauth.clientSecret.status === 'present' ? 'yes' : 'no';
}
