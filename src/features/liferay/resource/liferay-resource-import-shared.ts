import fs from 'fs-extra';
import path from 'node:path';

import {normalizeCliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {resolveArtifactBaseDir, resolveSiteToken, siteTokenToFriendlyUrl} from './artifact-paths.js';

export type LiferayResourceImportFailure = {
  site: string;
  entry: string;
  file: string;
  message: string;
};

export type LiferayResourceImportResult = {
  mode: 'single-site' | 'all-sites';
  site?: string;
  sites?: string[];
  processed: number;
  failed: number;
  baseDir: string;
  failures: LiferayResourceImportFailure[];
};

type RunLiferayResourceFileImportOptions = {
  artifactType: 'structure' | 'template' | 'adt';
  dir?: string;
  site?: string;
  allSites?: boolean;
  continueOnError?: boolean;
  extension: string;
  allowedKeys?: string[];
  resolveSiteDirs?: (baseDir: string, siteToken: string, allSites: boolean) => Promise<string[]>;
  runEntry: (site: string, file: string) => Promise<unknown>;
  formatFailure: (failure: LiferayResourceImportFailure) => string;
};

export async function runLiferayResourceFileImport(
  config: AppConfig,
  options: RunLiferayResourceFileImportOptions,
): Promise<LiferayResourceImportResult> {
  const baseDir = resolveArtifactBaseDir(config, options.artifactType, options.dir);
  const siteTokens = options.allSites ? await listSiteTokens(baseDir) : [resolveSiteToken(options.site ?? '/global')];

  let processed = 0;
  let failed = 0;
  const failures: LiferayResourceImportFailure[] = [];

  for (const siteToken of siteTokens) {
    const site = siteTokenToFriendlyUrl(siteToken);
    const siteDirs = options.resolveSiteDirs
      ? await options.resolveSiteDirs(baseDir, siteToken, Boolean(options.allSites))
      : [path.join(baseDir, siteToken)];
    const files = await collectUniqueFiles(siteDirs, options.extension, options.allowedKeys ?? []);

    for (const file of files) {
      try {
        await options.runEntry(site, file);
        processed += 1;
      } catch (error) {
        failed += 1;
        const failure = toImportFailure(site, path.basename(file, options.extension), file, error);
        failures.push(failure);
        if (!options.continueOnError) {
          const wrappedError = new Error(options.formatFailure(failure), {cause: error});
          Object.assign(wrappedError, {failure});
          throw wrappedError;
        }
      }
    }
  }

  return {
    ...(options.allSites
      ? {mode: 'all-sites' as const, sites: siteTokens.map((token) => siteTokenToFriendlyUrl(token))}
      : {mode: 'single-site' as const, site: siteTokenToFriendlyUrl(siteTokens[0] ?? 'global')}),
    processed,
    failed,
    baseDir,
    failures,
  };
}

export function formatLiferayResourceImportResult(result: LiferayResourceImportResult): string {
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

export function getLiferayResourceImportExitCode(result: LiferayResourceImportResult): number {
  return result.failed > 0 ? 1 : 0;
}

export function normalizeImportKeys(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))];
}

export async function resolveDefaultOrSiteBaseDir(
  baseDir: string,
  siteToken: string,
  allSites: boolean,
): Promise<string[]> {
  if (allSites) {
    return [path.join(baseDir, siteToken)];
  }

  const siteDir = path.join(baseDir, siteToken);
  if (await fs.pathExists(siteDir)) {
    return [siteDir];
  }

  return [baseDir];
}

export function unwrapLiferayResourceImportFailure(error: unknown): LiferayResourceImportFailure | null {
  if (!(error instanceof Error)) {
    return null;
  }

  return isImportFailure((error as Error & {failure?: unknown}).failure)
    ? (error as Error & {failure: LiferayResourceImportFailure}).failure
    : null;
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

function toImportFailure(site: string, entry: string, file: string, error: unknown): LiferayResourceImportFailure {
  const normalized = normalizeCliError(error);
  return {
    site,
    entry,
    file,
    message: normalized.message,
  };
}

function isImportFailure(value: unknown): value is LiferayResourceImportFailure {
  return (
    value !== null &&
    typeof value === 'object' &&
    'site' in value &&
    'entry' in value &&
    'file' in value &&
    'message' in value
  );
}
