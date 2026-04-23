import type {AppConfig} from '../../core/config/load-config.js';
import type {ProjectContext} from '../../core/config/project-context.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import type {detectCapabilities} from '../../core/platform/capabilities.js';
import type {detectProject, detectProjectType} from '../../core/config/project-type.js';
import type {detectRepoPaths} from '../../core/config/repo-paths.js';
import type {createOAuthTokenClient} from '../../core/http/auth.js';
import type {runDockerCompose} from '../../core/platform/docker.js';
import type {runProcess} from '../../core/platform/process.js';
import type {isWorktree} from '../../core/platform/git.js';
import type {loadConfig} from '../../core/config/load-config.js';
import type {readEnvFile} from '../../core/config/env-file.js';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type DoctorCheckScope = 'basic' | 'deep' | 'runtime' | 'portal' | 'osgi';
export type DoctorConfigSource = 'env' | 'localProfile' | 'dockerEnv' | 'profile' | 'fallback';
export type DoctorPortStatus = 'free' | 'in-use' | 'unsupported';

export type DoctorDependencies = {
  checkTcpPort?: (host: string, port: number) => Promise<DoctorPortStatus>;
  createOAuthTokenClient?: typeof createOAuthTokenClient;
  detectCapabilities?: typeof detectCapabilities;
  detectProject?: typeof detectProject;
  detectProjectType?: typeof detectProjectType;
  detectRepoPaths?: typeof detectRepoPaths;
  fileExists?: (filePath: string) => boolean;
  fetchImpl?: typeof fetch;
  getTotalMemoryBytes?: () => number;
  isWorktree?: typeof isWorktree;
  loadConfig?: typeof loadConfig;
  readEnvFile?: typeof readEnvFile;
  readProfileFile?: (filePath: string) => Record<string, string>;
  runDockerCompose?: typeof runDockerCompose;
  runGogoCommand?: (config: AppConfig, command: string, processEnv?: NodeJS.ProcessEnv) => Promise<string>;
  runProcess?: typeof runProcess;
};

export type DoctorCheck = {
  id: string;
  status: DoctorCheckStatus;
  scope?: DoctorCheckScope;
  summary: string;
  remedy?: string;
  label?: string;
  details?: string[];
};

export type DoctorToolStatus = {
  status: Exclude<DoctorCheckStatus, 'skip'>;
  available: boolean;
  version: string | null;
  reason?: string;
};

export type DoctorAiStatus = {
  manifestPresent: boolean;
  managedRules: number;
  modifiedRules: number;
  stalePackageRules: number;
  staleRuntimeRules: number;
  warnings: string[];
};

export type DoctorRuntimeService = {
  service: string;
  state: string | null;
  health: string | null;
  exitCode: number | null;
};

export type DoctorRuntimeReport = {
  status: DoctorCheckStatus;
  summary: string;
  reason?: string;
  services: DoctorRuntimeService[];
};

export type DoctorPortalHttpReport = {
  status: DoctorCheckStatus;
  summary: string;
  checkedPath: string;
  httpStatus: number | null;
  reachable: boolean;
};

export type DoctorPortalOauthReport = {
  status: DoctorCheckStatus;
  summary: string;
  configured: boolean;
  tokenType: string | null;
  expiresIn: number | null;
  reason?: string;
};

export type DoctorPortalReport = {
  status: DoctorCheckStatus;
  summary: string;
  http: DoctorPortalHttpReport;
  oauth: DoctorPortalOauthReport | null;
};

export type DoctorOsgiBundleSummary = {
  id: string;
  state: string;
  name: string;
};

export type DoctorOsgiReport = {
  status: DoctorCheckStatus;
  summary: string;
  reason?: string;
  bundleCounts: {
    total: number;
    active: number;
    resolved: number;
    installed: number;
    fragments: number;
    other: number;
  };
  problematicBundles: DoctorOsgiBundleSummary[];
};

export type DoctorReport = {
  ok: boolean;
  contractVersion: 2;
  generatedAt: string;
  ranChecks: DoctorCheckScope[];
  summary: {
    passed: number;
    warned: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  stamp: {
    projectType: string;
    portalUrl: string | null;
    contractVersion: 2;
  };
  tools: {
    git: DoctorToolStatus;
    blade: DoctorToolStatus;
    docker: DoctorToolStatus;
    dockerDaemon: DoctorToolStatus;
    dockerCompose: DoctorToolStatus;
    node: DoctorToolStatus;
    java: DoctorToolStatus;
    lcp: DoctorToolStatus;
    playwrightCli: DoctorToolStatus;
  };
  checks: DoctorCheck[];
  readiness: Record<string, 'ready' | 'blocked' | 'unknown'>;
  runtime: DoctorRuntimeReport | null;
  portal: DoctorPortalReport | null;
  osgi: DoctorOsgiReport | null;
};

/** Intermediate data collected before building checks. */
export type DoctorContext = {
  project: ProjectContext;
  repoPaths: {
    repoRoot: string | null;
    dockerDir: string | null;
    liferayDir: string | null;
    dockerEnvFile: string | null;
    liferayProfileFile: string | null;
  };
  capabilities: PlatformCapabilities;
  tools: DoctorReport['tools'];
  config: AppConfig;
  configSources: {
    url: DoctorConfigSource;
    oauth2ClientId: DoctorConfigSource;
    oauth2ClientSecret: DoctorConfigSource;
    scopeAliases: DoctorConfigSource;
    timeoutSeconds: DoctorConfigSource;
  };
  activationKeyFile: string | null;
  activationKeyExists: boolean;
  activationKeyValidName: boolean;
  httpPort: number | null;
  httpPortStatus: DoctorPortStatus;
  totalMemoryBytes: number;
  worktree: boolean;
  ai: DoctorAiStatus;
};
