import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerCompose} from '../../core/platform/docker.js';

import {resolveDeployContext, resolveDeployCacheDir} from './deploy-shared.js';

export type DeployStatusModule = {
  name: string;
  artifact: string;
  state: 'ACTIVE' | 'DEPLOYED';
  source: 'build' | 'cache';
  deployedAt: string | null;
};

export type DeployStatusResult = {
  ok: true;
  buildDeployDir: string;
  cacheDir: string;
  lastDeployCommit: string | null;
  lastDeployAt: string | null;
  modules: DeployStatusModule[];
};

export async function runDeployStatus(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<DeployStatusResult> {
  const context = resolveDeployContext(config);
  const cacheDir = await resolveDeployCacheDir(config);
  const [buildModules, cacheModules, activeBundles] = await Promise.all([
    listArtifactModules(context.buildDeployDir, 'build'),
    listArtifactModules(cacheDir, 'cache'),
    listActiveBundles(context.dockerDir, options?.processEnv),
  ]);

  const merged = new Map<string, DeployStatusModule>();
  for (const module of [...cacheModules, ...buildModules]) {
    const active = activeBundles.has(module.name) || activeBundles.has(stripExtension(module.artifact));
    merged.set(module.name, {
      ...module,
      state: active ? 'ACTIVE' : 'DEPLOYED',
    });
  }

  const markerPath = path.join(context.buildDir, '.prepare-commit');
  const lastDeployCommit = (await fs.pathExists(markerPath))
    ? (await fs.readFile(markerPath, 'utf8')).trim() || null
    : null;
  const lastDeployAt = (await fs.pathExists(markerPath)) ? (await fs.stat(markerPath)).mtime.toISOString() : null;

  return {
    ok: true,
    buildDeployDir: context.buildDeployDir,
    cacheDir,
    lastDeployCommit,
    lastDeployAt,
    modules: [...merged.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function formatDeployStatus(result: DeployStatusResult): string {
  return [
    `Build deploy dir: ${result.buildDeployDir}`,
    `Cache dir: ${result.cacheDir}`,
    `Last deploy commit: ${result.lastDeployCommit ?? 'n/a'}`,
    `Modules: ${result.modules.length}`,
    ...result.modules.map((module) => `- ${module.name} ${module.state} (${module.source})`),
  ].join('\n');
}

async function listArtifactModules(directory: string, source: 'build' | 'cache'): Promise<DeployStatusModule[]> {
  if (!(await fs.pathExists(directory))) {
    return [];
  }

  const entries = await fs.readdir(directory, {withFileTypes: true});
  const modules: DeployStatusModule[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/\.(jar|war|xml)$/i.test(entry.name)) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    const stat = await fs.stat(filePath);
    modules.push({
      name: stripExtension(entry.name),
      artifact: entry.name,
      state: 'DEPLOYED',
      source,
      deployedAt: stat.mtime.toISOString(),
    });
  }

  return modules;
}

async function listActiveBundles(dockerDir: string, processEnv?: NodeJS.ProcessEnv): Promise<Set<string>> {
  const result = await runDockerCompose(
    dockerDir,
    ['exec', '-T', 'liferay', 'sh', '-lc', 'echo "lb -s" | telnet localhost 11311 || true'],
    {env: processEnv, reject: false},
  );
  if (!result.ok) {
    return new Set();
  }

  const bundles = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const normalized = line.trim();
    if (normalized === '') {
      continue;
    }

    const parts = normalized.split('|').map((item) => item.trim());
    const candidate = parts[parts.length - 1];
    if (candidate) {
      bundles.add(candidate);
    }
  }

  return bundles;
}

function stripExtension(value: string): string {
  return value.replace(/\.(jar|war|xml)$/i, '');
}
