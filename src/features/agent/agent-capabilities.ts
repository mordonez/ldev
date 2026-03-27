import type {AppConfig} from '../../core/config/load-config.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import {runDoctor, type DoctorReport, type DoctorToolStatus} from '../doctor/doctor.service.js';

export type AgentCapabilityStatus = {
  supported: boolean;
  requires: string[];
  missing: string[];
};

export type AgentCapabilitiesReport = {
  ok: true;
  contractVersion: '1';
  platform: PlatformCapabilities;
  tools: DoctorReport['tools'];
  environment: DoctorReport['environment'];
  config: {
    liferayUrlConfigured: boolean;
    liferayOauth2Configured: boolean;
    scopeAliasesCount: number;
  };
  commands: {
    doctor: AgentCapabilityStatus;
    context: AgentCapabilityStatus;
    setup: AgentCapabilityStatus;
    start: AgentCapabilityStatus;
    stop: AgentCapabilityStatus;
    status: AgentCapabilityStatus;
    logs: AgentCapabilityStatus;
    shell: AgentCapabilityStatus;
    project: AgentCapabilityStatus;
    env: AgentCapabilityStatus;
    deploy: AgentCapabilityStatus;
    db: AgentCapabilityStatus;
    worktree: AgentCapabilityStatus;
    liferay: AgentCapabilityStatus;
    osgi: AgentCapabilityStatus;
    reindex: AgentCapabilityStatus;
    ai: AgentCapabilityStatus;
  };
};

export async function runAgentCapabilities(
  cwd: string,
  options?: {
    config?: AppConfig;
    env?: NodeJS.ProcessEnv;
    doctorReport?: DoctorReport;
  },
): Promise<AgentCapabilitiesReport> {
  const doctorReport = options?.doctorReport ?? await runDoctor(cwd, {
    config: options?.config,
    env: options?.env,
  });

  const repoReady = doctorReport.environment.inRepo;
  const liferayUrlConfigured = doctorReport.config.liferay.url.trim() !== '';
  const liferayOauth2Configured =
    doctorReport.config.liferay.oauth2ClientIdConfigured &&
    doctorReport.config.liferay.oauth2ClientSecretConfigured;

  return {
    ok: true,
    contractVersion: '1',
    platform: doctorReport.capabilities,
    tools: doctorReport.tools,
    environment: doctorReport.environment,
    config: {
      liferayUrlConfigured,
      liferayOauth2Configured,
      scopeAliasesCount: doctorReport.config.liferay.scopeAliasesCount,
    },
    commands: {
      doctor: capabilityStatus(),
      context: capabilityStatus(),
      setup: capabilityStatus(repoRequirement(repoReady), dockerToolReady(doctorReport.tools.docker), dockerComposeToolReady(doctorReport.tools.dockerCompose)),
      start: capabilityStatus(repoRequirement(repoReady), dockerToolReady(doctorReport.tools.docker), dockerComposeToolReady(doctorReport.tools.dockerCompose)),
      stop: capabilityStatus(repoRequirement(repoReady), dockerToolReady(doctorReport.tools.docker), dockerComposeToolReady(doctorReport.tools.dockerCompose)),
      status: capabilityStatus(repoRequirement(repoReady), dockerToolReady(doctorReport.tools.docker), dockerComposeToolReady(doctorReport.tools.dockerCompose)),
      logs: capabilityStatus(repoRequirement(repoReady), dockerToolReady(doctorReport.tools.docker), dockerComposeToolReady(doctorReport.tools.dockerCompose)),
      shell: capabilityStatus(repoRequirement(repoReady), dockerToolReady(doctorReport.tools.docker), dockerComposeToolReady(doctorReport.tools.dockerCompose)),
      project: capabilityStatus(),
      env: capabilityStatus(repoRequirement(repoReady)),
      deploy: capabilityStatus(repoRequirement(repoReady)),
      db: capabilityStatus(repoRequirement(repoReady)),
      worktree: capabilityStatus(repoRequirement(repoReady), capabilityRequirement(doctorReport.capabilities.supportsWorktrees, 'git-worktrees')),
      liferay: capabilityStatus(repoRequirement(repoReady), capabilityRequirement(liferayUrlConfigured, 'liferay-url')),
      osgi: capabilityStatus(repoRequirement(repoReady), dockerToolReady(doctorReport.tools.docker), dockerComposeToolReady(doctorReport.tools.dockerCompose)),
      reindex: capabilityStatus(repoRequirement(repoReady), capabilityRequirement(liferayUrlConfigured, 'liferay-url'), capabilityRequirement(liferayOauth2Configured, 'liferay-oauth2')),
      ai: capabilityStatus(),
    },
  };
}

export function formatAgentCapabilities(report: AgentCapabilitiesReport): string {
  return [
    `Contract: agent-v${report.contractVersion}`,
    `Repo detected: ${report.environment.inRepo ? 'yes' : 'no'}`,
    `Docker compose ready: ${report.commands.start.supported ? 'yes' : 'no'}`,
    `Liferay API ready: ${report.commands.liferay.supported ? 'yes' : 'no'}`,
    `OAuth2 ready: ${report.config.liferayOauth2Configured ? 'yes' : 'no'}`,
    `Worktrees: ${report.commands.worktree.supported ? 'yes' : 'no'}`,
  ].join('\n');
}

function capabilityStatus(...requirements: AgentRequirement[]): AgentCapabilityStatus {
  const requires = requirements.map((requirement) => requirement.name);
  const missing = requirements
    .filter((requirement) => !requirement.available)
    .map((requirement) => requirement.name);

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

function dockerToolReady(tool: DoctorToolStatus): AgentRequirement {
  return capabilityRequirement(tool.available, 'docker');
}

function dockerComposeToolReady(tool: DoctorToolStatus): AgentRequirement {
  return capabilityRequirement(tool.available, 'docker-compose');
}
