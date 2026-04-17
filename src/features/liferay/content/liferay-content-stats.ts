import type {AppConfig} from '../../../core/config/load-config.js';
import {createConcurrencyLimiter, mapConcurrent} from '../../../core/concurrency.js';
import {CliError} from '../../../core/errors.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type HttpApiClient} from '../../../core/http/client.js';
import type {Printer} from '../../../core/output/printer.js';
import {runStep} from '../../../core/output/run-step.js';
import {LiferayErrors} from '../errors/index.js';
import {normalizeFriendlyUrl, resolveSite} from '../inventory/liferay-inventory-shared.js';
import {runLiferayInventorySites} from '../inventory/liferay-inventory-sites.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {
  fetchJournalFoldersByParent,
  fetchJournalArticleRowsInFolder,
  hydrateMissingJournalStructureDefinitions,
  resolveJournalStructureDefinitions,
} from './liferay-content-journal-shared.js';

export type ContentStatsOptions = {
  site?: string;
  groupId?: number;
  limit?: number;
  excludeSites?: string[];
  withStructures?: boolean;
  sortBy?: 'site' | 'name' | 'content';
};

export type ContentStatsStructure = {
  key: string;
  name: string;
  count: number;
};

export type ContentStatsFolder = {
  folderId: number;
  name: string;
  directStructuredContents: number;
  subtreeStructuredContents: number;
  childFolderCount: number;
  directListItems: number;
  subtreeListItems: number;
  structures?: ContentStatsStructure[];
};

export type ContentStatsSite = {
  groupId: number;
  siteFriendlyUrl: string;
  name: string;
  rootFolderCount: number;
  folderCount: number;
  structuredContents: number;
  topFolders: ContentStatsFolder[];
};

export type ContentStatsResult =
  | {
      ok: true;
      mode: 'sites';
      limit: number;
      excludedSites: string[];
      sites: ContentStatsSite[];
      skippedSites: Array<{groupId: number; siteFriendlyUrl: string; reason: string}>;
    }
  | {
      ok: true;
      mode: 'folders';
      limit: number;
      groupId: number;
      siteFriendlyUrl?: string;
      excludedSites: string[];
      folders: ContentStatsFolder[];
      skippedSites: [];
    };

type ContentStatsDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
  printer?: Printer;
};

type HeadlessFolder = {
  id?: number;
  name?: string;
  siteId?: number;
  numberOfStructuredContents?: number;
};

type ComputedFolderStats = ContentStatsFolder & {
  subtreeFolderIds: number[];
};

type JournalFolderNode = {
  folderId: number;
  name: string;
  children: JournalFolderNode[];
};

const DEFAULT_LIMIT = 10;
const PAGE_SIZE = 200;
const SITE_CONCURRENCY = 2;
const JOURNAL_FOLDER_CONCURRENCY = 2;

