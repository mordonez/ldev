import fs from 'fs-extra';
import path from 'node:path';

import {normalizeCliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {resolveArtifactBaseDir, resolveSiteToken, siteTokenToFriendlyUrl} from './artifact-paths.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {runLiferayResourceSyncStructure} from './liferay-resource-sync-structure.js';

export type LiferayResourceImportFailure = {
  site: string;
  entry: string;
  file: string;
  message: string;
};

export type LiferayResourceImportStructuresResult = {
  mode: 'single-site' | 'all-sites';
  site?: string;
  sites?: string[];
  processed: number;
  failed: number;
  baseDir: string;
  failures: LiferayResourceImportFailure[];
};

export async function runLiferayResourceImportStructures(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    allSites?: boolean;
    apply?: boolean;
    structureKeys?: string[];
    checkOnly?: boolean;
    createMissing?: boolean;
    skipUpdate?: boolean;
    migrationPlan?: string;
    migrationPhase?: string;
    migrationDryRun?: boolean;
    cleanupMigration?: boolean;
    allowBreakingChange?: boolean;
    continueOnError?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceImportStructuresResult> {
  const structureKeys = normalizeKeys(options?.structureKeys);
  if (!options?.allSites && !options?.apply && structureKeys.length === 0) {
    throw LiferayErrors.resourceError(
      'resource import-structures requires --structure <key> (repeatable), --apply for the resolved site, or --all-sites to avoid accidental mass imports.',
    );
  }

  const baseDir = resolveArtifactBaseDir(config, 'structure', options?.dir);
  const siteTokens = options?.allSites ? await listSiteTokens(baseDir) : [resolveSiteToken(options?.site ?? '/global')];

  let processed = 0;
  let failed = 0;
  const failures: LiferayResourceImportFailure[] = [];

  for (const siteToken of siteTokens) {
    for (const file of await listFiles(path.join(baseDir, siteToken), '.json', structureKeys)) {
      const key = path.basename(file, '.json');
      try {
        await runLiferayResourceSyncStructure(
          config,
          {
            site: siteTokenToFriendlyUrl(siteToken),
            key,
            file,
            checkOnly: Boolean(options?.checkOnly),
            createMissing: Boolean(options?.createMissing),
            skipUpdate: Boolean(options?.skipUpdate),
            migrationPlan: options?.migrationPlan,
            migrationPhase: options?.migrationPhase,
            migrationDryRun: Boolean(options?.migrationDryRun),
            cleanupMigration: Boolean(options?.cleanupMigration),
            allowBreakingChange: Boolean(options?.allowBreakingChange),
          },
          dependencies,
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        const failure = toImportFailure(siteTokenToFriendlyUrl(siteToken), key, file, error);
        failures.push(failure);
        if (!options?.continueOnError) {
          throw LiferayErrors.resourceError(
            `Import failed for structure '${key}' in site '${failure.site}': ${failure.message}`,
            {details: failure},
          );
        }
      }
    }
  }

  return {
    ...(options?.allSites
      ? {mode: 'all-sites' as const, sites: siteTokens.map((token) => siteTokenToFriendlyUrl(token))}
      : {mode: 'single-site' as const, site: siteTokenToFriendlyUrl(siteTokens[0] ?? 'global')}),
    processed,
    failed,
    baseDir,
    failures,
  };
}

export function formatLiferayResourceImportStructures(result: LiferayResourceImportStructuresResult): string {
  const lines = [
    result.mode === 'all-sites'
      ? `IMPORTED mode=all-sites sites=${(result.sites ?? []).join(',')} processed=${result.processed} failed=${result.failed} dir=${result.baseDir}`
      : `IMPORTED site=${result.site ?? '/global'} processed=${result.processed} failed=${result.failed} dir=${result.baseDir}`,
  ];
  if (result.failures.length > 0) {
    lines.push('failures:');
    for (const failure of result.failures) {
      lines.push(`- site=${failure.site} entry=${failure.entry} file=${failure.file} message=${failure.message}`);
    }
  }
  return lines.join('\n');
}

export function getLiferayResourceImportStructuresExitCode(result: LiferayResourceImportStructuresResult): number {
  return result.failed > 0 ? 1 : 0;
}

async function listSiteTokens(baseDir: string): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }
  return (await fs.readdir(baseDir, {withFileTypes: true}))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listFiles(baseDir: string, extension: string, allowedKeys: string[]): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }
  const allowed = allowedKeys.length > 0 ? new Set(allowedKeys) : null;
  const matches: string[] = [];
  const entries = await fs.readdir(baseDir, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await listFiles(fullPath, extension, allowedKeys)));
      continue;
    }
    if (
      entry.isFile() &&
      fullPath.endsWith(extension) &&
      (!allowed || allowed.has(path.basename(fullPath, extension)))
    ) {
      matches.push(fullPath);
    }
  }
  return matches.sort();
}

function toImportFailure(site: string, entry: string, file: string, error: unknown): LiferayResourceImportFailure {
  const normalized = normalizeCliError(error);
  return {
    site,
    entry,
    file,
    message: normalized.message,
  };
}

function normalizeKeys(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))];
}
