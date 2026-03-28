import fs from 'node:fs';

import YAML from 'yaml';

import type {AppConfig} from '../../core/config/load-config.js';
import {loadConfig} from '../../core/config/load-config.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import {readEnvFile} from '../../core/config/env-file.js';
import {detectRepoPaths} from '../../core/config/repo-paths.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runProcess, type RunProcessResult} from '../../core/platform/process.js';
import {isWorktree} from '../../core/platform/git.js';

type DoctorCheckStatus = 'pass' | 'warn' | 'fail';
type DoctorConfigSource = 'env' | 'dockerEnv' | 'profile' | 'fallback';

type DoctorDependencies = {
  detectCapabilities?: typeof detectCapabilities;
  detectRepoPaths?: typeof detectRepoPaths;
  isWorktree?: typeof isWorktree;
  loadConfig?: typeof loadConfig;
  readEnvFile?: typeof readEnvFile;
  readProfileFile?: (filePath: string) => Record<string, string>;
  runProcess?: typeof runProcess;
};

export type DoctorCheck = {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  summary: string;
  details?: string[];
};

export type DoctorToolStatus = {
  available: boolean;
  version: string | null;
};

export type DoctorReport = {
  ok: boolean;
  summary: {
    passed: number;
    warned: number;
    failed: number;
  };
  capabilities: PlatformCapabilities;
  tools: {
    git: DoctorToolStatus;
    docker: DoctorToolStatus;
    dockerCompose: DoctorToolStatus;
    node: DoctorToolStatus;
    java: DoctorToolStatus;
    lcp: DoctorToolStatus;
  };
  environment: {
    cwd: string;
    repoRoot: string | null;
    inRepo: boolean;
    isWorktree: boolean;
    dockerDir: string | null;
    liferayDir: string | null;
    files: {
      dockerEnv: string | null;
      liferayProfile: string | null;
    };
  };
  config: {
    liferay: {
      url: string;
      oauth2ClientIdConfigured: boolean;
      oauth2ClientSecretConfigured: boolean;
      scopeAliasesCount: number;
      timeoutSeconds: number;
    };
    sources: {
      url: DoctorConfigSource;
      oauth2ClientId: DoctorConfigSource;
      oauth2ClientSecret: DoctorConfigSource;
      scopeAliases: DoctorConfigSource;
      timeoutSeconds: DoctorConfigSource;
    };
  };
  checks: DoctorCheck[];
};