export async function runContentStats(
  config: AppConfig,
  options: ContentStatsOptions,
  dependencies?: ContentStatsDependencies,
): Promise<ContentStatsResult> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const printer = dependencies?.printer;
  const gateway = createLiferayGateway(config, apiClient, tokenClient);
  const longRunningGateway = createLiferayGateway(
    {
      ...config,
      liferay: {
        ...config.liferay,
        timeoutSeconds: Math.max(config.liferay.timeoutSeconds, 600),
      },
    },
    apiClient,
    tokenClient,
  );
  const limit = options.limit ?? DEFAULT_LIMIT;
  const sortBy = options.sortBy ?? 'content';
  const excludedSites = new Set(
    (options.excludeSites ?? []).map((site) => normalizeFriendlyUrl(site.trim())).filter(Boolean),
  );
  const runLimited = createConcurrencyLimiter(JOURNAL_FOLDER_CONCURRENCY);

  if (options.site || options.groupId !== undefined) {
    const site = options.site
      ? await resolveSite(config, options.site, {apiClient, tokenClient})
      : {id: options.groupId!, friendlyUrlPath: undefined, name: ''};

    const selected = await runStep(printer, 'Collecting content folders', async () => {
      const roots = await collectJournalFolderTree(gateway, site.id, 0, runLimited);
      const stats = await mapConcurrent(roots, JOURNAL_FOLDER_CONCURRENCY, (root) =>
        buildJournalFolderStats(longRunningGateway, site.id, root, runLimited),
      );
      return stats.sort(compareFoldersByVolume).slice(0, limit);
    });

    const folders = options.withStructures
      ? await runStep(printer, 'Collecting content structures', async () =>
          enrichFoldersWithStructures(
            config,
            apiClient,
            tokenClient,
            longRunningGateway,
            site.id,
            selected,
            runLimited,
          ),
        )
      : selected.map(stripComputedFolderStats);

    return {
      ok: true,
      mode: 'folders',
      limit,
      groupId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
      excludedSites: [...excludedSites],
      folders,
      skippedSites: [],
    };
  }

  const sites = await runStep(printer, 'Collecting content sites', async () => {
    const inventorySites = await runLiferayInventorySites(config, undefined, {apiClient, tokenClient});
    const filteredSites = inventorySites.filter((site) => !excludedSites.has(site.siteFriendlyUrl));
    const skippedSites: Array<{groupId: number; siteFriendlyUrl: string; reason: string}> = [];
    const rows = await mapConcurrent(filteredSites, SITE_CONCURRENCY, async (site) => {
      try {
        const roots = await fetchRootFolders(gateway, site.groupId);
        const folderStats = await Promise.all(roots.map((root) => buildFolderStats(gateway, root)));
        const structuredContents = folderStats.reduce((sum, folder) => sum + folder.subtreeStructuredContents, 0);
        const folderCount = folderStats.reduce((sum, folder) => sum + folder.childFolderCount + 1, 0);

        return {
          groupId: site.groupId,
          siteFriendlyUrl: site.siteFriendlyUrl,
          name: site.name,
          rootFolderCount: roots.length,
          folderCount,
          structuredContents,
          topFolders: folderStats.sort(compareFoldersByVolume).slice(0, 3).map(stripComputedFolderStats),
        };
      } catch (error) {
        skippedSites.push({
          groupId: site.groupId,
          siteFriendlyUrl: site.siteFriendlyUrl,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
      }
    });

    return {
      sites: rows
        .filter((row): row is ContentStatsSite => row !== null)
        .sort((left, right) => compareSites(left, right, sortBy))
        .slice(0, limit),
      skippedSites,
    };
  });

  return {
    ok: true,
    mode: 'sites',
    limit,
    excludedSites: [...excludedSites],
    sites: sites.sites,
    skippedSites: sites.skippedSites,
  };
}

export function formatContentStats(result: ContentStatsResult): string {
  const lines: string[] = [];

  if (result.mode === 'sites') {
    lines.push('CONTENT_STATS_SITES');
    lines.push(`limit=${result.limit}`);
    if (result.excludedSites.length > 0) {
      lines.push(`excludedSites=${result.excludedSites.join(',')}`);
    }
    lines.push('');

    for (const site of result.sites) {
      lines.push(
        `- groupId=${site.groupId} site=${site.siteFriendlyUrl} name=${site.name} structuredContents=${site.structuredContents} rootFolders=${site.rootFolderCount} folders=${site.folderCount}`,
      );
      for (const folder of site.topFolders) {
        lines.push(
          `  topFolder=${folder.folderId} "${folder.name}" subtreeStructuredContents=${folder.subtreeStructuredContents}`,
        );
      }
    }

    if (result.skippedSites.length > 0) {
      lines.push('');
      lines.push(`Skipped sites: ${result.skippedSites.length}`);
      for (const site of result.skippedSites.slice(0, 5)) {
        lines.push(`  groupId=${site.groupId} site=${site.siteFriendlyUrl} reason=${site.reason}`);
      }
    }

    return lines.join('\n');
  }

  lines.push('CONTENT_STATS_FOLDERS');
  lines.push(`groupId=${result.groupId}`);
  if (result.siteFriendlyUrl) {
    lines.push(`site=${result.siteFriendlyUrl}`);
  }
  lines.push(`limit=${result.limit}`);
  if (result.excludedSites.length > 0) {
    lines.push(`excludedSites=${result.excludedSites.join(',')}`);
  }
  lines.push('');

  for (const folder of result.folders) {
    lines.push(
      `- folderId=${folder.folderId} name=${folder.name} subtreeStructuredContents=${folder.subtreeStructuredContents} directStructuredContents=${folder.directStructuredContents} childFolders=${folder.childFolderCount} directListItems=${folder.directListItems} subtreeListItems=${folder.subtreeListItems}`,
    );
    if (folder.structures && folder.structures.length > 0) {
      for (const structure of folder.structures.slice(0, 10)) {
        lines.push(`  structure=${structure.key} (${structure.name}) count=${structure.count}`);
      }
    }
  }

  return lines.join('\n');
}

async function fetchRootFolders(gateway: LiferayGateway, groupId: number): Promise<HeadlessFolder[]> {
  const folders = await fetchHeadlessFoldersPageByPage(
    gateway,
    `/o/headless-delivery/v1.0/sites/${groupId}/structured-content-folders`,
  );

  const sameSiteFolders = folders.filter((folder) => folder.siteId === groupId);

  // Some runtimes do not populate siteId consistently on this listing endpoint.
  // Only apply the filter when it actually matches something; otherwise keep the raw site-scoped result.
  return sameSiteFolders.length > 0 ? sameSiteFolders : folders;
}

async function fetchChildFolders(gateway: LiferayGateway, folderId: number): Promise<HeadlessFolder[]> {
  return fetchHeadlessFoldersPageByPage(
    gateway,
    `/o/headless-delivery/v1.0/structured-content-folders/${folderId}/structured-content-folders`,
  );
}

async function fetchHeadlessFoldersPageByPage(gateway: LiferayGateway, basePath: string): Promise<HeadlessFolder[]> {
  const items: HeadlessFolder[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    let response: {items?: HeadlessFolder[]; lastPage?: number};

    try {
      response = await gateway.getJson<{items?: HeadlessFolder[]; lastPage?: number}>(
        `${basePath}?page=${page}&pageSize=${PAGE_SIZE}`,
        `content folders ${basePath}`,
      );
    } catch (error) {
      if (isGatewayError(error)) {
        throw LiferayErrors.contentStatsError(
          `${basePath} failed with status=${getGatewayStatus(error) ?? 'unknown'}.`,
        );
      }

      throw error;
    }

    items.push(...(response?.items ?? []));
    lastPage = response?.lastPage ?? 1;
    page += 1;
  }

  return items.filter((item) => item.id !== undefined);
}

async function buildFolderStats(gateway: LiferayGateway, rootFolder: HeadlessFolder): Promise<ComputedFolderStats> {
  const children = await fetchChildFolders(gateway, rootFolder.id ?? 0);
  let subtreeStructuredContents = rootFolder.numberOfStructuredContents ?? 0;
  let childFolderCount = children.length;
  const subtreeFolderIds = [rootFolder.id ?? 0];
  const childStatsList: ComputedFolderStats[] = [];

  for (const child of children) {
    const childStats = await buildFolderStats(gateway, child);
    childStatsList.push(childStats);
    subtreeStructuredContents += childStats.subtreeStructuredContents;
    childFolderCount += childStats.childFolderCount;
    subtreeFolderIds.push(...childStats.subtreeFolderIds);
  }

  return {
    folderId: rootFolder.id ?? 0,
    name: rootFolder.name ?? '',
    directStructuredContents: rootFolder.numberOfStructuredContents ?? 0,
    subtreeStructuredContents,
    childFolderCount,
    directListItems: (rootFolder.numberOfStructuredContents ?? 0) + children.length,
    subtreeListItems:
      (rootFolder.numberOfStructuredContents ?? 0) +
      children.length +
      childStatsList.reduce((sum, child) => sum + child.subtreeListItems, 0),
    subtreeFolderIds,
  };
}

function stripComputedFolderStats(folder: ComputedFolderStats): ContentStatsFolder {
  return {
    folderId: folder.folderId,
    name: folder.name,
    directStructuredContents: folder.directStructuredContents,
    subtreeStructuredContents: folder.subtreeStructuredContents,
    childFolderCount: folder.childFolderCount,
    directListItems: folder.directListItems,
    subtreeListItems: folder.subtreeListItems,
    structures: folder.structures,
  };
}

async function enrichFoldersWithStructures(
  config: AppConfig,
  apiClient: HttpApiClient,
  tokenClient: OAuthTokenClient,
  articleGateway: LiferayGateway,
  groupId: number,
  folders: ComputedFolderStats[],
  runLimited: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<ContentStatsFolder[]> {
  const structureMap = new Map<number, string>();
  const structureNameMap = new Map<string, string>();

  await resolveJournalStructureDefinitions(config, apiClient, tokenClient, groupId, structureMap, structureNameMap);

  return mapConcurrent(folders, JOURNAL_FOLDER_CONCURRENCY, async (folder) => {
    const counts = new Map<string, number>();

    await mapConcurrent(folder.subtreeFolderIds, JOURNAL_FOLDER_CONCURRENCY, async (folderId) => {
      const rows = await runLimited(() => fetchJournalArticleRowsInFolder(articleGateway, groupId, folderId));

      await hydrateMissingJournalStructureDefinitions(
        articleGateway,
        rows
          .map((row) => (row.DDMStructureId !== undefined ? Number(row.DDMStructureId) : undefined))
          .filter((value): value is number => value !== undefined && Number.isFinite(value)),
        structureMap,
        structureNameMap,
      );

      for (const row of rows) {
        const structureId = row.DDMStructureId !== undefined ? Number(row.DDMStructureId) : undefined;
        const key = structureId !== undefined ? (structureMap.get(structureId) ?? `unknown_${structureId}`) : 'unknown';

        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    });

    const structures = [...counts.entries()]
      .map(([key, count]) => ({
        key,
        name: structureNameMap.get(key) ?? key,
        count,
      }))
      .sort((left, right) =>
        left.count !== right.count ? right.count - left.count : left.key.localeCompare(right.key),
      );

    return stripComputedFolderStats({
      ...folder,
      structures,
    });
  });
}

async function collectJournalFolderTree(
  gateway: LiferayGateway,
  groupId: number,
  parentFolderId: number,
  runLimited: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<JournalFolderNode[]> {
  const folders = await runLimited(() => fetchJournalFoldersByParent(gateway, groupId, parentFolderId));

  return mapConcurrent(folders, JOURNAL_FOLDER_CONCURRENCY, async (folder) => ({
    folderId: folder.folderId,
    name: folder.name,
    children: await collectJournalFolderTree(gateway, groupId, folder.folderId, runLimited),
  }));
}

async function buildJournalFolderStats(
  gateway: LiferayGateway,
  groupId: number,
  folder: JournalFolderNode,
  runLimited: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<ComputedFolderStats> {
  const rows = await runLimited(() => fetchJournalArticleRowsInFolder(gateway, groupId, folder.folderId));

  const childStats = await mapConcurrent(folder.children, JOURNAL_FOLDER_CONCURRENCY, (child) =>
    buildJournalFolderStats(gateway, groupId, child, runLimited),
  );

  return {
    folderId: folder.folderId,
    name: folder.name,
    directStructuredContents: rows.length,
    subtreeStructuredContents:
      rows.length + childStats.reduce((sum, child) => sum + child.subtreeStructuredContents, 0),
    childFolderCount: folder.children.length + childStats.reduce((sum, child) => sum + child.childFolderCount, 0),
    directListItems: rows.length + folder.children.length,
    subtreeListItems:
      rows.length + folder.children.length + childStats.reduce((sum, child) => sum + child.subtreeListItems, 0),
    subtreeFolderIds: [folder.folderId, ...childStats.flatMap((child) => child.subtreeFolderIds)],
  };
}

function compareFoldersByVolume(left: ContentStatsFolder, right: ContentStatsFolder): number {
  if (left.subtreeStructuredContents !== right.subtreeStructuredContents) {
    return right.subtreeStructuredContents - left.subtreeStructuredContents;
  }

  return left.folderId - right.folderId;
}

function compareSitesByVolume(left: ContentStatsSite, right: ContentStatsSite): number {
  if (left.structuredContents !== right.structuredContents) {
    return right.structuredContents - left.structuredContents;
  }

  return left.groupId - right.groupId;
}

function compareSites(left: ContentStatsSite, right: ContentStatsSite, sortBy: 'site' | 'name' | 'content'): number {
  if (sortBy === 'name') {
    return left.name.localeCompare(right.name) || left.groupId - right.groupId;
  }

  if (sortBy === 'site') {
    return left.siteFriendlyUrl.localeCompare(right.siteFriendlyUrl) || left.groupId - right.groupId;
  }

  return compareSitesByVolume(left, right);
}

function isGatewayError(error: unknown): error is CliError {
  return error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR';
}

function getGatewayStatus(error: CliError): number | undefined {
  const match = /status=(\d+)/.exec(error.message);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}
