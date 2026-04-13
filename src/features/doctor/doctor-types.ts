import type {AppConfig} from '../../core/config/load-config.js';
import type {ProjectContext} from '../../core/config/project-context.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';
import type {detectCapabilities} from '../../core/platform/capabilities.js';
import type {detectProject, detectProjectType} from '../../core/config/project-type.js';
import type {detectRepoPaths} from '../../core/config/repo-paths.js';
import type {runProcess} from '../../core/platform/process.js';
import type {isWorktree} from '../../core/platform/git.js';
import type {loadConfig} from '../../core/config/load-config.js';
import type {readEnvFile} from '../../core/config/env-file.js';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type DoctorConfigSource = 'env' | 'localProfile' | 'dockerEnv' | 'profile' | 'fallback';
export type DoctorPortStatus = 'free' | 'in-use' | 'unsupported';

export type DoctorDependencies = {
  checkTcpPort?: (host: string, port: number) => Promise<DoctorPortStatus>;
  detectCapabilities?: typeof detectCapabilities;
  detectProject?: typeof detectProject;
  detectProjectType?: typeof detectProjectType;
  detectRepoPaths?: typeof detectRepoPaths;
  fileExists?: (filePath: string) => boolean;
  getTotalMemoryBytes?: () => number;
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
    skipped: number;
  };
  capabilities: PlatformCapabilities;
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
  environment: {
    cwd: string;
    projectType: string;
    repoRoot: string | null;
    inRepo: boolean;
    isWorktree: boolean;
    bindIp: string | null;
    httpPort: string | null;
    portalUrl: string | null;
    dataRoot: string | null;
    activationKeyFile: string | null;
    dockerDir: string | null;
    liferayDir: string | null;
    files: {
      dockerEnv: string | null;
      liferayProfile: string | null;
      liferayLocalProfile: string | null;
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
  ai: {
    manifestPresent: boolean;
    managedRules: number;
    modifiedRules: number;
    stalePackageRules: number;
    staleRuntimeRules: number;
    warnings: string[];
  };
  checks: DoctorCheck[];
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
  configSources: DoctorReport['config']['sources'];
  activationKeyFile: string | null;
  activationKeyExists: boolean;
  activationKeyValidName: boolean;
  httpPort: number | null;
  httpPortStatus: DoctorPortStatus;
  totalMemoryBytes: number;
  worktree: boolean;
  ai: DoctorReport['ai'];
};
