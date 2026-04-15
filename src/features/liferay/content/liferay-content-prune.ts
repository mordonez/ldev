import type {AppConfig} from '../../../core/config/load-config.js';
import {runConcurrent} from '../../../core/concurrency.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type LiferayApiClient} from '../../../core/http/client.js';
import type {Printer} from '../../../core/output/printer.js';
import {runStep} from '../../../core/output/run-step.js';
import {LiferayErrors} from '../errors/index.js';
import {fetchAccessToken, normalizeLocalizedName, resolveSite} from '../inventory/liferay-inventory-shared.js';
import {
  authedGetWithRefresh,
  fetchJournalArticleRowsInFolder,
  hydrateMissingJournalStructureDefinitions,
  resolveJournalStructureDefinitions,
} from './liferay-content-journal-shared.js';

// === Public types ===

export type ContentPruneOptions = {
  site?: string;
  groupId?: number;
  rootFolders: number[];
  structures?: string[];
  keep?: number;
  keepScope?: 'folder' | 'structure';
  dryRun?: boolean;
};

export type StructurePruneSummary = {
  key: string;
  name: string;
  found: number;
  kept: number;
  deleted: number;
};

export type SampleArticle = {
  id: number;
  title: string;
  structureKey: string;
  modifiedDate: string;
  action: 'keep' | 'delete';
};

export type FailedArticle = {
  id: number;
  articleId: string;
  status?: number;
  operation: 'delete-article';
};

export type FailedFolder = {
  folderId: number;
  status?: number;
  operation: 'delete-folder';
};

export type ContentPruneResult = {
  ok: boolean;
  mode: 'dry-run' | 'apply';
  groupId: number;
  siteFriendlyUrl?: string;
  rootFolders: number[];
  folderCount: number;
  articleCount: number;
  keptCount: number;
  deletedCount: number;
  structures: StructurePruneSummary[];
  sampleArticles: SampleArticle[];
  removedFolders: number[];
  missingFolders: number[];
  failedArticles: FailedArticle[];
  failedFolders: FailedFolder[];
};

// === Internal types ===

type PruneDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
  printer?: Printer;
};

type PruneAuthState = {
  accessToken: string;
  tokenClient: OAuthTokenClient;
};

type HeadlessFolder = {
  id?: number;
  name?: string;
  siteId?: number;
  numberOfStructuredContents?: number;
};

type HeadlessArticle = {
  id?: number;
  key?: string;
  title?: string | Record<string, string>;
  dateModified?: string;
  contentStructureId?: number;
};

type ArticleWithFolder = HeadlessArticle & {folderId: number};

type ArticlePlan = {
  article: ArticleWithFolder;
  structureKey: string;
  action: 'keep' | 'delete';
};

type FolderTree = {
  allFolders: Map<number, HeadlessFolder>;
  childrenMap: Map<number, number[]>;
  depths: Map<number, number>;
  missingRootFolders: number[];
};

const ARTICLE_DELETE_CONCURRENCY = 2;
const ARTICLE_INVENTORY_CONCURRENCY = 2;

// === Main export ===

