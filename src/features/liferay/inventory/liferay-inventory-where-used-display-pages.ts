import type {AppConfig} from '../../../core/config/load-config.js';
import {mapConcurrent} from '../../../core/concurrency.js';
import {isCliError} from '../../../core/errors.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {
  fetchJournalArticleRowsInFolder,
  fetchJournalFoldersByParent,
  type JsonwsJournalArticleRow,
} from '../content/liferay-content-journal-shared.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {LookupCache} from '../lookup-cache.js';
import {createInventoryGateway, fetchPagedItems} from './liferay-inventory-shared.js';
import {buildDisplayPageUrl} from './liferay-inventory-url.js';
import type {LiferayInventorySite} from './liferay-inventory-sites.js';

type StructuredContentListItem = {
  friendlyUrlPath?: string;
};

export type DisplayPageCandidate = {
  fullUrl: string;
  origin: 'headlessStructuredContent' | 'jsonwsJournal';
};

export type DisplayPageSource = {
  origin: DisplayPageCandidate['origin'];
  collect: (
    config: AppConfig,
    site: LiferayInventorySite,
    options: WhereUsedDisplayPageScanOptions,
  ) => Promise<DisplayPageCandidate[]>;
};

export type WhereUsedDisplayPageScanOptions = {
  concurrency: number;
  pageSize: number;
  dependencies: {
    apiClient?: HttpApiClient;
    tokenClient?: OAuthTokenClient;
  };
};

type DisplayPageSourceCollectionResult =
  | {kind: 'collected'; candidates: DisplayPageCandidate[]}
  | {kind: 'unsupported'};

const DISPLAY_PAGE_SOURCES: DisplayPageSource[] = [
  {origin: 'headlessStructuredContent', collect: collectHeadlessStructuredContentDisplayPages},
  {origin: 'jsonwsJournal', collect: collectJsonwsJournalDisplayPages},
];

const unsupportedDisplayPageSourceCache = new LookupCache<boolean>({ttlMs: 3_600_000});

export async function collectDisplayPageCandidates(
  config: AppConfig,
  site: LiferayInventorySite,
  options: WhereUsedDisplayPageScanOptions,
): Promise<DisplayPageCandidate[]> {
  return collectDisplayPageCandidatesFromSources(config, site, options, DISPLAY_PAGE_SOURCES);
}

export async function collectDisplayPageCandidatesFromSources(
  config: AppConfig,
  site: LiferayInventorySite,
  options: WhereUsedDisplayPageScanOptions,
  sources: DisplayPageSource[],
): Promise<DisplayPageCandidate[]> {
  const candidates: DisplayPageCandidate[] = [];
  for (const source of sources) {
    if (isUnsupportedDisplayPageSourceCached(config, site, source.origin)) {
      continue;
    }

    const result = await collectDisplayPageCandidatesFromSource(config, site, options, source);
    if (result.kind === 'unsupported') {
      cacheUnsupportedDisplayPageSource(config, site, source.origin);
      continue;
    }

    candidates.push(...result.candidates);
  }
  return dedupeDisplayPageCandidates(candidates);
}

async function collectDisplayPageCandidatesFromSource(
  config: AppConfig,
  site: LiferayInventorySite,
  options: WhereUsedDisplayPageScanOptions,
  source: DisplayPageSource,
): Promise<DisplayPageSourceCollectionResult> {
  try {
    return {
      kind: 'collected',
      candidates: await source.collect(config, site, options),
    };
  } catch (error) {
    if (isSkippableDisplayPageScanError(error)) {
      return {kind: 'unsupported'};
    }
    throw error;
  }
}

