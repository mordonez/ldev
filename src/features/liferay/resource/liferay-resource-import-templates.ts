import fs from 'fs-extra';
import path from 'node:path';

import {CliError, normalizeCliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {resolveArtifactBaseDir, resolveSiteToken, siteTokenToFriendlyUrl} from './artifact-paths.js';
import type {LiferayResourceImportFailure} from './liferay-resource-import-structures.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {runLiferayResourceSyncTemplate} from './liferay-resource-sync-template.js';

export type LiferayResourceImportTemplatesResult = {
  mode: 'single-site' | 'all-sites';
  site?: string;
  sites?: string[];
  processed: number;
  failed: number;
  baseDir: string;
  failures: LiferayResourceImportFailure[];
};

export async function runLiferayResourceImportTemplates(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    allSites?: boolean;
    apply?: boolean;
    templateKeys?: string[];
    checkOnly?: boolean;
    createMissing?: boolean;
    structureKey?: string;
    continueOnError?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceImportTemplatesResult> {
  const templateKeys = normalizeTemplateKeys(options?.templateKeys);
  if (!options?.allSites && !options?.apply && templateKeys.length === 0) {
    throw new CliError(
      'resource import-templates requires --template <key> (repeatable), --apply for the resolved site, or --all-sites to avoid accidental mass imports.',
      {code: 'LIFERAY_RESOURCE_ERROR'},
    );
  }

  const baseDir = resolveArtifactBaseDir(config, 'template', options?.dir);
  const siteTokens = options?.allSites ? await listSiteTokens(baseDir) : [resolveSiteToken(options?.site ?? '/global')];

  let processed = 0;
  let failed = 0;
  const failures: LiferayResourceImportFailure[] = [];

  for (const siteToken of siteTokens) {
    for (const file of await listFiles(path.join(baseDir, siteToken), '.ftl', templateKeys)) {
      const id = path.basename(file, '.ftl');
      try {
        await runLiferayResourceSyncTemplate(
          config,
          {
            site: siteTokenToFriendlyUrl(siteToken),
            key: id,
            file,
            structureKey: options?.structureKey,
            checkOnly: Boolean(options?.checkOnly),
            createMissing: Boolean(options?.createMissing),
          },
          dependencies,
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        const failure = toImportFailure(siteTokenToFriendlyUrl(siteToken), id, file, error);
        failures.push(failure);
        if (!options?.continueOnError) {
          throw new CliError(`Import failed for template '${id}' in site '${failure.site}': ${failure.message}`, {
            code: 'LIFERAY_RESOURCE_ERROR',
            details: failure,
          });
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

export function formatLiferayResourceImportTemplates(result: LiferayResourceImportTemplatesResult): string {
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

export function getLiferayResourceImportTemplatesExitCode(result: LiferayResourceImportTemplatesResult): number {
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

async function listFiles(baseDir: string, extension: string, templateKeys: string[]): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }
  const allowed = templateKeys.length > 0 ? new Set(templateKeys) : null;
  const matches: string[] = [];
  const entries = await fs.readdir(baseDir, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await listFiles(fullPath, extension, templateKeys)));
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

function normalizeTemplateKeys(templateKeys: string[] | undefined): string[] {
  if (!templateKeys) {
    return [];
  }

  return [...new Set(templateKeys.map((value) => value.trim()).filter((value) => value !== ''))];
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
