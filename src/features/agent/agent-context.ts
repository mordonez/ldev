import type {AppConfig} from '../../core/config/load-config.js';
import type {ProjectContext} from '../../core/config/project-context.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {getCurrentBranchName, getGitCommonDir, isWorktree} from '../../core/platform/git.js';
import {runProcess} from '../../core/platform/process.js';
import {collectEnvStatus} from '../env/env-health.js';
import {resolveEnvContext} from '../env/env-files.js';
import {runAiStatus} from '../ai/ai-status.js';
import {runAgentCapabilities, type AgentCapabilitiesReport} from './agent-capabilities.js';

export type AgentContextReport = {
  ok: true;
  contractVersion: '1';
  cwd: string;
  projectType: string;
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
  workspace: {
    product: string | null;
  };
  ai: {
    manifestPresent: boolean;
    managedRules: number;
    modifiedRules: number;
    staleRuntimeRules: number;
    warnings: string[];
  };
  platform: PlatformCapabilities;
  commands: AgentCapabilitiesReport['commands'];
  issues: {
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
  }[];
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
  const capabilities = await runAgentCapabilities(cwd, {config, env: process.env});
  const aiStatus = await runAiStatus(project.cwd);
  const issues = await collectAgentIssues(config, project.projectType);

  return {
    ok: true,
    contractVersion: '1',
    cwd: project.cwd,
    projectType: project.projectType,
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
    workspace: {
      product: project.workspace.product,
    },
    ai: {
      manifestPresent: aiStatus.manifestPresent,
      managedRules: aiStatus.summary.managedRules,
      modifiedRules: aiStatus.summary.modified,
      staleRuntimeRules: aiStatus.summary.staleRuntime,
      warnings: aiStatus.warnings,
    },
    platform,
    commands: capabilities.commands,
    issues,
  };
}

export function formatAgentContext(report: AgentContextReport): string {
  return [
    `Contract: agent-v${report.contractVersion}`,
    `Project type: ${report.projectType}`,
    `Repo: ${report.repo.root ?? 'not-detected'}`,
    `Branch: ${report.repo.branch ?? 'n/a'}`,
    `Worktree: ${report.repo.isWorktree ? 'yes' : 'no'}`,
    `Portal URL: ${report.env.portalUrl ?? report.liferay.url}`,
    `Compose project: ${report.env.composeProjectName ?? 'n/a'}`,
    `OAuth2 configured: ${report.liferay.oauth2Configured ? 'yes' : 'no'}`,
    `AI rules manifest: ${report.ai.manifestPresent ? 'yes' : 'no'}`,
    `Issues: ${report.issues.length}`,
  ].join('\n');
}

async function collectAgentIssues(
  config: AppConfig,
  projectType: string,
): Promise<{code: string; severity: 'info' | 'warning' | 'error'; message: string}[]> {
  if (projectType === 'blade-workspace') {
    return [
      {
        code: 'workspace-runtime-pending',
        severity: 'info',
        message: 'Blade workspace detected; runtime readiness is partial until the workspace adapter is implemented.',
      },
    ];
  }

  if (!config.repoRoot || !config.dockerDir || !config.liferayDir) {
    return [{code: 'repo-missing', severity: 'error', message: 'No valid project was detected'}];
  }

  const issues: {code: string; severity: 'info' | 'warning' | 'error'; message: string}[] = [];
  const envContext = resolveEnvContext(config);
  const status = await collectEnvStatus(envContext, {processEnv: process.env}).catch(() => null);

  if (status) {
    if (!status.portalReachable) {
      issues.push({code: 'portal-unreachable', severity: 'warning', message: 'El portal no responde en la URL local'});
    }

    if (!status.liferay || status.liferay.state !== 'running') {
      issues.push({
        code: 'liferay-not-running',
        severity: 'error',
        message: 'The Liferay container is not running',
      });
    } else if (status.liferay.health && status.liferay.health !== 'healthy') {
      issues.push({
        code: 'liferay-unhealthy',
        severity: 'warning',
        message: `Health de Liferay=${status.liferay.health}`,
      });
    }

    const resolvedBundles = await detectResolvedBundles(config.dockerDir);
    if (resolvedBundles > 0) {
      issues.push({
        code: 'osgi-resolved-bundles',
        severity: 'warning',
        message: `Se detectaron bundles OSGi en estado RESOLVED: ${resolvedBundles}`,
      });
    }
  }

  const diskResult = await runProcess('df', ['-P', envContext.dataRoot], {reject: false}).catch(() => null);
  const usageLine = diskResult?.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')[1];
  const usedPct = Number.parseInt(usageLine?.split(/\s+/)[4]?.replace('%', '') ?? '', 10);
  if (Number.isFinite(usedPct) && usedPct >= 90) {
    issues.push({code: 'disk-high', severity: 'warning', message: `Disco alto en Docker data root: ${usedPct}%`});
  }

  return issues;
}

async function detectResolvedBundles(dockerDir: string): Promise<number> {
  const result = await runProcess(
    'docker',
    ['compose', 'exec', '-T', 'liferay', 'sh', '-lc', 'echo "lb -s" | telnet localhost 11311 || true'],
    {cwd: dockerDir, reject: false},
  );
  if (!result.ok) {
    return 0;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.includes('|resolved|')).length;
}
