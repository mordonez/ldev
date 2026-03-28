import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import {resolveRepoPath, resolveTemplatesBaseDir} from './liferay-resource-paths.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';
import {runLiferayResourceSyncTemplate} from './liferay-resource-sync-template.js';

export type LiferayResourceImportTemplatesResult = {
  mode?: 'all-sites';
  processed: number;
  failed: number;
  baseDir: string;
};

export async function runLiferayResourceImportTemplates(
  config: AppConfig,
  options?: {
    site?: string;
    dir?: string;
    allSites?: boolean;
    checkOnly?: boolean;
    createMissing?: boolean;
    structureKey?: string;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceImportTemplatesResult> {
  const baseDir = path.resolve(
    options?.dir?.trim() ? resolveRepoPath(config, options.dir) : resolveTemplatesBaseDir(config),
  );
  const siteTokens = options?.allSites ? await listSiteTokens(baseDir) : [siteToToken(options?.site ?? '/global')];

  let processed = 0;
  let failed = 0;

  for (const siteToken of siteTokens) {
    for (const file of await listFiles(path.join(baseDir, siteToken), '.ftl')) {
      const id = path.basename(file, '.ftl');
      try {
        await runLiferayResourceSyncTemplate(
          config,
          {
            site: tokenToSite(siteToken),
            key: id,
            file,
            structureKey: options?.structureKey,
            checkOnly: Boolean(options?.checkOnly),
            createMissing: Boolean(options?.createMissing),
          },
          dependencies,
        );
        processed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return {
    ...(options?.allSites ? {mode: 'all-sites' as const} : {}),
    processed,
    failed,
    baseDir,
  };
}

export function formatLiferayResourceImportTemplates(result: LiferayResourceImportTemplatesResult): string {
  return `${result.mode === 'all-sites' ? 'IMPORTED mode=all-sites' : 'IMPORTED'} processed=${result.processed} failed=${result.failed} dir=${result.baseDir}`;
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

function siteToToken(site: string): string {
  return site.replace(/^\//, '').trim() || 'global';
}

function tokenToSite(token: string): string {
  return token === 'global' ? '/global' : `/${token}`;
}
