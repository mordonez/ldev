import type {AppConfig} from '../../core/config/load-config.js';
import type {ProjectContext} from '../../core/config/project-context.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {getCurrentBranchName, getGitCommonDir, isWorktree} from '../../core/platform/git.js';

export type AgentContextReport = {
  ok: true;
  contractVersion: '1';
  cwd: string;
  repo: {
    root: string | null;
    inRepo: boolean;
    isWorktree: boolean;
    branch: string | null;
    gitCommonDir: string | null;
  };
  files: {
    dockerDir: string | null;
    liferayDir: string | null;
    dockerEnv: string | null;
    liferayProfile: string | null;
  };
  paths: {
    structures: string | null;
    templates: string | null;
    adts: string | null;
    fragments: string | null;
    migrations: string | null;
  };
  env: {
    composeProjectName: string | null;
    dataRoot: string | null;
    bindIp: string | null;
    httpPort: string | null;
    portalUrl: string | null;
  };
  liferay: {
    url: string;
    oauth2Configured: boolean;
    oauth2ClientIdConfigured: boolean;
    oauth2ClientSecretConfigured: boolean;
    scopeAliases: string[];
    scopeAliasesCount: number;
    timeoutSeconds: number;
  };
  platform: PlatformCapabilities;
};

export async function runAgentContext(
  cwd: string,
  options?: {
    config?: AppConfig;
    project?: ProjectContext;
    detectCapabilitiesFn?: typeof detectCapabilities;
    getCurrentBranchNameFn?: typeof getCurrentBranchName;
    getGitCommonDirFn?: typeof getGitCommonDir;
    isWorktreeFn?: typeof isWorktree;
  },
): Promise<AgentContextReport> {
  const project = options?.project ?? resolveProjectContext({cwd});
  const config = options?.config ?? project.config;
  const detectCapabilitiesFn = options?.detectCapabilitiesFn ?? detectCapabilities;
  const getCurrentBranchNameFn = options?.getCurrentBranchNameFn ?? getCurrentBranchName;
  const getGitCommonDirFn = options?.getGitCommonDirFn ?? getGitCommonDir;
  const isWorktreeFn = options?.isWorktreeFn ?? isWorktree;

  const inRepo = project.repo.inRepo;
  const [platform, branch, gitCommonDir, worktree] = await Promise.all([
    detectCapabilitiesFn(cwd),
    inRepo ? getCurrentBranchNameFn(cwd) : Promise.resolve(null),
    inRepo ? getGitCommonDirFn(cwd) : Promise.resolve(null),
    inRepo ? isWorktreeFn(cwd) : Promise.resolve(false),
  ]);

  return {
    ok: true,
    contractVersion: '1',
    cwd: project.cwd,
    repo: {
      root: project.repo.root,
      inRepo,
      isWorktree: worktree,
      branch,
      gitCommonDir,
    },
    files: {
      dockerDir: project.repo.dockerDir,
      liferayDir: project.repo.liferayDir,
      dockerEnv: project.files.dockerEnv,
      liferayProfile: project.files.liferayProfile,
    },
    paths: {
      structures: project.paths.structures,
      templates: project.paths.templates,
      adts: project.paths.adts,
      fragments: project.paths.fragments,
      migrations: project.paths.migrations,
    },
    env: {
      composeProjectName: project.env.composeProjectName,
      dataRoot: project.env.dataRoot,
      bindIp: project.env.bindIp,
      httpPort: project.env.httpPort,
      portalUrl: project.env.portalUrl,
    },
    liferay: {
      url: config.liferay.url,
      oauth2Configured: project.liferay.oauth2Configured,
      oauth2ClientIdConfigured: config.liferay.oauth2ClientId.trim() !== '',
      oauth2ClientSecretConfigured: config.liferay.oauth2ClientSecret.trim() !== '',
      scopeAliases: project.liferay.scopeAliasesList,
      scopeAliasesCount: project.liferay.scopeAliasesList.length,
      timeoutSeconds: config.liferay.timeoutSeconds,
    },
    platform,
  };
}

export function formatAgentContext(report: AgentContextReport): string {
  return [
    `Contract: agent-v${report.contractVersion}`,
    `Repo: ${report.repo.root ?? 'not-detected'}`,
    `Branch: ${report.repo.branch ?? 'n/a'}`,
    `Worktree: ${report.repo.isWorktree ? 'yes' : 'no'}`,
    `Portal URL: ${report.env.portalUrl ?? report.liferay.url}`,
    `Compose project: ${report.env.composeProjectName ?? 'n/a'}`,
    `OAuth2 configured: ${report.liferay.oauth2Configured ? 'yes' : 'no'}`,
  ].join('\n');
}
