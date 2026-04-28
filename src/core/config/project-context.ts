import fs from 'node:fs';
import path from 'node:path';

import type {AppConfig} from './schema.js';
import {resolveLinkedGitWorktree} from '../platform/git.js';
import {readEnvFile} from './env-file.js';
import {readProfileFile as readLiferayProfileFile, resolveLiferayProfileFiles} from './liferay-profile.js';
import {detectProject, type ProjectType} from './project-type.js';
import {detectRepoPaths} from './repo-paths.js';
import {buildAppConfig} from './config-builder.js';
import {resolveProjectInventory, type ProjectInventory} from './project-inventory.js';

export type ProjectContext = {
  cwd: string;
  projectType: ProjectType;
  repo: {
    root: string | null;
    inRepo: boolean;
    dockerDir: string | null;
    liferayDir: string | null;
  };
  files: {
    dockerEnv: string | null;
    liferayProfile: string | null;
    liferayLocalProfile: string | null;
  };
  values: {
    dockerEnv: Record<string, string>;
    profile: Record<string, string>;
    localProfile: Record<string, string>;
  };
  env: {
    composeProjectName: string | null;
    bindIp: string | null;
    httpPort: string | null;
    portalUrl: string | null;
    dataRoot: string | null;
  };
  liferay: AppConfig['liferay'] & {
    oauth2Configured: boolean;
    scopeAliasesList: string[];
  };
  workspace: {
    product: string | null;
  };
  inventory: ProjectInventory;
  paths: {
    structures: string;
    templates: string;
    adts: string;
    fragments: string;
    migrations: string;
  };
  config: AppConfig;
};

type ResolveProjectContextOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  dependencies?: {
    detectRepoPaths?: typeof detectRepoPaths;
    detectProject?: typeof detectProject;
    readEnvFile?: typeof readEnvFile;
    readProfileFile?: typeof readLiferayProfileFile;
  };
  /** @internal Injected Set used to deduplicate profile warnings. Useful for test isolation. */
  _warnedFiles?: Set<string>;
};

const SENSITIVE_PROFILE_KEY_PATTERN = /(^|\.)(clientsecret|secret|password|token|api[_-]?key)$/i;
const ENV_REFERENCE_PATTERN = /^\$\{?[A-Z_][A-Z0-9_]*\}?$/;
const SECRET_REFERENCE_PATTERN = /^(secret|vault|aws-sm|gcp-sm|azure-kv|ref):\/\//i;

// Module-level fallback for production use. Tests inject their own Set via _warnedFiles.
const defaultWarnedProfileFiles = new Set<string>();