export async function runContentPrune(
  config: AppConfig,
  options: ContentPruneOptions,
  dependencies?: PruneDependencies,
): Promise<ContentPruneResult> {
  if (
    (options.site === undefined && options.groupId === undefined) ||
    (options.site && options.groupId !== undefined)
  ) {
    throw LiferayErrors.contentPruneError('Use exactly one of site or groupId.');
  }

  const rootFolderIds = [...new Set(options.rootFolders)];
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const printer = dependencies?.printer;
  const authState: PruneAuthState = {
    accessToken: await fetchAccessToken(config, {tokenClient}),
    tokenClient,
  };
  const deps = {apiClient, accessToken: authState.accessToken};

  // 1. Resolve groupId
  let groupId: number;
  let siteFriendlyUrl: string | undefined;

  if (options.site) {
    const site = await resolveSite(config, options.site, deps);
    groupId = site.id;
    siteFriendlyUrl = site.friendlyUrlPath;
  } else {
    groupId = options.groupId!;
  }

  const wholeFolderDelete = !options.dryRun && canDeleteWholeFolders(options);

  // 2. Validate root folders and build folder tree
  const tree = await runStep(printer, 'Resolving folder scope', () =>
    collectFolderTree(config, apiClient, authState, rootFolderIds, groupId, wholeFolderDelete),
  );

  if (wholeFolderDelete) {
    const removedFolders: number[] = [];
    const failedFolders: FailedFolder[] = [];
    const articleCount = countStructuredContents(tree.allFolders);
    const existingRootFolders = rootFolderIds.filter((folderId) => tree.allFolders.has(folderId));

    await runStep(printer, 'Deleting root folders', async () => {
      for (const folderId of existingRootFolders) {
        const deletion = await deleteJournalFolder(config, apiClient, authState, folderId);
        if (deletion.ok) {
          removedFolders.push(folderId);
        } else {
          failedFolders.push({folderId, status: deletion.status, operation: 'delete-folder'});
        }
      }
    });

    return {
      ok: true,
      mode: options.dryRun ? 'dry-run' : 'apply',
      groupId,
      siteFriendlyUrl,
      rootFolders: rootFolderIds,
      folderCount: tree.allFolders.size,
      articleCount,
      keptCount: 0,
      deletedCount: options.dryRun
        ? articleCount
        : countStructuredContentsForRoots(removedFolders, tree.allFolders, tree.childrenMap),
      structures: [],
      sampleArticles: [],
      removedFolders,
      missingFolders: tree.missingRootFolders,
      failedArticles: [],
      failedFolders,
    };
  }

  // 3. Resolve structures
  const structureMap = new Map<number, string>(); // structureId -> key
  const structureNameMap = new Map<string, string>(); // key -> name

  await runStep(printer, 'Resolving journal structures', () =>
    resolveJournalStructureDefinitions(config, apiClient, authState, groupId, structureMap, structureNameMap),
  );

  if (options.structures && options.structures.length > 0) {
    for (const key of options.structures) {
      const found = [...structureMap.values()].includes(key);
      if (!found) {
        throw LiferayErrors.contentPruneError(`Structure "${key}" not found in group ${groupId}.`);
      }
    }
  }

  // 4. Fetch all articles in all folders
  const allArticles = await runStep(printer, 'Collecting journal articles', async () => {
    const articles: ArticleWithFolder[] = [];
    await runConcurrent([...tree.allFolders.keys()], ARTICLE_INVENTORY_CONCURRENCY, async (folderId) => {
      const folderArticles = await fetchJournalArticlesInFolder(config, apiClient, authState, groupId, folderId);
      articles.push(...folderArticles);
    });

    return dedupeArticles(articles);
  });

  await runStep(printer, 'Hydrating missing structure metadata', () =>
    hydrateMissingJournalStructureDefinitions(
      config,
      apiClient,
      authState,
      allArticles.map((article) => article.contentStructureId).filter(isPresentNumber),
      structureMap,
      structureNameMap,
    ),
  );

  // 5. Filter by structure (if structures specified)
  let candidateArticles: ArticleWithFolder[];
  if (options.structures && options.structures.length > 0) {
    const filterKeys = new Set(options.structures);
    candidateArticles = allArticles.filter((a) => {
      const key = a.contentStructureId !== undefined ? structureMap.get(a.contentStructureId) : undefined;
      return key !== undefined && filterKeys.has(key);
    });
  } else {
    candidateArticles = allArticles;
  }

  // 6. Plan: group by folder or structure, sort deterministically, apply keep
  const keepPerBucket = options.keep ?? 0;
  const keepScope = options.keepScope ?? 'folder';
  const plan = await runStep(printer, 'Planning content prune', async () =>
    buildPlan(candidateArticles, structureMap, keepPerBucket, keepScope),
  );

  // 7. Build structure summaries
  const summaryByKey = new Map<string, StructurePruneSummary>();
  for (const item of plan) {
    const entry = summaryByKey.get(item.structureKey);
    if (entry) {
      entry.found++;
      if (item.action === 'keep') entry.kept++;
      else entry.deleted++;
    } else {
      summaryByKey.set(item.structureKey, {
        key: item.structureKey,
        name: structureNameMap.get(item.structureKey) ?? item.structureKey,
        found: 1,
        kept: item.action === 'keep' ? 1 : 0,
        deleted: item.action === 'delete' ? 1 : 0,
      });
    }
  }

  const toDelete = plan.filter((p) => p.action === 'delete').map((p) => p.article);
  const keptCount = plan.filter((p) => p.action === 'keep').length;

  // 8. Determine removable folders (only possible when all articles in a folder are deleted)
  const toDeleteByFolder = new Map<number, number>();
  for (const article of toDelete) {
    toDeleteByFolder.set(article.folderId, (toDeleteByFolder.get(article.folderId) ?? 0) + 1);
  }

  const plannedRemovableFolderIds = computeRemovableFolderIds(
    rootFolderIds,
    tree.allFolders,
    tree.childrenMap,
    tree.depths,
    toDeleteByFolder,
  );

  // 9. Build stable sample (sorted by date desc + id asc)
  const sampleArticles: SampleArticle[] = plan
    .filter((p) => p.action === 'delete')
    .sort((left, right) => compareArticlesByRecencyDescThenIdAsc(left.article, right.article))
    .slice(0, 5)
    .map((p) => ({
      id: p.article.id ?? 0,
      title: normalizeLocalizedName(p.article.title),
      structureKey: p.structureKey,
      modifiedDate: p.article.dateModified ?? '',
      action: 'delete' as const,
    }));

  // 10. Execute (if not dry-run)
  const removedFolders: number[] = [];
  const failedArticles: FailedArticle[] = [];
  const failedFolders: FailedFolder[] = [];
  const deletedByFolder = new Map<number, number>();
  if (!options.dryRun) {
    await runStep(printer, 'Deleting journal articles', async () => {
      await runConcurrent(toDelete, ARTICLE_DELETE_CONCURRENCY, async (article) => {
        const failure = await deleteJournalArticle(
          config,
          apiClient,
          authState,
          groupId,
          article.id ?? 0,
          article.key ?? String(article.id ?? ''),
        );
        if (failure) {
          failedArticles.push(failure);
          return;
        }

        deletedByFolder.set(article.folderId, (deletedByFolder.get(article.folderId) ?? 0) + 1);
      });
    });

    await runStep(printer, 'Deleting empty folders', async () => {
      const sortedRemovable = computeRemovableFolderIds(
        rootFolderIds,
        tree.allFolders,
        tree.childrenMap,
        tree.depths,
        deletedByFolder,
      );
      for (const folderId of sortedRemovable) {
        const deletion = await tryDeleteFolder(config, apiClient, authState, folderId);
        if (deletion.ok) removedFolders.push(folderId);
        else failedFolders.push({folderId, status: deletion.status, operation: 'delete-folder'});
      }
    });
  }

  return {
    ok: true,
    mode: options.dryRun ? 'dry-run' : 'apply',
    groupId,
    siteFriendlyUrl,
    rootFolders: rootFolderIds,
    folderCount: tree.allFolders.size,
    articleCount: candidateArticles.length,
    keptCount,
    deletedCount: options.dryRun ? toDelete.length : Math.max(toDelete.length - failedArticles.length, 0),
    structures: [...summaryByKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
    sampleArticles,
    removedFolders: options.dryRun ? plannedRemovableFolderIds : removedFolders,
    missingFolders: [],
    failedArticles,
    failedFolders,
  };
}

export function formatContentPrune(result: ContentPruneResult): string {
  const lines: string[] = [];

  lines.push(result.mode === 'dry-run' ? 'CONTENT_PRUNE_DRY_RUN' : 'CONTENT_PRUNE_APPLY');
  lines.push(`groupId=${result.groupId}`);
  if (result.siteFriendlyUrl) {
    lines.push(`site=${result.siteFriendlyUrl}`);
  }
  lines.push(`rootFolders=${result.rootFolders.join(',')}`);
  lines.push(`folderCount=${result.folderCount}`);
  lines.push(`articleCount=${result.articleCount}`);
  lines.push(`keptCount=${result.keptCount}`);
  lines.push(`deletedCount=${result.deletedCount}`);

  if (result.structures.length > 0) {
    lines.push('');
    lines.push('Breakdown by structure:');
    for (const s of result.structures) {
      lines.push(`  ${s.key} (${s.name}): found=${s.found} kept=${s.kept} deleted=${s.deleted}`);
    }
  }

  if (result.sampleArticles.length > 0) {
    lines.push('');
    lines.push('Sample articles to delete:');
    for (const a of result.sampleArticles) {
      lines.push(`  id=${a.id} [${a.structureKey}] "${a.title}" modified=${a.modifiedDate}`);
    }
  }

  if (result.removedFolders.length > 0) {
    const label = result.mode === 'dry-run' ? 'Folders planned for removal:' : 'Removed folders:';
    lines.push('');
    lines.push(`${label} ${result.removedFolders.join(', ')}`);
  }

  if (result.missingFolders.length > 0) {
    lines.push('');
    lines.push(`Already missing folders: ${result.missingFolders.join(', ')}`);
  }

  if (result.failedArticles.length > 0) {
    lines.push('');
    lines.push(`Failed articles: ${result.failedArticles.length}`);
    for (const failure of result.failedArticles.slice(0, 5)) {
      lines.push(
        `  articleId=${failure.articleId} id=${failure.id} operation=${failure.operation} status=${failure.status ?? 'unknown'}`,
      );
    }
  }

  if (result.failedFolders.length > 0) {
    lines.push('');
    lines.push(`Failed folders: ${result.failedFolders.length}`);
    for (const failure of result.failedFolders.slice(0, 5)) {
      lines.push(`  folderId=${failure.folderId} operation=${failure.operation} status=${failure.status ?? 'unknown'}`);
    }
  }

  if (result.mode === 'dry-run') {
    lines.push('');
    lines.push('(dry-run: no changes applied)');
  }

  return lines.join('\n');
}

// === Private helpers ===

async function collectFolderTree(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  rootFolderIds: number[],
  groupId: number,
  ignoreMissingRootFolders = false,
): Promise<FolderTree> {
  const allFolders = new Map<number, HeadlessFolder>();
  const childrenMap = new Map<number, number[]>();
  const depths = new Map<number, number>();
  const missingRootFolders: number[] = [];

  for (const rootId of rootFolderIds) {
    if (allFolders.has(rootId)) continue;

    const resp = await authedGetWithRefresh<HeadlessFolder>(
      config,
      apiClient,
      authState,
      `/o/headless-delivery/v1.0/structured-content-folders/${rootId}`,
    );

    if (!resp.ok) {
      if (ignoreMissingRootFolders && resp.status === 404) {
        missingRootFolders.push(rootId);
        continue;
      }

      throw LiferayErrors.contentPruneError(`Folder ${rootId} not found (status=${resp.status}).`);
    }

    const folder = resp.data ?? {};
    if (folder.siteId !== groupId) {
      throw LiferayErrors.contentPruneError(
        `Folder ${rootId} belongs to group ${folder.siteId ?? 'unknown'}, not ${groupId}.`,
      );
    }

    allFolders.set(rootId, folder);
    depths.set(rootId, 0);
    await collectSubfolders(config, apiClient, authState, rootId, 1, allFolders, childrenMap, depths);
  }

  return {allFolders, childrenMap, depths, missingRootFolders};
}

async function collectSubfolders(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  parentId: number,
  depth: number,
  allFolders: Map<number, HeadlessFolder>,
  childrenMap: Map<number, number[]>,
  depths: Map<number, number>,
): Promise<void> {
  const subfolders: HeadlessFolder[] = [];
  let page = 1;

  while (true) {
    const response = await authedGetWithRefresh<{items?: HeadlessFolder[]; lastPage?: number}>(
      config,
      apiClient,
      authState,
      `/o/headless-delivery/v1.0/structured-content-folders/${parentId}/structured-content-folders?page=${page}&pageSize=200`,
    );

    if (!response.ok) {
      throw LiferayErrors.contentPruneError(`Subfolders for folder ${parentId} failed with status=${response.status}.`);
    }

    const items = response.data?.items ?? [];
    subfolders.push(...items);

    const lastPage = response.data?.lastPage ?? page;
    if (page >= lastPage) {
      break;
    }

    page += 1;
  }

  const children: number[] = [];
  for (const sf of subfolders) {
    if (!sf.id || allFolders.has(sf.id)) continue;
    allFolders.set(sf.id, sf);
    depths.set(sf.id, depth);
    children.push(sf.id);
    await collectSubfolders(config, apiClient, authState, sf.id, depth + 1, allFolders, childrenMap, depths);
  }

  childrenMap.set(parentId, children);
}

async function fetchJournalArticlesInFolder(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  groupId: number,
  folderId: number,
): Promise<ArticleWithFolder[]> {
  const rows = await fetchJournalArticleRowsInFolder(
    config,
    apiClient,
    authState,
    groupId,
    folderId,
    'LIFERAY_CONTENT_PRUNE_ERROR',
  );

  return rows.map((article) => ({
    id: Number(article.resourcePrimKey ?? 0),
    key: article.articleId,
    title: article.titleCurrentValue ?? '',
    dateModified: typeof article.modifiedDate === 'number' ? new Date(article.modifiedDate).toISOString() : undefined,
    contentStructureId: article.DDMStructureId !== undefined ? Number(article.DDMStructureId) : undefined,
    folderId: article.folderId !== undefined ? Number(article.folderId) : folderId,
  }));
}

function buildPlan(
  articles: ArticleWithFolder[],
  structureMap: Map<number, string>,
  keepPerBucket: number,
  keepScope: 'folder' | 'structure',
): ArticlePlan[] {
  const byBucket = new Map<string, ArticleWithFolder[]>();

  for (const article of articles) {
    const key =
      article.contentStructureId !== undefined
        ? (structureMap.get(article.contentStructureId) ?? `unknown_${article.contentStructureId}`)
        : 'unknown';
    const bucketKey = keepScope === 'folder' ? `folder_${article.folderId}` : `structure_${key}`;
    const bucket = byBucket.get(bucketKey) ?? [];
    bucket.push(article);
    byBucket.set(bucketKey, bucket);
  }

  const plan: ArticlePlan[] = [];

  for (const bucket of byBucket.values()) {
    const sorted = bucket.slice().sort(compareArticlesByRecencyDescThenIdAsc);

    for (let i = 0; i < sorted.length; i++) {
      const article = sorted[i]!;
      const structureKey =
        article.contentStructureId !== undefined
          ? (structureMap.get(article.contentStructureId) ?? `unknown_${article.contentStructureId}`)
          : 'unknown';

      plan.push({
        article,
        structureKey,
        action: i < keepPerBucket ? 'keep' : 'delete',
      });
    }
  }

  return plan;
}

function compareArticlesByRecencyDescThenIdAsc(left: HeadlessArticle, right: HeadlessArticle): number {
  const leftTime = left.dateModified ? new Date(left.dateModified).getTime() : 0;
  const rightTime = right.dateModified ? new Date(right.dateModified).getTime() : 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return (left.id ?? 0) - (right.id ?? 0);
}

function computeRemovableFolderIds(
  rootFolderIds: number[],
  allFolders: Map<number, HeadlessFolder>,
  childrenMap: Map<number, number[]>,
  depths: Map<number, number>,
  toDeleteByFolder: Map<number, number>,
): number[] {
  const result = new Set<number>();
  const removableCache = new Map<number, boolean>();

  function isRemovable(folderId: number): boolean {
    const cached = removableCache.get(folderId);
    if (cached !== undefined) {
      return cached;
    }

    const folder = allFolders.get(folderId);
    if (!folder) {
      removableCache.set(folderId, false);
      return false;
    }

    const totalArticles = folder.numberOfStructuredContents;
    if (totalArticles === undefined) {
      removableCache.set(folderId, false);
      return false;
    } // unknown total — be conservative

    const deletedCount = toDeleteByFolder.get(folderId) ?? 0;
    if (deletedCount !== totalArticles) {
      removableCache.set(folderId, false);
      return false;
    } // not all articles deleted

    const children = childrenMap.get(folderId) ?? [];
    const removable = children.every((childId) => isRemovable(childId));
    removableCache.set(folderId, removable);
    return removable;
  }

  function collect(folderId: number): void {
    if (isRemovable(folderId)) {
      result.add(folderId);
      for (const childId of childrenMap.get(folderId) ?? []) {
        collect(childId);
      }
    }
  }

  for (const rootId of new Set(rootFolderIds)) {
    collect(rootId);
  }

  // Sort bottom-up (deepest first) for safe deletion order
  return [...result].sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));
}