async function collectHeadlessStructuredContentDisplayPages(
  config: AppConfig,
  site: LiferayInventorySite,
  options: WhereUsedDisplayPageScanOptions,
): Promise<DisplayPageCandidate[]> {
  const structuredContents = await fetchPagedItems<StructuredContentListItem>(
    config,
    `/o/headless-delivery/v1.0/sites/${site.groupId}/structured-contents`,
    options.pageSize,
    options.dependencies,
  );

  return structuredContents
    .map((item) => buildDisplayPageUrl(site.siteFriendlyUrl, item.friendlyUrlPath))
    .filter((fullUrl): fullUrl is string => fullUrl !== null)
    .map((fullUrl) => ({fullUrl, origin: 'headlessStructuredContent'}));
}

async function collectJsonwsJournalDisplayPages(
  config: AppConfig,
  site: LiferayInventorySite,
  options: WhereUsedDisplayPageScanOptions,
): Promise<DisplayPageCandidate[]> {
  const apiClient = options.dependencies.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(config, apiClient, options.dependencies);
  const folderIds = await collectJournalFolderIds(gateway, site.groupId, 0, new Set([0]));
  const pages = await mapConcurrent(folderIds, Math.max(1, Math.min(options.concurrency, 4)), async (folderId) => {
    const rows = await fetchJournalArticleRowsInFolder(gateway, site.groupId, folderId);
    return rows
      .filter((row) => row.status === undefined || Number(row.status) === 0)
      .map((row) => buildDisplayPageUrl(site.siteFriendlyUrl, resolveJournalArticleUrlTitle(row)))
      .filter((fullUrl): fullUrl is string => fullUrl !== null)
      .map((fullUrl) => ({fullUrl, origin: 'jsonwsJournal' as const}));
  });

  return pages.flat();
}

async function collectJournalFolderIds(
  gateway: LiferayGateway,
  groupId: number,
  parentFolderId: number,
  seen: Set<number>,
): Promise<number[]> {
  const folders = await fetchJournalFoldersByParent(gateway, groupId, parentFolderId);
  const childIds: number[] = [];

  for (const folder of folders) {
    if (seen.has(folder.folderId)) {
      continue;
    }
    seen.add(folder.folderId);
    childIds.push(folder.folderId);
    childIds.push(...(await collectJournalFolderIds(gateway, groupId, folder.folderId, seen)));
  }

  return parentFolderId === 0 ? [0, ...childIds] : childIds;
}

function dedupeDisplayPageCandidates(candidates: DisplayPageCandidate[]): DisplayPageCandidate[] {
  const unique = new Map<string, DisplayPageCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.fullUrl)) {
      unique.set(candidate.fullUrl, candidate);
    }
  }
  return [...unique.values()];
}

function resolveJournalArticleUrlTitle(row: JsonwsJournalArticleRow): string | undefined {
  return row.urlTitle ?? row.urlTitleCurrentValue ?? row.friendlyURL;
}

function buildDisplayPageSourceCacheKey(
  config: AppConfig,
  site: LiferayInventorySite,
  origin: DisplayPageCandidate['origin'],
): string {
  return `${config.liferay.url}|${site.groupId}|${origin}`;
}

function isUnsupportedDisplayPageSourceCached(
  config: AppConfig,
  site: LiferayInventorySite,
  origin: DisplayPageCandidate['origin'],
): boolean {
  return unsupportedDisplayPageSourceCache.get(buildDisplayPageSourceCacheKey(config, site, origin)) ?? false;
}

function cacheUnsupportedDisplayPageSource(
  config: AppConfig,
  site: LiferayInventorySite,
  origin: DisplayPageCandidate['origin'],
): void {
  unsupportedDisplayPageSourceCache.set(buildDisplayPageSourceCacheKey(config, site, origin), true);
}

export function resetDisplayPageSourceSupportCache(): void {
  unsupportedDisplayPageSourceCache.clear();
}

function isSkippableDisplayPageScanError(error: unknown): boolean {
  if (!isCliError(error)) return false;
  if (error.code !== 'LIFERAY_INVENTORY_ERROR' && error.code !== 'LIFERAY_GATEWAY_ERROR') {
    return false;
  }
  return error.message.includes('status=403') || error.message.includes('status=404');
}