export function resolveProjectContext(options?: ResolveProjectContextOptions): ProjectContext {
  const env = options?.env ?? process.env;
  const cwd = resolveEffectiveCwd(options?.cwd, env);
  const dependencies = options?.dependencies;
  const warnedFiles = options?._warnedFiles ?? defaultWarnedProfileFiles;
  const detectRepoPathsFn = dependencies?.detectRepoPaths ?? detectRepoPaths;
  const detectProjectFn = dependencies?.detectProject ?? detectProject;
  const readEnvFileFn = dependencies?.readEnvFile ?? readEnvFile;
  const readProfileFileFn = dependencies?.readProfileFile ?? readLiferayProfileFile;

  const projectDetection = detectProjectFn(cwd);
  const detectedRepoPaths = detectRepoPathsFn(cwd);
  const worktree = detectWorktreePath(cwd) ?? detectWorktreePath(detectedRepoPaths.repoRoot ?? cwd);
  const repoPaths =
    worktree && isWorktreeOverlay(worktree) ? resolveWorktreeRepoPaths(worktree, detectedRepoPaths) : detectedRepoPaths;
  const projectType = projectDetection.type;
  const resolvedRepoRoot = repoPaths.repoRoot ?? projectDetection.root;
  const detectedProfileFiles = resolveLiferayProfileFiles(resolvedRepoRoot);
  const profileFiles = {
    shared: repoPaths.liferayProfileFile ?? detectedProfileFiles.shared,
    local: detectedProfileFiles.local,
  };
  const dockerEnv = resolveDockerEnv({
    repoPaths,
    worktree,
    readEnvFile: readEnvFileFn,
  });
  const sharedProfile = profileFiles.shared ? readProfileFileFn(profileFiles.shared) : {};
  const localProfile = profileFiles.local ? readProfileFileFn(profileFiles.local) : {};
  const profile = {...sharedProfile, ...localProfile};
  if (profileFiles.shared) {
    warnIfProfileContainsSensitiveSecrets(profileFiles.shared, sharedProfile, warnedFiles);
  }
  const config = buildAppConfig({
    cwd,
    env,
    repoPaths,
    projectDetection,
    dockerEnv,
    localProfile,
    profile,
  });
  const resolvedPaths = {
    structures: config.paths?.structures ?? 'liferay/resources/journal/structures',
    templates: config.paths?.templates ?? 'liferay/resources/journal/templates',
    adts: config.paths?.adts ?? 'liferay/resources/templates/application_display',
    fragments: config.paths?.fragments ?? 'liferay/fragments',
    migrations: config.paths?.migrations ?? 'liferay/resources/journal/migrations',
  };
  const scopeAliasesList = config.liferay.scopeAliases
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  const bindIp = repoPaths.repoRoot ? dockerEnv.BIND_IP || 'localhost' : null;
  const httpPort = repoPaths.repoRoot ? dockerEnv.LIFERAY_HTTP_PORT || '8080' : null;
  const workspaceProduct =
    projectType === 'blade-workspace' && projectDetection.root ? readWorkspaceProduct(projectDetection.root) : null;
  const inventory = resolveProjectInventory({
    repoRoot: resolvedRepoRoot,
    liferayDir: repoPaths.liferayDir,
    dockerDir: repoPaths.dockerDir,
    projectType,
    dockerEnv,
    paths: resolvedPaths,
    workspaceProduct,
  });

  return {
    cwd,
    projectType,
    repo: {
      root: resolvedRepoRoot,
      inRepo: resolvedRepoRoot !== null,
      dockerDir: repoPaths.dockerDir,
      liferayDir: repoPaths.liferayDir,
    },
    files: {
      dockerEnv: repoPaths.dockerEnvFile,
      liferayProfile: profileFiles.shared,
      liferayLocalProfile: profileFiles.local,
    },
    values: {
      dockerEnv,
      profile,
      localProfile,
    },
    env: {
      composeProjectName: repoPaths.repoRoot ? dockerEnv.COMPOSE_PROJECT_NAME || 'liferay' : null,
      bindIp,
      httpPort,
      portalUrl:
        config.liferay.url.trim() !== ''
          ? config.liferay.url
          : bindIp && httpPort
            ? `http://${bindIp}:${httpPort}`
            : null,
      dataRoot: repoPaths.dockerDir ? resolveDataRoot(repoPaths.dockerDir, dockerEnv.ENV_DATA_ROOT) : null,
    },
    liferay: {
      ...config.liferay,
      oauth2Configured: config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== '',
      scopeAliasesList,
    },
    workspace: {
      product: workspaceProduct,
    },
    inventory,
    paths: resolvedPaths,
    config,
  };
}

export function findSensitiveProfileEntries(profile: Record<string, string>): string[] {
  return Object.entries(profile)
    .filter(([key, value]) => {
      if (!SENSITIVE_PROFILE_KEY_PATTERN.test(key)) {
        return false;
      }
      const normalized = value.trim();
      return normalized !== '' && !ENV_REFERENCE_PATTERN.test(normalized) && !SECRET_REFERENCE_PATTERN.test(normalized);
    })
    .map(([key]) => key)
    .sort();
}

function warnIfProfileContainsSensitiveSecrets(
  profilePath: string,
  profile: Record<string, string>,
  warnedFiles: Set<string>,
): void {
  if (warnedFiles.has(profilePath)) {
    return;
  }

  const sensitiveEntries = findSensitiveProfileEntries(profile);
  if (sensitiveEntries.length === 0) {
    return;
  }

  warnedFiles.add(profilePath);
  process.emitWarning(
    `Sensitive values detected in ${profilePath}: ${sensitiveEntries.join(
      ', ',
    )}. Move secrets to environment variables or secret stores.`,
    {
      code: 'LDEV_PROFILE_SECRET',
      type: 'SecurityWarning',
    },
  );
}

function readWorkspaceProduct(rootDir: string): string | null {
  const gradlePropertiesPath = path.join(rootDir, 'gradle.properties');

  if (!fs.existsSync(gradlePropertiesPath)) {
    return null;
  }

  const content = fs.readFileSync(gradlePropertiesPath, 'utf8');
  const line = content
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('liferay.workspace.product='));

  if (!line) {
    return null;
  }

  return line.split('=').slice(1).join('=').trim() || null;
}

export function resolveEffectiveCwd(cwd: string | undefined, env: NodeJS.ProcessEnv): string {
  if (cwd) {
    return cwd;
  }

  const repoRoot = env.REPO_ROOT?.trim();
  if (repoRoot) {
    return repoRoot;
  }

  return process.cwd();
}

function resolveDataRoot(dockerDir: string, configured: string | undefined): string {
  const dataRoot = configured && configured !== '' ? configured : './data/default';
  return path.isAbsolute(dataRoot) ? dataRoot : path.resolve(dockerDir, dataRoot);
}