async function deleteJournalArticle(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  groupId: number,
  id: number,
  articleId: string,
): Promise<FailedArticle | null> {
  if (!articleId) {
    throw LiferayErrors.contentPruneError('Cannot delete article without articleId.');
  }

  const response = await postFormWithRefresh(
    config,
    apiClient,
    authState,
    '/api/jsonws/journal.journalarticle/delete-article',
    {
      groupId: String(groupId),
      articleId,
      articleURL: '',
    },
  );

  if (response.ok || response.status === 404) {
    return null;
  }

  return {
    id,
    articleId,
    status: response.status,
    operation: 'delete-article',
  };
}

async function tryDeleteFolder(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  folderId: number,
): Promise<{ok: boolean; status?: number}> {
  const response = await deleteWithRefresh(
    config,
    apiClient,
    authState,
    `/o/headless-delivery/v1.0/structured-content-folders/${folderId}`,
  );

  return {ok: response.ok || response.status === 404, status: response.status};
}

async function deleteJournalFolder(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  folderId: number,
): Promise<{ok: boolean; status?: number}> {
  const timeoutSeconds = Math.max(config.liferay.timeoutSeconds, 600);
  const response = await postFormWithRefresh(
    config,
    apiClient,
    authState,
    '/api/jsonws/journal.journalfolder/delete-folder',
    {
      folderId: String(folderId),
      includeTrashedEntries: 'true',
    },
    timeoutSeconds,
  );

  return {
    ok: response.ok || response.status === 404,
    status: response.status,
  };
}

