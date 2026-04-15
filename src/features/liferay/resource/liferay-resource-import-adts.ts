import fs from 'fs-extra';
import path from 'node:path';

import {normalizeCliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {resolveArtifactBaseDir, resolveSiteToken, siteTokenToFriendlyUrl} from './artifact-paths.js';
import type {LiferayResourceImportFailure} from './liferay-resource-import-structures.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {runLiferayResourceSyncAdt} from './liferay-resource-sync-adt.js';

export type LiferayResourceImportAdtsResult = {
  mode: 'single-site' | 'all-sites';
  site?: string;
  sites?: string[];
  processed: number;
  failed: number;
  baseDir: string;
  failures: LiferayResourceImportFailure[];
};

export async function runLiferayResourceImportAdts(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    allSites?: boolean;
    apply?: boolean;
    adtKeys?: string[];
    checkOnly?: boolean;
    createMissing?: boolean;
    widgetType?: string;
    className?: string;
    continueOnError?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceImportAdtsResult> {
  const adtKeys = normalizeKeys(options?.adtKeys);
  const hasScopedFilter =
    adtKeys.length > 0 || Boolean(options?.widgetType?.trim()) || Boolean(options?.className?.trim());
  if (!options?.allSites && !options?.apply && !hasScopedFilter) {
    throw LiferayErrors.resourceError(
      'resource import-adts requires --adt <key> (repeatable), --widget-type, --class-name, --apply for the resolved site, or --all-sites to avoid accidental mass imports.',
    );
  }

  const baseDir = resolveArtifactBaseDir(config, 'adt', options?.dir);
  const siteTokens = options?.allSites ? await listSiteTokens(baseDir) : [resolveSiteToken(options?.site ?? '/global')];

  let processed = 0;
  let failed = 0;
  const failures: LiferayResourceImportFailure[] = [];

  for (const siteToken of siteTokens) {
    const candidateDirs = options?.allSites
      ? [path.join(baseDir, siteToken)]
      : await resolveSingleSiteCandidateDirs(baseDir, siteToken);
    const files = await collectUniqueFiles(candidateDirs, '.ftl', adtKeys);

    for (const file of files) {
      try {
        await runLiferayResourceSyncAdt(
          config,
          {
            site: siteTokenToFriendlyUrl(siteToken),
            file,
            widgetType: options?.widgetType,
            className: options?.className,
            checkOnly: Boolean(options?.checkOnly),
            createMissing: Boolean(options?.createMissing),
          },
          dependencies,
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        const entry = path.basename(file, '.ftl');
        const failure = toImportFailure(siteTokenToFriendlyUrl(siteToken), entry, file, error);
        failures.push(failure);
        if (!options?.continueOnError) {
          throw LiferayErrors.resourceError(
            `Import failed for ADT '${entry}' in site '${failure.site}': ${failure.message}`,
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

export function formatLiferayResourceImportAdts(result: LiferayResourceImportAdtsResult): string {
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

export function getLiferayResourceImportAdtsExitCode(result: LiferayResourceImportAdtsResult): number {
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

async function listFiles(baseDir: string, extension: string): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }
  const matches: string[] = [];
  const entries = await fs.readdir(baseDir, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await listFiles(fullPath, extension)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(extension)) {
      matches.push(fullPath);
    }
  }
  return matches.sort();
}

async function resolveSingleSiteCandidateDirs(baseDir: string, siteToken: string): Promise<string[]> {
  const siteDir = path.join(baseDir, siteToken);
  if (await fs.pathExists(siteDir)) {
    return [siteDir];
  }
  return [baseDir];
}

async function collectUniqueFiles(baseDirs: string[], extension: string, allowedKeys: string[]): Promise<string[]> {
  const allowed = allowedKeys.length > 0 ? new Set(allowedKeys) : null;
  const unique = new Set<string>();
  for (const baseDir of baseDirs) {
    for (const file of await listFiles(baseDir, extension)) {
      if (!allowed || allowed.has(path.basename(file, extension))) {
        unique.add(file);
      }
    }
  }
  return Array.from(unique).sort();
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
