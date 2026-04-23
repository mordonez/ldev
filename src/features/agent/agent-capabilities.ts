import type {AppConfig} from '../../core/config/load-config.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {resolveProjectContext} from '../../core/config/project-context.js';

export type AgentCapabilityStatus = {
  supported: boolean;
  requires: string[];
  missing: string[];
};

export type AgentCapabilitiesReport = {
  ok: true;
  contractVersion: 2;
  platform: PlatformCapabilities;
  commands: Record<string, AgentCapabilityStatus>;
};

export async function runAgentCapabilities(
  cwd: string,
  options?: {
    config?: AppConfig;
    env?: NodeJS.ProcessEnv;
  },
): Promise<AgentCapabilitiesReport> {
  const project = resolveProjectContext({cwd, env: options?.env});
  const config = options?.config ?? project.config;
  const platform = await detectCapabilities(cwd, {processEnv: options?.env});
  const repoReady = project.repo.inRepo;
  const nativeRuntimeReady = project.projectType === 'ldev-native' && repoReady;
  const workspaceRuntimeReady = project.projectType === 'blade-workspace' && repoReady && platform.hasBlade;
  const liferayUrlConfigured = config.liferay.url.trim() !== '';
  const liferayOauth2Configured =
    config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== '';

  return {
    ok: true,
    contractVersion: 2,
    platform,
    commands: {
      setup: capabilityStatus(
        capabilityRequirement(project.projectType === 'ldev-native', 'ldev-native-runtime'),
        repoRequirement(repoReady),
        capabilityRequirement(platform.hasDocker, 'docker'),
        capabilityRequirement(platform.hasDockerCompose, 'docker-compose'),
      ),
      start: capabilityStatus(capabilityRequirement(nativeRuntimeReady || workspaceRuntimeReady, 'runtime-adapter')),
      deploy: capabilityStatus(capabilityRequirement(nativeRuntimeReady || workspaceRuntimeReady, 'runtime-adapter')),
      reindex: capabilityStatus(
        repoRequirement(repoReady),
        capabilityRequirement(project.projectType === 'ldev-native', 'ldev-native-runtime'),
        capabilityRequirement(liferayUrlConfigured, 'liferay-url'),
        capabilityRequirement(liferayOauth2Configured, 'liferay-oauth2'),
      ),
      osgi: capabilityStatus(
        repoRequirement(repoReady),
        capabilityRequirement(project.projectType === 'ldev-native', 'ldev-native-runtime'),
        capabilityRequirement(platform.hasDocker, 'docker'),
        capabilityRequirement(platform.hasDockerCompose, 'docker-compose'),
      ),
    },
  };
}

export function formatAgentCapabilities(report: AgentCapabilitiesReport): string {
  return [
    `Contract: agent-v${report.contractVersion}`,
    `Docker compose ready: ${report.commands.start.supported ? 'yes' : 'no'}`,
    `Reindex ready: ${report.commands.reindex.supported ? 'yes' : 'no'}`,
    `Worktrees: ${report.platform.supportsWorktrees ? 'yes' : 'no'}`,
  ].join('\n');
}

function capabilityStatus(...requirements: AgentRequirement[]): AgentCapabilityStatus {
  const requires = requirements.map((requirement) => requirement.name);
  const missing = requirements.filter((requirement) => !requirement.available).map((requirement) => requirement.name);

  return {
    supported: missing.length === 0,
    requires,
    missing,
  };
}

type AgentRequirement = {
  name: string;
  available: boolean;
};

function repoRequirement(available: boolean): AgentRequirement {
  return capabilityRequirement(available, 'repo');
}

function capabilityRequirement(available: boolean, name: string): AgentRequirement {
  return {name, available};
}
