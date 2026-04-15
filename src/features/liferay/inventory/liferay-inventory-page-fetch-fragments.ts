import path from 'node:path';
import fs from 'fs-extra';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {type PageFragmentEntry} from './liferay-inventory-page-assemble.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {buildResourceSiteChain} from '../resource/liferay-resource-shared.js';
import {resolveFragmentsBaseDir, resolveSiteToken} from '../resource/liferay-resource-paths.js';
import {safeGatewayGet} from './liferay-inventory-page-fetch-http.js';

export async function tryFetchFragmentEntryLinks(
  gateway: LiferayGateway,
  groupId: number,
  plid: number,
): Promise<Array<Record<string, unknown>>> {
  if (plid <= 0) {
    return [];
  }
  const response = await safeGatewayGet<Array<Record<string, unknown>>>(
    gateway,
    `/api/jsonws/fragment.fragmententrylink/get-fragment-entry-links?groupId=${groupId}&plid=${plid}`,
    'fetch-fragment-entry-links',
  );
  return response.ok && Array.isArray(response.data) ? response.data : [];
}

export async function enrichFragmentEntryExportPaths(
  config: AppConfig,
  gateway: LiferayGateway,
  startSite: string,
  entries: PageFragmentEntry[],
  apiClient: LiferayApiClient,
): Promise<void> {
  const fragmentEntries = entries.filter((entry) => entry.type === 'fragment' && entry.fragmentKey);
  if (fragmentEntries.length === 0) {
    return;
  }

  const cache = new Map<string, {siteFriendlyUrl: string; exportPath: string} | null>();
  for (const entry of fragmentEntries) {
    const fragmentKey = entry.fragmentKey!;
    if (!cache.has(fragmentKey)) {
      cache.set(
        fragmentKey,
        await findFragmentExportPath(config, startSite, fragmentKey, {
          apiClient,
          gateway,
        }),
      );
    }
    const match = cache.get(fragmentKey);
    if (match) {
      entry.fragmentSiteFriendlyUrl = match.siteFriendlyUrl;
      entry.fragmentExportPath = match.exportPath;
    }
  }
}

async function findFragmentExportPath(
  config: AppConfig,
  startSite: string,
  fragmentKey: string,
  dependencies: {apiClient: LiferayApiClient; gateway: LiferayGateway},
): Promise<{siteFriendlyUrl: string; exportPath: string} | null> {
  const baseDirs = await resolveFragmentSearchBaseDirs(config);
  const siteChain = await safeBuildFragmentSiteChain(config, startSite, dependencies);
  for (const site of siteChain) {
    for (const baseDir of baseDirs) {
      const siteDir = path.join(baseDir, 'sites', resolveSiteToken(site.siteFriendlyUrl));
      const exportPath = await findFragmentDir(siteDir, fragmentKey);
      if (exportPath) {
        return {siteFriendlyUrl: site.siteFriendlyUrl, exportPath};
      }
    }
  }
  return null;
}

async function resolveFragmentSearchBaseDirs(config: AppConfig): Promise<string[]> {
  const configured = resolveFragmentsBaseDir(config);
  const candidates = [configured];
  if (config.liferayDir && (await fs.pathExists(config.liferayDir))) {
    const entries = await fs.readdir(config.liferayDir, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isDirectory() && /fragments$/i.test(entry.name)) {
        candidates.push(path.join(config.liferayDir, entry.name));
      }
    }
  }
  return [...new Set(candidates)];
}

async function safeBuildFragmentSiteChain(
  config: AppConfig,
  startSite: string,
  dependencies: {apiClient: LiferayApiClient; gateway: LiferayGateway},
): Promise<Array<{siteFriendlyUrl: string}>> {
  try {
    return await buildResourceSiteChain(config, startSite, dependencies);
  } catch {
    return startSite === '/global'
      ? [{siteFriendlyUrl: '/global'}]
      : [{siteFriendlyUrl: startSite}, {siteFriendlyUrl: '/global'}];
  }
}

async function findFragmentDir(root: string, fragmentKey: string): Promise<string | null> {
  if (!(await fs.pathExists(root))) {
    return null;
  }
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === fragmentKey && path.basename(path.dirname(entryPath)) === 'fragments') {
        return entryPath;
      }
      queue.push(entryPath);
    }
  }
  return null;
}
