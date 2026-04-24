import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {sleep} from '../../core/utils/async.js';

import {runDeployModule} from './deploy-module.js';
import {resolveDeployContext} from './deploy-shared.js';

export type DeployWatchResult = {
  ok: true;
  watchedRoots: string[];
  iterations: number | null;
  redeployedModules: string[];
  events: {module: string; changedFiles: string[]; deployed: boolean}[];
};

export async function runDeployWatch(
  config: AppConfig,
  options?: {
    module?: string;
    intervalMs?: number;
    iterations?: number;
    printer?: Printer;
  },
): Promise<DeployWatchResult> {
  const context = resolveDeployContext(config);
  const moduleFilter = options?.module?.trim() || null;
  const watchedRoots = await resolveWatchRoots(context.liferayDir, moduleFilter);
  if (watchedRoots.length === 0) {
    throw new CliError(
      'No paths were found under liferay/modules, liferay/themes, or liferay/client-extensions to watch.',
      {
        code: 'DEPLOY_WATCH_PATHS_NOT_FOUND',
      },
    );
  }

  const intervalMs = options?.intervalMs ?? 1200;
  const iterations = options?.iterations ?? Number.POSITIVE_INFINITY;
  let previous = await snapshotWatchRoots(watchedRoots);
  const events: DeployWatchResult['events'] = [];
  const redeployedModules = new Set<string>();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await sleep(intervalMs);
    const current = await snapshotWatchRoots(watchedRoots);
    const changedFiles = diffSnapshots(previous, current);
    previous = current;

    if (changedFiles.length === 0) {
      continue;
    }

    const grouped = groupChangesByModule(context.liferayDir, changedFiles, moduleFilter);
    for (const [moduleName, moduleFiles] of grouped.entries()) {
      options?.printer?.info(`Changes detected in ${moduleName}. Running redeploy.`);
      await runDeployModule(config, {module: moduleName, printer: options?.printer});
      events.push({module: moduleName, changedFiles: moduleFiles, deployed: true});
      redeployedModules.add(moduleName);
    }
  }

  return {
    ok: true,
    watchedRoots,
    iterations: Number.isFinite(iterations) ? iterations : null,
    redeployedModules: [...redeployedModules],
    events,
  };
}

export function formatDeployWatch(result: DeployWatchResult): string {
  return [
    `Watch roots: ${result.watchedRoots.join(', ')}`,
    `Redeploys: ${result.events.length}`,
    ...result.events.map((event) => `- ${event.module}: ${event.changedFiles.length} changes`),
  ].join('\n');
}

export async function resolveWatchRoots(liferayDir: string, moduleFilter: string | null): Promise<string[]> {
  const roots: string[] = [];
  const modulesDir = path.join(liferayDir, 'modules');
  const themesDir = path.join(liferayDir, 'themes');
  const clientExtDir = path.join(liferayDir, 'client-extensions');

  if (moduleFilter) {
    const candidates = [
      path.join(modulesDir, moduleFilter),
      path.join(themesDir, moduleFilter),
      path.join(clientExtDir, moduleFilter),
    ];
    for (const candidate of candidates) {
      if (await fs.pathExists(candidate)) {
        roots.push(candidate);
      }
    }
    return roots;
  }

  if (await fs.pathExists(modulesDir)) {
    roots.push(modulesDir);
  }
  if (await fs.pathExists(themesDir)) {
    roots.push(themesDir);
  }
  if (await fs.pathExists(clientExtDir)) {
    roots.push(clientExtDir);
  }

  return roots;
}

export function groupChangesByModule(
  liferayDir: string,
  changedFiles: string[],
  moduleFilter: string | null,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const changedFile of changedFiles) {
    const relative = path.relative(liferayDir, changedFile);
    const segments = relative.split(path.sep);
    const namespace = segments[0];
    const moduleName = moduleFilter ?? segments[1];

    if ((namespace !== 'modules' && namespace !== 'themes' && namespace !== 'client-extensions') || !moduleName) {
      continue;
    }

    const current = grouped.get(moduleName) ?? [];
    current.push(changedFile);
    grouped.set(moduleName, current);
  }

  return grouped;
}

async function snapshotWatchRoots(roots: string[]): Promise<Map<string, number>> {
  const snapshot = new Map<string, number>();

  for (const root of roots) {
    if (!(await fs.pathExists(root))) {
      continue;
    }

    const queue = [root];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const entries = await fs.readdir(current, {withFileTypes: true});
      for (const entry of entries) {
        if (
          entry.name === 'build' ||
          entry.name === '.gradle' ||
          entry.name === 'node_modules' ||
          entry.name === '.git'
        ) {
          continue;
        }

        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(entryPath);
          continue;
        }

        const stat = await fs.stat(entryPath);
        snapshot.set(entryPath, stat.mtimeMs);
      }
    }
  }

  return snapshot;
}

function diffSnapshots(previous: Map<string, number>, current: Map<string, number>): string[] {
  const changed = new Set<string>();

  for (const [file, mtime] of current.entries()) {
    if (previous.get(file) !== mtime) {
      changed.add(file);
    }
  }

  for (const file of previous.keys()) {
    if (!current.has(file)) {
      changed.add(file);
    }
  }

  return [...changed].sort();
}
