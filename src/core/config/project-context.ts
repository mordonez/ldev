import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

import {resolveLiferayConfig} from '../liferay/config.js';
import {appConfigSchema, type AppConfig} from './schema.js';
import {readEnvFile} from './env-file.js';
import {detectRepoPaths, type RepoPaths} from './repo-paths.js';

export type ProjectContext = {
  cwd: string;
  repo: {
    root: string | null;
    inRepo: boolean;
    dockerDir: string | null;
    liferayDir: string | null;
  };
  files: {
    dockerEnv: string | null;
    liferayProfile: string | null;
  };
  values: {
    dockerEnv: Record<string, string>;
    profile: Record<string, string>;
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
    readEnvFile?: typeof readEnvFile;
    readProfileFile?: typeof readProfileFile;
  };
};

export function resolveProjectContext(options?: ResolveProjectContextOptions): ProjectContext {
  const env = options?.env ?? process.env;
  const cwd = resolveEffectiveCwd(options?.cwd, env);
  const dependencies = options?.dependencies;
  const detectRepoPathsFn = dependencies?.detectRepoPaths ?? detectRepoPaths;
  const readEnvFileFn = dependencies?.readEnvFile ?? readEnvFile;
  const readProfileFileFn = dependencies?.readProfileFile ?? readProfileFile;

  const repoPaths = detectRepoPathsFn(cwd);
  const dockerEnv = repoPaths.dockerEnvFile ? readEnvFileFn(repoPaths.dockerEnvFile) : {};
  const profile = repoPaths.liferayProfileFile ? readProfileFileFn(repoPaths.liferayProfileFile) : {};
  const config = buildAppConfig({
    cwd,
    env,
    repoPaths,
    dockerEnv,
    profile,
  });
  const scopeAliasesList = config.liferay.scopeAliases
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  const bindIp = repoPaths.repoRoot ? (dockerEnv.BIND_IP || 'localhost') : null;
  const httpPort = repoPaths.repoRoot ? (dockerEnv.LIFERAY_HTTP_PORT || '8080') : null;

  return {
    cwd,
    repo: {
      root: repoPaths.repoRoot,
      inRepo: repoPaths.repoRoot !== null,
      dockerDir: repoPaths.dockerDir,
      liferayDir: repoPaths.liferayDir,
    },
    files: {
      dockerEnv: repoPaths.dockerEnvFile,
      liferayProfile: repoPaths.liferayProfileFile,
    },
    values: {
      dockerEnv,
      profile,
    },
    env: {
      composeProjectName: repoPaths.repoRoot ? (dockerEnv.COMPOSE_PROJECT_NAME || 'liferay') : null,
      bindIp,
      httpPort,
      portalUrl: bindIp && httpPort ? `http://${bindIp}:${httpPort}` : null,
      dataRoot: repoPaths.dockerDir ? resolveDataRoot(repoPaths.dockerDir, dockerEnv.ENV_DATA_ROOT) : null,
    },
    liferay: {
      ...config.liferay,
      oauth2Configured: config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== '',
      scopeAliasesList,
    },
    paths: {
      structures: config.paths?.structures ?? 'liferay/resources/journal/structures',
      templates: config.paths?.templates ?? 'liferay/resources/journal/templates',
      adts: config.paths?.adts ?? 'liferay/resources/templates/application_display',
      fragments: config.paths?.fragments ?? 'liferay/fragments',
      migrations: config.paths?.migrations ?? 'liferay/resources/journal/migrations',
    },
    config,
  };
}

export function buildAppConfig(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  repoPaths: RepoPaths;
  dockerEnv: Record<string, string>;
  profile: Record<string, string>;
}): AppConfig {
  const liferay = resolveLiferayConfig({
    processEnv: options.env,
    dockerEnv: options.dockerEnv,
    profile: options.profile,
  });

  return appConfigSchema.parse({
    cwd: options.cwd,
    repoRoot: options.repoPaths.repoRoot,
    dockerDir: options.repoPaths.dockerDir,
    liferayDir: options.repoPaths.liferayDir,
    files: {
      dockerEnv: options.repoPaths.dockerEnvFile,
      liferayProfile: options.repoPaths.liferayProfileFile,
    },
    liferay,
    paths: {
      structures: options.profile['paths.structures'] ?? 'liferay/resources/journal/structures',
      templates: options.profile['paths.templates'] ?? 'liferay/resources/journal/templates',
      adts: options.profile['paths.adts'] ?? 'liferay/resources/templates/application_display',
      fragments: options.profile['paths.fragments'] ?? 'liferay/fragments',
      migrations: options.profile['paths.migrations'] ?? 'liferay/resources/journal/migrations',
    },
  });
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

export function readProfileFile(filePath: string): Record<string, string> {
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

function resolveDataRoot(dockerDir: string, configured: string | undefined): string {
  const dataRoot = configured && configured !== '' ? configured : './data/default';
  return path.isAbsolute(dataRoot) ? dataRoot : path.resolve(dockerDir, dataRoot);
}
