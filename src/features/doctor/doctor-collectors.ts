import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import YAML from 'yaml';

import type {AppConfig} from '../../core/config/load-config.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import {readEnvFile} from '../../core/config/env-file.js';
import {detectProject} from '../../core/config/project-type.js';
import {detectRepoPaths} from '../../core/config/repo-paths.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runProcess, type RunProcessResult} from '../../core/platform/process.js';
import {isWorktree} from '../../core/platform/git.js';
import {runAiStatus} from '../../core/runtime/ai-status.js';
import type {
  DoctorContext,
  DoctorDependencies,
  DoctorConfigSource,
  DoctorPortStatus,
  DoctorToolStatus,
} from './doctor-types.js';

export const MIN_RECOMMENDED_MEMORY_BYTES = 8 * 1024 ** 3;

export async function collectDoctorContext(
  cwd: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    config?: AppConfig;
    dependencies?: DoctorDependencies;
  },
): Promise<DoctorContext> {
  const env = options?.env ?? process.env;
  const dependencies = options?.dependencies;
  const detectCapabilitiesFn = dependencies?.detectCapabilities ?? detectCapabilities;
  const detectProjectFn = dependencies?.detectProject ?? detectProject;
  const detectRepoPathsFn = dependencies?.detectRepoPaths ?? detectRepoPaths;
  const fileExistsFn = dependencies?.fileExists ?? fs.existsSync;
  const getTotalMemoryBytesFn = dependencies?.getTotalMemoryBytes ?? os.totalmem;
  const isWorktreeFn = dependencies?.isWorktree ?? isWorktree;
  const checkTcpPortFn = dependencies?.checkTcpPort ?? checkTcpPort;
  const readEnvFileFn = dependencies?.readEnvFile ?? readEnvFile;
  const readProfileFileFn = dependencies?.readProfileFile ?? readProfileFile;
  const runProcessFn = dependencies?.runProcess ?? runProcess;

  const capabilities = await detectCapabilitiesFn(cwd);
  const project = resolveProjectContext({
    cwd,
    env,
    dependencies: {
      detectProject: detectProjectFn,
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
  const localProfile = project.values.localProfile;
  const worktree = project.repo.root ? await isWorktreeFn(cwd) : false;
  const totalMemoryBytes = getTotalMemoryBytesFn();
  const activationKeyFile = resolveActivationKeyFile(project.cwd, env.LDEV_ACTIVATION_KEY_FILE);
  const activationKeyExists = activationKeyFile ? fileExistsFn(activationKeyFile) : false;
  const activationKeyValidName = activationKeyFile ? isActivationKeyFileName(activationKeyFile) : false;
  const httpPort = parseTcpPort(project.env.httpPort);
  const httpPortStatus =
    project.env.bindIp && httpPort ? await checkTcpPortFn(project.env.bindIp, httpPort) : ('unsupported' as const);

  const dockerCli = await detectToolAlways(runProcessFn, 'docker', ['--version']);
  const dockerDaemon = await detectTool(runProcessFn, dockerCli.available, 'docker', [
    'info',
    '--format',
    '{{.ServerVersion}}',
  ]);

  const tools = {
    git: await detectTool(runProcessFn, capabilities.hasGit, 'git', ['--version']),
    blade: await detectTool(runProcessFn, capabilities.hasBlade, 'blade', ['version']),
    docker: dockerCli,
    dockerDaemon,
    dockerCompose: await detectTool(runProcessFn, capabilities.hasDockerCompose, 'docker', [
      'compose',
      'version',
      '--short',
    ]),
    node: await detectTool(runProcessFn, capabilities.hasNode, 'node', ['--version']),
    java: await detectTool(runProcessFn, capabilities.hasJava, 'java', ['-version']),
    lcp: await detectTool(runProcessFn, capabilities.hasLcp, 'lcp', ['version']),
    playwrightCli: await detectTool(runProcessFn, capabilities.hasPlaywrightCli, 'playwright-cli', ['--version']),
  };

  const configSources = {
    url: resolveConfigSource(
      config.liferay.url,
      env.LIFERAY_CLI_URL,
      localProfile['liferay.url'],
      dockerEnv.LIFERAY_CLI_URL,
      profile['liferay.url'],
    ),
    oauth2ClientId: resolveConfigSource(
      config.liferay.oauth2ClientId,
      env.LIFERAY_CLI_OAUTH2_CLIENT_ID,
      localProfile['liferay.oauth2.clientId'],
      dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_ID,
      profile['liferay.oauth2.clientId'],
    ),
    oauth2ClientSecret: resolveConfigSource(
      config.liferay.oauth2ClientSecret,
      env.LIFERAY_CLI_OAUTH2_CLIENT_SECRET,
      localProfile['liferay.oauth2.clientSecret'],
      dockerEnv.LIFERAY_CLI_OAUTH2_CLIENT_SECRET,
      profile['liferay.oauth2.clientSecret'],
    ),
    scopeAliases: resolveConfigSource(
      config.liferay.scopeAliases,
      env.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES,
      localProfile['liferay.oauth2.scopeAliases'],
      dockerEnv.LIFERAY_CLI_OAUTH2_SCOPE_ALIASES,
      profile['liferay.oauth2.scopeAliases'],
    ),
    timeoutSeconds: resolveNumericConfigSource(
      config.liferay.timeoutSeconds,
      env.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS,
      localProfile['liferay.oauth2.timeoutSeconds'],
      dockerEnv.LIFERAY_CLI_HTTP_TIMEOUT_SECONDS,
      profile['liferay.oauth2.timeoutSeconds'],
    ),
  };

  const aiStatus = await runAiStatus(project.cwd);

  return {
    project,
    repoPaths,
    capabilities,
    tools,
    config,
    configSources,
    activationKeyFile,
    activationKeyExists,
    activationKeyValidName,
    httpPort,
    httpPortStatus,
    totalMemoryBytes,
    worktree,
    ai: {
      manifestPresent: aiStatus.manifestPresent,
      managedRules: aiStatus.summary.managedRules,
      modifiedRules: aiStatus.summary.modified,
      stalePackageRules: aiStatus.summary.stalePackage,
      staleRuntimeRules: aiStatus.summary.staleRuntime,
      warnings: aiStatus.warnings,
    },
  };
}

export async function detectTool(
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

export async function detectToolAlways(
  runProcessFn: typeof runProcess,
  command: string,
  args: string[],
): Promise<DoctorToolStatus> {
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

export function summarizeTool(name: string, tool: DoctorToolStatus): string {
  return tool.version ? `${name} available (${tool.version})` : `${name} available`;
}

export function resolveConfigSource(
  resolvedValue: string,
  envValue: string | undefined,
  localProfileValue: string | undefined,
  dockerEnvValue: string | undefined,
  profileValue: string | undefined,
): DoctorConfigSource {
  if (envValue !== undefined && envValue === resolvedValue) {
    return 'env';
  }
  if (localProfileValue !== undefined && localProfileValue === resolvedValue) {
    return 'localProfile';
  }
  if (dockerEnvValue !== undefined && dockerEnvValue === resolvedValue) {
    return 'dockerEnv';
  }
  if (profileValue !== undefined && profileValue === resolvedValue) {
    return 'profile';
  }
  return 'fallback';
}

export function resolveNumericConfigSource(
  resolvedValue: number,
  envValue: string | undefined,
  localProfileValue: string | undefined,
  dockerEnvValue: string | undefined,
  profileValue: string | undefined,
): DoctorConfigSource {
  if (envValue !== undefined && parsePositiveInt(envValue) === resolvedValue) {
    return 'env';
  }
  if (localProfileValue !== undefined && parsePositiveInt(localProfileValue) === resolvedValue) {
    return 'localProfile';
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

export function parseTcpPort(rawValue: string | null): number | null {
  if (!rawValue) {
    return null;
  }

  const port = Number.parseInt(rawValue, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function countScopeAliases(value: string): number {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '').length;
}

export function resolveActivationKeyFile(cwd: string, rawValue: string | undefined): string | null {
  const value = rawValue?.trim();
  if (!value) {
    return null;
  }

  return path.resolve(cwd, value);
}

export function isActivationKeyFileName(filePath: string): boolean {
  return /^activation-key-.*\.xml$/i.test(path.basename(filePath));
}

export function summarizePortCheck(bindIp: string | null, port: number | null, status: DoctorPortStatus): string {
  if (!bindIp || !port) {
    return 'could not determine the host port from docker/.env';
  }

  switch (status) {
    case 'free':
      return `host port ${bindIp}:${port} is currently free`;
    case 'in-use':
      return `host port ${bindIp}:${port} is already in use; this is only fine if the environment is already running`;
    default:
      return `host port ${bindIp}:${port} could not be checked automatically on this host`;
  }
}

export function buildPortRecommendation(
  bindIp: string | null,
  port: number | null,
  status: DoctorPortStatus,
): string[] | undefined {
  if (!bindIp || !port) {
    return ['Define `BIND_IP` and `LIFERAY_HTTP_PORT` in docker/.env if you need a predictable local portal URL.'];
  }

  if (status === 'in-use') {
    return [
      `Stop the process using ${bindIp}:${port}, or change \`LIFERAY_HTTP_PORT\` in docker/.env before running \`ldev start\`.`,
    ];
  }

  if (status === 'unsupported') {
    return ['Use a local bind IP such as `localhost`, `127.0.0.1`, or `0.0.0.0` for automatic host port checks.'];
  }

  return undefined;
}

export async function checkTcpPort(host: string, port: number): Promise<DoctorPortStatus> {
  if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(host)) {
    return 'unsupported';
  }

  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve('in-use');
        return;
      }

      resolve('unsupported');
    });

    server.once('listening', () => {
      server.close(() => {
        resolve('free');
      });
    });

    server.listen(port, host === '0.0.0.0' ? undefined : host);
  });
}

export function formatBytes(bytes: number): string {
  const gibibytes = bytes / 1024 ** 3;
  return `${gibibytes.toFixed(1)} GiB`;
}

function readProfileFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed: unknown = YAML.parse(fs.readFileSync(filePath, 'utf8'));
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

  if (typeof value === 'string') {
    target[prefix] = value;
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    target[prefix] = `${value}`;
  }
}
