import fs from 'node:fs';
import YAML from 'yaml';

import {resolveLiferayConfig} from '../liferay/config.js';
import {appConfigSchema, type AppConfig} from './schema.js';
import {readEnvFile} from './env-file.js';
import {detectRepoPaths} from './repo-paths.js';

export function loadConfig(options?: {cwd?: string; env?: NodeJS.ProcessEnv}): AppConfig {
  const env = options?.env ?? process.env;
  const cwd = resolveEffectiveCwd(options?.cwd, env);
  const repoPaths = detectRepoPaths(cwd);
  const dockerEnv = repoPaths.dockerEnvFile ? readEnvFile(repoPaths.dockerEnvFile) : {};
  const profile = repoPaths.liferayProfileFile ? readProfileFile(repoPaths.liferayProfileFile) : {};
  const liferay = resolveLiferayConfig({processEnv: env, dockerEnv, profile});

  return appConfigSchema.parse({
    cwd,
    repoRoot: repoPaths.repoRoot,
    dockerDir: repoPaths.dockerDir,
    liferayDir: repoPaths.liferayDir,
    files: {
      dockerEnv: repoPaths.dockerEnvFile,
      liferayProfile: repoPaths.liferayProfileFile,
    },
    liferay,
    paths: {
      structures: profile['paths.structures'] ?? 'liferay/resources/journal/structures',
      templates: profile['paths.templates'] ?? 'liferay/resources/journal/templates',
      adts: profile['paths.adts'] ?? 'liferay/resources/templates/application_display',
      fragments: profile['paths.fragments'] ?? 'liferay/fragments',
      migrations: profile['paths.migrations'] ?? 'liferay/resources/journal/migrations',
    },
  });
}

function resolveEffectiveCwd(cwd: string | undefined, env: NodeJS.ProcessEnv): string {
  if (cwd) {
    return cwd;
  }

  const repoRoot = env.REPO_ROOT?.trim();
  if (repoRoot) {
    return repoRoot;
  }

  return process.cwd();
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

export type {AppConfig} from './schema.js';
