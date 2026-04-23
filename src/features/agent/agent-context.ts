import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import type {ProjectContext} from '../../core/config/project-context.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {getCurrentBranchName, isWorktree} from '../../core/platform/git.js';
import {runAiStatus} from '../ai/ai-status.js';
import type {AgentContextReport, CommandStatus, Presence} from './agent-context-types.js';

export type {AgentContextReport};

export async function runAgentContext(
  cwd: string,
  options?: {
    config?: AppConfig;
    project?: ProjectContext;
    detectCapabilitiesFn?: typeof detectCapabilities;
    getCurrentBranchNameFn?: typeof getCurrentBranchName;
    isWorktreeFn?: typeof isWorktree;
  },
): Promise<AgentContextReport> {
  const project = options?.project ?? resolveProjectContext({cwd});
  const config = options?.config ?? project.config;
  const detectCapabilitiesFn = options?.detectCapabilitiesFn ?? detectCapabilities;
  const getCurrentBranchNameFn = options?.getCurrentBranchNameFn ?? getCurrentBranchName;
  const isWorktreeFn = options?.isWorktreeFn ?? isWorktree;
  const inRepo = project.repo.inRepo;

  const [platform, branch, worktree, aiStatus] = await Promise.all([
    detectCapabilitiesFn(cwd),
    inRepo ? getCurrentBranchNameFn(cwd) : Promise.resolve(null),
    inRepo ? isWorktreeFn(cwd) : Promise.resolve(false),
    runAiStatus(project.cwd),
  ]);

  return {
    ok: true,
    contractVersion: 2,
    generatedAt: new Date().toISOString(),
    project: {
      type: project.projectType,
      cwd: project.cwd,
      root: project.repo.root,
      branch,
      isWorktree: worktree,
      worktreeRoot: worktree ? project.repo.root : null,
    },
    liferay: {
      product: project.inventory.liferay.product,
      version: normalizeLiferayVersion(project.inventory.liferay.version),
      edition: detectLiferayEdition(project.inventory.liferay.product ?? project.inventory.liferay.image),
      image: project.inventory.liferay.image,
      portalUrl: project.env.portalUrl ?? config.liferay.url,
      auth: {
        oauth2: {
          clientId: presence(config.liferay.oauth2ClientId, resolveClientIdSource(project)),
          clientSecret: presence(config.liferay.oauth2ClientSecret, resolveClientSecretSource(project)),
          scopes: project.liferay.scopeAliasesList.length,
        },
      },
      timeoutSeconds: config.liferay.timeoutSeconds,
    },
    paths: {
      dockerDir: project.repo.dockerDir,
      liferayDir: project.repo.liferayDir,
      dockerEnv: project.files.dockerEnv,
      liferayProfile: project.files.liferayProfile,
      liferayLocalProfile: project.files.liferayLocalProfile,
      resources: project.inventory.resources,
    },
    runtime: {
      adapter: project.projectType,
      composeFiles: project.inventory.runtime.composeFiles,
      services: project.inventory.runtime.services,
      ports: project.inventory.runtime.ports,
      composeProjectName: project.env.composeProjectName,
      dataRoot: collapseHome(project.env.dataRoot),
    },
    inventory: project.inventory.local,
    ai: {
      manifestPresent: aiStatus.manifestPresent,
      managedRules: aiStatus.summary.managedRules,
      modifiedRules: aiStatus.summary.modified,
      staleRuntimeRules: aiStatus.summary.staleRuntime,
    },
    platform: {
      os: platform.os,
      tools: {
        git: platform.hasGit,
        docker: platform.hasDocker,
        dockerCompose: platform.hasDockerCompose,
        java: platform.hasJava,
        node: platform.hasNode,
        blade: platform.hasBlade,
        lcp: platform.hasLcp,
        playwrightCli: platform.hasPlaywrightCli,
      },
      features: {
        worktrees: platform.supportsWorktrees,
        btrfsSnapshots: platform.supportsBtrfsSnapshots,
      },
    },
    commands: buildContextCommands(project, platform, config),
  };
}

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
  ].join('\n');
}

function buildContextCommands(
  project: ProjectContext,
  platform: PlatformCapabilities,
  config: AppConfig,
): Record<string, CommandStatus> {
  const repoReady = project.repo.inRepo;
  const nativeRuntimeReady = project.projectType === 'ldev-native' && repoReady;
  const workspaceRuntimeReady = project.projectType === 'blade-workspace' && repoReady && platform.hasBlade;
  const liferayUrlConfigured = config.liferay.url.trim() !== '';
  const oauth2Configured =
    config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== '';

  return Object.fromEntries(
    Object.entries({
      setup: commandStatus(
        requirement(project.projectType === 'ldev-native', 'ldev-native-runtime'),
        requirement(repoReady, 'repo'),
        requirement(platform.hasDocker, 'docker'),
        requirement(platform.hasDockerCompose, 'docker-compose'),
      ),
      start: commandStatus(requirement(nativeRuntimeReady || workspaceRuntimeReady, 'runtime-adapter')),
      deploy: commandStatus(requirement(nativeRuntimeReady || workspaceRuntimeReady, 'runtime-adapter')),
      reindex: commandStatus(
        requirement(repoReady, 'repo'),
        requirement(project.projectType === 'ldev-native', 'ldev-native-runtime'),
        requirement(liferayUrlConfigured, 'liferay-url'),
        requirement(oauth2Configured, 'liferay-oauth2'),
      ),
      osgi: commandStatus(
        requirement(repoReady, 'repo'),
        requirement(project.projectType === 'ldev-native', 'ldev-native-runtime'),
        requirement(platform.hasDocker, 'docker'),
        requirement(platform.hasDockerCompose, 'docker-compose'),
      ),
      worktree: commandStatus(requirement(repoReady, 'repo'), requirement(platform.supportsWorktrees, 'git-worktrees')),
      liferay: commandStatus(requirement(repoReady, 'repo'), requirement(liferayUrlConfigured, 'liferay-url')),
    }).filter(([, command]) => command.requires.length > 0),
  );
}

function commandStatus(...requirements: {available: boolean; name: string}[]): CommandStatus {
  return {
    supported: requirements.every((entry) => entry.available),
    requires: requirements.map((entry) => entry.name),
    missing: requirements.filter((entry) => !entry.available).map((entry) => entry.name),
  };
}

function requirement(available: boolean, name: string): {available: boolean; name: string} {
  return {available, name};
}

function presence(value: string, source: Presence['source']): Presence {
  return {
    status: value.trim() === '' ? 'missing' : 'present',
    source,
  };
}

function resolveClientIdSource(project: ProjectContext): Presence['source'] {
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

function resolveClientSecretSource(project: ProjectContext): Presence['source'] {
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

function normalizeLiferayVersion(version: string | null): string | null {
  if (!version) {
    return null;
  }
  return version
    .replace(/^liferay\/(?:dxp|portal):/i, '')
    .replace(/^dxp-?/i, '')
    .replace(/^portal-?/i, '')
    .replace(/-lts$/i, '');
}

function detectLiferayEdition(value: string | null): 'dxp' | 'portal' | null {
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

function collapseHome(value: string | null): string | null {
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