export async function runDoctor(
  cwd: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    config?: AppConfig;
    dependencies?: DoctorDependencies;
  },
): Promise<DoctorReport> {
  const env = options?.env ?? process.env;
  const dependencies = options?.dependencies;
  const detectCapabilitiesFn = dependencies?.detectCapabilities ?? detectCapabilities;
  const detectRepoPathsFn = dependencies?.detectRepoPaths ?? detectRepoPaths;
  const isWorktreeFn = dependencies?.isWorktree ?? isWorktree;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _loadConfigFn = dependencies?.loadConfig ?? loadConfig;
  const readEnvFileFn = dependencies?.readEnvFile ?? readEnvFile;
  const readProfileFileFn = dependencies?.readProfileFile ?? readProfileFile;
  const runProcessFn = dependencies?.runProcess ?? runProcess;

  const capabilities = await detectCapabilitiesFn(cwd);
  const project = resolveProjectContext({
    cwd,
    env,
    dependencies: {
      detectRepoPaths: detectRepoPathsFn,
      readEnvFile: readEnvFileFn,
      readProfileFile: readProfileFileFn,
    },
  });
  const repoPaths = {
    repoRoot: project.repo.root,
    dockerDir: project.repo.dockerDir,
    liferayDir: project.repo.liferayDir,
    dockerEnvFile: project.files.dockerEnv,
    liferayProfileFile: project.files.liferayProfile,
  };
  const config = options?.config ?? project.config;
  const dockerEnv = project.values.dockerEnv;
  const profile = project.values.profile;
  const worktree = project.repo.root ? await isWorktreeFn(cwd) : false;

  const tools = {
    git: await detectTool(runProcessFn, capabilities.hasGit, 'git', ['--version']),
    docker: await detectTool(runProcessFn, capabilities.hasDocker, 'docker', ['--version']),
    dockerCompose: await detectTool(runProcessFn, capabilities.hasDockerCompose, 'docker', [
      'compose',
      'version',
      '--short',
    ]),
    node: await detectTool(runProcessFn, capabilities.hasNode, 'node', ['--version']),
    java: await detectTool(runProcessFn, capabilities.hasJava, 'java', ['-version']),
    lcp: await detectTool(runProcessFn, capabilities.hasLcp, 'lcp', ['version']),
  };

  const configSources = {
    url: resolveConfigSource(
      config.liferay.url,
      env.LIFERAY_CLI_URL,
      dockerEnv.LIFERAY_CLI_URL,
      profile['liferay.url'],
    ),
    oauth2ClientId: resolveConfigSource(
      config.liferay.oauth2ClientId,
      env.LIFERAY_CLI_OAUTH2_CLIENT_ID,
      dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_ID,
      profile['liferay.oauth2.clientId'],
    ),
    oauth2ClientSecret: resolveConfigSource(
      config.liferay.oauth2ClientSecret,
      env.LIFERAY_CLI_OAUTH2_CLIENT_SECRET,
      dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_SECRET,
      profile['liferay.oauth2.clientSecret'],
    ),
    scopeAliases: resolveConfigSource(
      config.liferay.scopeAliases,
      env.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES,
      dockerEnv.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES,
      profile['liferay.oauth2.scopeAliases'],
    ),
    timeoutSeconds: resolveNumericConfigSource(
      config.liferay.timeoutSeconds,
      env.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS,
      dockerEnv.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS,
      profile['liferay.oauth2.timeoutSeconds'],
    ),
  };

  const checks: DoctorCheck[] = [
    {
      id: 'git',
      label: 'Git',
      status: capabilities.hasGit ? 'pass' : 'fail',
      summary: capabilities.hasGit ? summarizeTool('git', tools.git) : 'git no esta disponible en PATH',
    },
    {
      id: 'docker',
      label: 'Docker',
      status: capabilities.hasDocker ? 'pass' : 'fail',
      summary: capabilities.hasDocker
        ? summarizeTool('docker', tools.docker)
        : 'docker no esta disponible o el daemon no responde',
    },
    {
      id: 'docker-compose',
      label: 'Docker Compose',
      status: capabilities.hasDockerCompose ? 'pass' : 'fail',
      summary: capabilities.hasDockerCompose
        ? summarizeTool('docker compose', tools.dockerCompose)
        : 'docker compose no esta disponible',
    },
    {
      id: 'node',
      label: 'Node.js',
      status: capabilities.hasNode ? 'pass' : 'fail',
      summary: capabilities.hasNode ? summarizeTool('node', tools.node) : 'node no esta disponible en PATH',
    },
    {
      id: 'repo-root',
      label: 'Repo Root',
      status: repoPaths.repoRoot ? 'pass' : 'fail',
      summary: repoPaths.repoRoot
        ? `repo detectado en ${repoPaths.repoRoot}`
        : 'no se detecto un repo compatible con docker/ y liferay/',
    },
    {
      id: 'worktree-context',
      label: 'Worktree Context',
      status: repoPaths.repoRoot ? 'pass' : 'warn',
      summary: repoPaths.repoRoot
        ? worktree
          ? 'ejecutando dentro de un worktree'
          : 'ejecutando en el repo principal'
        : 'sin contexto de repo; worktree no aplica',
    },
    {
      id: 'docker-env-file',
      label: 'docker/.env',
      status: repoPaths.repoRoot ? (repoPaths.dockerEnvFile ? 'pass' : 'warn') : 'warn',
      summary: repoPaths.dockerEnvFile
        ? `archivo detectado en ${repoPaths.dockerEnvFile}`
        : 'docker/.env no existe; se usaran defaults y env vars',
    },
    {
      id: 'liferay-profile-file',
      label: '.liferay-cli.yml',
      status: repoPaths.repoRoot ? (repoPaths.liferayProfileFile ? 'pass' : 'warn') : 'warn',
      summary: repoPaths.liferayProfileFile
        ? `archivo detectado en ${repoPaths.liferayProfileFile}`
        : '.liferay-cli.yml no existe; config local limitada a env/.env',
    },
    {
      id: 'liferay-url',
      label: 'Liferay URL',
      status: config.liferay.url.trim() !== '' ? 'pass' : 'fail',
      summary:
        config.liferay.url.trim() !== ''
          ? `url=${config.liferay.url} (source=${configSources.url})`
          : 'LIFERAY_CLI_URL no resuelta',
    },
    {
      id: 'liferay-oauth2-client',
      label: 'Liferay OAuth2',
      status:
        config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== ''
          ? 'pass'
          : 'warn',
      summary:
        config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== ''
          ? `credenciales configuradas (id=${configSources.oauth2ClientId}, secret=${configSources.oauth2ClientSecret})`
          : 'faltan client id o client secret para comandos liferay autenticados',
      details:
        config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== ''
          ? undefined
          : [
              'Define LIFERAY_CLI_OAUTH2_CLIENT_ID y LIFERAY_CLI_OAUTH2_CLIENT_SECRET en env, docker/.env o .liferay-cli.yml.',
            ],
    },
    {
      id: 'java',
      label: 'Java (legacy)',
      status: capabilities.hasJava ? 'pass' : 'warn',
      summary: capabilities.hasJava
        ? summarizeTool('java', tools.java)
        : 'java no esta disponible; ya no es requisito para ldev',
    },
    {
      id: 'lcp',
      label: 'LCP CLI (optional)',
      status: capabilities.hasLcp ? 'pass' : 'warn',
      summary: capabilities.hasLcp
        ? summarizeTool('lcp', tools.lcp)
        : 'lcp no esta disponible; solo afecta flujos legacy/locales concretos',
    },
  ];

  const summary = {
    passed: checks.filter((check) => check.status === 'pass').length,
    warned: checks.filter((check) => check.status === 'warn').length,
    failed: checks.filter((check) => check.status === 'fail').length,
  };

  return {
    ok: summary.failed === 0,
    summary,
    capabilities,
    tools,
    environment: {
      cwd: project.cwd,
      repoRoot: project.repo.root,
      inRepo: project.repo.inRepo,
      isWorktree: worktree,
      dockerDir: project.repo.dockerDir,
      liferayDir: project.repo.liferayDir,
      files: {
        dockerEnv: project.files.dockerEnv,
        liferayProfile: project.files.liferayProfile,
      },
    },
    config: {
      liferay: {
        url: config.liferay.url,
        oauth2ClientIdConfigured: config.liferay.oauth2ClientId.trim() !== '',
        oauth2ClientSecretConfigured: config.liferay.oauth2ClientSecret.trim() !== '',
        scopeAliasesCount: countScopeAliases(config.liferay.scopeAliases),
        timeoutSeconds: config.liferay.timeoutSeconds,
      },
      sources: configSources,
    },
    checks,
  };
}