function dedupeArticles(articles: ArticleWithFolder[]): ArticleWithFolder[] {
  const unique = new Map<string, ArticleWithFolder>();

  for (const article of articles) {
    const dedupeKey = article.id !== undefined ? `id:${article.id}` : `article:${article.key ?? ''}`;
    const current = unique.get(dedupeKey);
    if (!current || compareArticlesByRecencyDescThenIdAsc(article, current) < 0) {
      unique.set(dedupeKey, article);
    }
  }

  return [...unique.values()];
}

function countStructuredContents(allFolders: Map<number, HeadlessFolder>): number {
  let total = 0;

  for (const folder of allFolders.values()) {
    total += folder.numberOfStructuredContents ?? 0;
  }

  return total;
}

function countStructuredContentsForRoots(
  rootFolderIds: number[],
  allFolders: Map<number, HeadlessFolder>,
  childrenMap: Map<number, number[]>,
): number {
  let total = 0;
  const visited = new Set<number>();

  function visit(folderId: number): void {
    if (visited.has(folderId)) {
      return;
    }

    visited.add(folderId);
    total += allFolders.get(folderId)?.numberOfStructuredContents ?? 0;

    for (const childId of childrenMap.get(folderId) ?? []) {
      visit(childId);
    }
  }

  for (const rootFolderId of rootFolderIds) {
    visit(rootFolderId);
  }

  return total;
}

function isPresentNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function canDeleteWholeFolders(options: ContentPruneOptions): boolean {
  return (!options.structures || options.structures.length === 0) && (options.keep === undefined || options.keep === 0);
}

async function deleteWithRefresh<T>(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  path: string,
) {
  let response = await apiClient.delete<T>(config.liferay.url, path, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {Authorization: `Bearer ${authState.accessToken}`},
  });

  if (response.status !== 401) {
    return response;
  }

  authState.accessToken = await fetchAccessToken(config, {
    apiClient,
    tokenClient: authState.tokenClient,
    forceRefresh: true,
  });
  response = await apiClient.delete<T>(config.liferay.url, path, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {Authorization: `Bearer ${authState.accessToken}`},
  });

  return response;
}

async function postFormWithRefresh<T>(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: PruneAuthState,
  path: string,
  form: Record<string, string>,
  timeoutSeconds = config.liferay.timeoutSeconds,
) {
  let response = await apiClient.postForm<T>(config.liferay.url, path, form, {
    timeoutSeconds,
    headers: {Authorization: `Bearer ${authState.accessToken}`},
  });

  if (response.status !== 401) {
    return response;
  }

  authState.accessToken = await fetchAccessToken(config, {
    apiClient,
    tokenClient: authState.tokenClient,
    forceRefresh: true,
  });
  response = await apiClient.postForm<T>(config.liferay.url, path, form, {
    timeoutSeconds,
    headers: {Authorization: `Bearer ${authState.accessToken}`},
  });

  return response;
}
