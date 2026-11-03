import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../core/config/load-config.js';
import {
  listWorkspaceClientExtensions,
  readBundleStates,
  type BundleState,
} from '../../core/runtime/client-extensions.js';

import {resolveDeployContext, resolveDeployCacheDir} from './deploy-shared.js';

export type DeployStatusModule = {
  name: string;
  artifact: string;
  state: 'ACTIVE' | 'DEPLOYED';
  source: 'build' | 'cache';
  deployedAt: string | null;
};

export type DeployStatusClientExtension = {
  name: string;
  types: string[];
  bundle: string;
  /** OSGi state (Active, Resolved, ...) or NOT_DEPLOYED when Liferay has no such bundle. */
  state: string;
  bundleId: number | null;
};

export type DeployStatusResult = {
  ok: true;
  buildDeployDir: string;
  cacheDir: string;
  lastDeployCommit: string | null;
  lastDeployAt: string | null;
  modules: DeployStatusModule[];
  clientExtensions: DeployStatusClientExtension[];
};

export async function runDeployStatus(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<DeployStatusResult> {
  const context = resolveDeployContext(config);
  const cacheDir = resolveDeployCacheDir(config);
  const [buildModules, cacheModules, bundleStates, workspaceClientExtensions] = await Promise.all([
    listArtifactModules(context.buildDeployDir, 'build'),
    listArtifactModules(cacheDir, 'cache'),
    readBundleStates(config, options?.processEnv),
    listWorkspaceClientExtensions(context.liferayDir),
  ]);
  const activeBundles = new Set(
    [...bundleStates.values()].filter((bundle) => bundle.state === 'Active').map((bundle) => bundle.symbolicName),
  );

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
    clientExtensions: workspaceClientExtensions.map((cx) => {
      const bundle: BundleState | undefined = bundleStates.get(cx.bundleSymbolicName);
      return {
        name: cx.project,
        types: cx.entries.map((entry) => entry.type),
        bundle: cx.bundleSymbolicName,
        state: bundle?.state ?? 'NOT_DEPLOYED',
        bundleId: bundle?.id ?? null,
      };
    }),
  };
}

export function formatDeployStatus(result: DeployStatusResult): string {
  return [
    `Build deploy dir: ${result.buildDeployDir}`,
    `Cache dir: ${result.cacheDir}`,
    `Last deploy commit: ${result.lastDeployCommit ?? 'n/a'}`,
    `Modules: ${result.modules.length}`,
    ...result.modules.map((module) => `- ${module.name} ${module.state} (${module.source})`),
    `Client extensions: ${result.clientExtensions.length}`,
    ...result.clientExtensions.map((cx) => `- ${cx.name} ${cx.state} (${cx.types.join(', ') || 'unknown type'})`),
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

function stripExtension(value: string): string {
  return value.replace(/\.(jar|war|xml)$/i, '');
}