export function formatDoctor(report: DoctorReport): string {
  const lines = [
    `Doctor: ${report.ok ? 'OK' : 'FAIL'} (${report.summary.passed} pass, ${report.summary.warned} warn, ${report.summary.failed} fail)`,
    '',
    'Checks',
    ...report.checks.map((check) => `${formatStatus(check.status)} ${check.label}: ${check.summary}`),
    '',
    'Context',
    `cwd=${report.environment.cwd}`,
    `repoRoot=${report.environment.repoRoot ?? '-'}`,
    `worktree=${report.environment.isWorktree}`,
    `dockerEnv=${report.environment.files.dockerEnv ?? '-'}`,
    `liferayProfile=${report.environment.files.liferayProfile ?? '-'}`,
    '',
    'Config',
    `liferay.url=${report.config.liferay.url} (source=${report.config.sources.url})`,
    `oauth2ClientIdConfigured=${report.config.liferay.oauth2ClientIdConfigured} (source=${report.config.sources.oauth2ClientId})`,
    `oauth2ClientSecretConfigured=${report.config.liferay.oauth2ClientSecretConfigured} (source=${report.config.sources.oauth2ClientSecret})`,
    `scopeAliasesCount=${report.config.liferay.scopeAliasesCount} (source=${report.config.sources.scopeAliases})`,
    `timeoutSeconds=${report.config.liferay.timeoutSeconds} (source=${report.config.sources.timeoutSeconds})`,
  ];

  const recommendationLines = report.checks
    .filter((check) => check.details && check.details.length > 0)
    .flatMap((check) => check.details ?? [])
    .map((detail) => `- ${detail}`);

  if (recommendationLines.length > 0) {
    lines.push('', 'Recommendations', ...recommendationLines);
  }

  return lines.join('\n');
}