type WorktreePath = {
  mainRepoRoot: string;
  worktreeName: string;
  worktreeRoot: string;
};

function detectWorktreePath(startDir: string): WorktreePath | null {
  const resolved = path.resolve(startDir);
  const linkedWorktree = resolveLinkedGitWorktree(resolved);

  if (linkedWorktree) {
    return {
      mainRepoRoot: linkedWorktree.mainRepoRoot,
      worktreeName: linkedWorktree.worktreeName,
      worktreeRoot: linkedWorktree.worktreeRoot,
    };
  }

  const parts = resolved.split(path.sep);
  const markerIndex = parts.lastIndexOf('.worktrees');

  if (markerIndex <= 0 || markerIndex >= parts.length - 1) {
    return null;
  }

  const mainRepoRoot = parts.slice(0, markerIndex).join(path.sep) || path.sep;
  const worktreeName = parts[markerIndex + 1];

  return {
    mainRepoRoot,
    worktreeName,
    worktreeRoot: parts.slice(0, markerIndex + 2).join(path.sep),
  };
}

function isWorktreeOverlay(worktree: WorktreePath): boolean {
  return (
    fs.existsSync(path.join(worktree.mainRepoRoot, 'docker', 'docker-compose.yml')) &&
    fs.existsSync(path.join(worktree.worktreeRoot, 'liferay'))
  );
}

function resolveWorktreeRepoPaths(
  worktree: WorktreePath,
  detectedRepoPaths: ReturnType<typeof detectRepoPaths>,
): ReturnType<typeof detectRepoPaths> {
  const worktreeDockerDir = path.join(worktree.worktreeRoot, 'docker');
  const worktreeEnvFile = path.join(worktreeDockerDir, '.env');
  const worktreeProfileFile = path.join(worktree.worktreeRoot, '.liferay-cli.yml');
  const mainProfileFile = path.join(worktree.mainRepoRoot, '.liferay-cli.yml');

  return {
    repoRoot: worktree.worktreeRoot,
    dockerDir: worktreeDockerDir,
    liferayDir: path.join(worktree.worktreeRoot, 'liferay'),
    dockerEnvFile: fs.existsSync(worktreeEnvFile) ? worktreeEnvFile : null,
    liferayProfileFile: fs.existsSync(worktreeProfileFile)
      ? worktreeProfileFile
      : fs.existsSync(mainProfileFile)
        ? mainProfileFile
        : detectedRepoPaths.liferayProfileFile,
  };
}

function resolveDockerEnv(options: {
  repoPaths: ReturnType<typeof detectRepoPaths>;
  worktree: WorktreePath | null;
  readEnvFile: typeof readEnvFile;
}): Record<string, string> {
  const env = options.repoPaths.dockerEnvFile ? options.readEnvFile(options.repoPaths.dockerEnvFile) : {};
  const worktree = options.worktree;

  if (!worktree || !isWorktreeOverlay(worktree)) {
    return env;
  }

  const mainEnvFile = path.join(worktree.mainRepoRoot, 'docker', '.env');
  const mainEnv = fs.existsSync(mainEnvFile) ? options.readEnvFile(mainEnvFile) : {};
  const ports = resolveWorktreePortSet(worktree.worktreeName);
  const bindIp = env.BIND_IP || mainEnv.BIND_IP || '127.0.0.1';
  const mainComposeProject = mainEnv.COMPOSE_PROJECT_NAME || 'liferay';
  const worktreeComposeProject = `${mainComposeProject}-${worktree.worktreeName}`;

  return {
    ...mainEnv,
    COMPOSE_PROJECT_NAME: worktreeComposeProject,
    VOLUME_PREFIX: worktreeComposeProject,
    BIND_IP: bindIp,
    LIFERAY_CLI_URL: `http://${bindIp}:${ports.httpPort}`,
    LIFERAY_HTTP_PORT: ports.httpPort,
    LIFERAY_DEBUG_PORT: ports.debugPort,
    GOGO_PORT: ports.gogoPort,
    POSTGRES_PORT: ports.postgresPort,
    ES_HTTP_PORT: ports.esHttpPort,
    ENV_DATA_ROOT:
      env.ENV_DATA_ROOT || path.join(path.join(worktree.worktreeRoot, 'docker'), 'data', 'envs', worktree.worktreeName),
    ...env,
  };
}

function resolveWorktreePortSet(name: string): {
  httpPort: string;
  debugPort: string;
  gogoPort: string;
  postgresPort: string;
  esHttpPort: string;
} {
  const hash = checksum(name);
  const offset = hash % 800;

  return {
    httpPort: String(8100 + offset),
    debugPort: String(9000 + offset),
    gogoPort: String(12000 + offset),
    postgresPort: String(5400 + offset),
    esHttpPort: String(9201 + offset),
  };
}

function checksum(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}