async function detectTool(
  runProcessFn: typeof runProcess,
  available: boolean,
  command: string,
  args: string[],
): Promise<DoctorToolStatus> {
  if (!available) {
    return {available: false, version: null};
  }

  const result = await runProcessFn(command, args);
  return {
    available: result.ok,
    version: extractVersion(result),
  };
}

function extractVersion(result: RunProcessResult): string | null {
  const rawOutput = `${result.stdout}\n${result.stderr}`.trim();
  if (rawOutput === '') {
    return null;
  }

  return rawOutput.split(/\r?\n/)[0]?.trim() ?? null;
}

function summarizeTool(name: string, tool: DoctorToolStatus): string {
  return tool.version ? `${name} disponible (${tool.version})` : `${name} disponible`;
}

function resolveConfigSource(
  resolvedValue: string,
  envValue: string | undefined,
  dockerEnvValue: string | undefined,
  profileValue: string | undefined,
): DoctorConfigSource {
  if (envValue !== undefined && envValue === resolvedValue) {
    return 'env';
  }
  if (dockerEnvValue !== undefined && dockerEnvValue === resolvedValue) {
    return 'dockerEnv';
  }
  if (profileValue !== undefined && profileValue === resolvedValue) {
    return 'profile';
  }
  return 'fallback';
}

function resolveNumericConfigSource(
  resolvedValue: number,
  envValue: string | undefined,
  dockerEnvValue: string | undefined,
  profileValue: string | undefined,
): DoctorConfigSource {
  if (envValue !== undefined && parsePositiveInt(envValue) === resolvedValue) {
    return 'env';
  }
  if (dockerEnvValue !== undefined && parsePositiveInt(dockerEnvValue) === resolvedValue) {
    return 'dockerEnv';
  }
  if (profileValue !== undefined && parsePositiveInt(profileValue) === resolvedValue) {
    return 'profile';
  }
  return 'fallback';
}

function parsePositiveInt(rawValue: string): number | null {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function countScopeAliases(value: string): number {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '').length;
}

function formatStatus(status: DoctorCheckStatus): string {
  switch (status) {
    case 'pass':
      return '[PASS]';
    case 'warn':
      return '[WARN]';
    default:
      return '[FAIL]';
  }
}

function readProfileFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = YAML.parse(fs.readFileSync(filePath, 'utf8'));
  const flattened: Record<string, string> = {};
  flatten(parsed, '', flattened);
  return flattened;
}

function flatten(value: unknown, prefix: string, target: Record<string, string>): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPrefix = prefix === '' ? key : `${prefix}.${key}`;
      flatten(nestedValue, nextPrefix, target);
    }
    return;
  }

  target[prefix] = String(value);
}
