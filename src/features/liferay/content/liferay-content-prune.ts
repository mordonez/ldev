import type {AppConfig} from '../../../core/config/load-config.js';
import {runConcurrent} from '../../../core/concurrency.js';
import {CliError} from '../../../core/errors.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type LiferayApiClient} from '../../../core/http/client.js';
import type {Printer} from '../../../core/output/printer.js';
import {runStep} from '../../../core/output/run-step.js';
import {LiferayErrors} from '../errors/index.js';
import {normalizeLocalizedName, resolveSite} from '../inventory/liferay-inventory-shared.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {
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

type PruneContext = {
  apiClient: LiferayApiClient;
  tokenClient: OAuthTokenClient;
  printer?: Printer;
  gateway: LiferayGateway;
  longRunningGateway: LiferayGateway;
  groupId: number;
  siteFriendlyUrl?: string;
  rootFolderIds: number[];
  wholeFolderDelete: boolean;
};

type StructureResolution = {
  structureMap: Map<number, string>;
  structureNameMap: Map<string, string>;
};

type PrunePlanSummary = {
  candidateArticles: ArticleWithFolder[];
  summaryByKey: Map<string, StructurePruneSummary>;
  toDelete: ArticleWithFolder[];
  keptCount: number;
  plannedRemovableFolderIds: number[];
  sampleArticles: SampleArticle[];
};

type PruneExecutionResult = {
  removedFolders: number[];
  failedArticles: FailedArticle[];
  failedFolders: FailedFolder[];
};

const ARTICLE_DELETE_CONCURRENCY = 2;
const ARTICLE_INVENTORY_CONCURRENCY = 2;

// === Main export ===

export async function runContentPrune(
  config: AppConfig,
  options: ContentPruneOptions,
  dependencies?: PruneDependencies,
): Promise<ContentPruneResult> {
  assertValidContentPruneOptions(options);

  const context = await createPruneContext(config, options, dependencies);
  const tree = await runStep(context.printer, 'Resolving folder scope', () =>
    collectFolderTree(context.gateway, context.rootFolderIds, context.groupId, context.wholeFolderDelete),
  );

  if (context.wholeFolderDelete) {
    return runWholeFolderDelete(context, options, tree);
  }

  const {structureMap, structureNameMap} = await resolvePruneStructures(config, context, options);
  const allArticles = await collectPruneArticles(context.printer, context.longRunningGateway, context.groupId, tree);

  await runStep(context.printer, 'Hydrating missing structure metadata', () =>
    hydrateMissingJournalStructureDefinitions(
      context.gateway,
      allArticles.map((article) => article.contentStructureId).filter(isPresentNumber),
      structureMap,
      structureNameMap,
    ),
  );

  const planSummary = await buildPrunePlanSummary(
    context.printer,
    options,
    context.rootFolderIds,
    tree,
    allArticles,
    structureMap,
    structureNameMap,
  );

  const execution = options.dryRun
    ? {removedFolders: [], failedArticles: [], failedFolders: []}
    : await executePrunePlan(
        context.printer,
        context.gateway,
        context.groupId,
        context.rootFolderIds,
        tree,
        planSummary.toDelete,
      );

  return buildPruneResult(context, options, tree, planSummary, execution);
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

function assertValidContentPruneOptions(options: ContentPruneOptions): void {
  if (
    (options.site === undefined && options.groupId === undefined) ||
    (options.site && options.groupId !== undefined)
  ) {
    throw LiferayErrors.contentPruneError('Use exactly one of site or groupId.');
  }
}

async function createPruneContext(
  config: AppConfig,
  options: ContentPruneOptions,
  dependencies?: PruneDependencies,
): Promise<PruneContext> {
  const rootFolderIds = [...new Set(options.rootFolders)];
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
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

  let groupId: number;
  let siteFriendlyUrl: string | undefined;

  if (options.site) {
    const site = await resolveSite(config, options.site, {apiClient, tokenClient});
    groupId = site.id;
    siteFriendlyUrl = site.friendlyUrlPath;
  } else {
    groupId = options.groupId!;
  }

  return {
    apiClient,
    tokenClient,
    printer: dependencies?.printer,
    gateway,
    longRunningGateway,
    groupId,
    siteFriendlyUrl,
    rootFolderIds,
    wholeFolderDelete: !options.dryRun && canDeleteWholeFolders(options),
  };
}

async function runWholeFolderDelete(
  context: PruneContext,
  options: ContentPruneOptions,
  tree: FolderTree,
): Promise<ContentPruneResult> {
  const removedFolders: number[] = [];
  const failedFolders: FailedFolder[] = [];
  const articleCount = countStructuredContents(tree.allFolders);
  const existingRootFolders = context.rootFolderIds.filter((folderId) => tree.allFolders.has(folderId));

  await runStep(context.printer, 'Deleting root folders', async () => {
    for (const folderId of existingRootFolders) {
      const deletion = await deleteJournalFolder(context.longRunningGateway, folderId);
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
    groupId: context.groupId,
    siteFriendlyUrl: context.siteFriendlyUrl,
    rootFolders: context.rootFolderIds,
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

async function resolvePruneStructures(
  config: AppConfig,
  context: PruneContext,
  options: ContentPruneOptions,
): Promise<StructureResolution> {
  const structureMap = new Map<number, string>();
  const structureNameMap = new Map<string, string>();

  await runStep(context.printer, 'Resolving journal structures', () =>
    resolveJournalStructureDefinitions(
      config,
      context.apiClient,
      context.tokenClient,
      context.groupId,
      structureMap,
      structureNameMap,
    ),
  );

  if (options.structures && options.structures.length > 0) {
    const availableKeys = new Set(structureMap.values());
    for (const key of options.structures) {
      if (!availableKeys.has(key)) {
        throw LiferayErrors.contentPruneError(`Structure "${key}" not found in group ${context.groupId}.`);
      }
    }
  }

  return {structureMap, structureNameMap};
}

async function collectPruneArticles(
  printer: Printer | undefined,
  gateway: LiferayGateway,
  groupId: number,
  tree: FolderTree,
): Promise<ArticleWithFolder[]> {
  return runStep(printer, 'Collecting journal articles', async () => {
    const articles: ArticleWithFolder[] = [];
    await runConcurrent([...tree.allFolders.keys()], ARTICLE_INVENTORY_CONCURRENCY, async (folderId) => {
      const folderArticles = await fetchJournalArticlesInFolder(gateway, groupId, folderId);
      articles.push(...folderArticles);
    });

    return dedupeArticles(articles);
  });
}

async function buildPrunePlanSummary(
  printer: Printer | undefined,
  options: ContentPruneOptions,
  rootFolderIds: number[],
  tree: FolderTree,
  allArticles: ArticleWithFolder[],
  structureMap: Map<number, string>,
  structureNameMap: Map<string, string>,
): Promise<PrunePlanSummary> {
  const candidateArticles = filterCandidateArticles(allArticles, options.structures, structureMap);
  const keepPerBucket = options.keep ?? 0;
  const keepScope = options.keepScope ?? 'folder';
  const plan = await runStep(printer, 'Planning content prune', async () =>
    buildPlan(candidateArticles, structureMap, keepPerBucket, keepScope),
  );
  const summaryByKey = buildStructureSummary(plan, structureNameMap);
  const toDelete = plan.filter((item) => item.action === 'delete').map((item) => item.article);
  const keptCount = plan.filter((item) => item.action === 'keep').length;
  const plannedRemovableFolderIds = computeRemovableFolderIds(
    rootFolderIds,
    tree.allFolders,
    tree.childrenMap,
    tree.depths,
    buildArticleCountByFolder(toDelete),
  );

  return {
    candidateArticles,
    summaryByKey,
    toDelete,
    keptCount,
    plannedRemovableFolderIds,
    sampleArticles: buildSampleArticles(plan),
  };
}

async function executePrunePlan(
  printer: Printer | undefined,
  gateway: LiferayGateway,
  groupId: number,
  rootFolderIds: number[],
  tree: FolderTree,
  toDelete: ArticleWithFolder[],
): Promise<PruneExecutionResult> {
  const removedFolders: number[] = [];
  const failedArticles: FailedArticle[] = [];
  const failedFolders: FailedFolder[] = [];
  const deletedByFolder = new Map<number, number>();

  await runStep(printer, 'Deleting journal articles', async () => {
    await runConcurrent(toDelete, ARTICLE_DELETE_CONCURRENCY, async (article) => {
      const failure = await deleteJournalArticle(
        gateway,
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
      const deletion = await tryDeleteFolder(gateway, folderId);
      if (deletion.ok) {
        removedFolders.push(folderId);
      } else {
        failedFolders.push({folderId, status: deletion.status, operation: 'delete-folder'});
      }
    }
  });

  return {removedFolders, failedArticles, failedFolders};
}

function buildPruneResult(
  context: PruneContext,
  options: ContentPruneOptions,
  tree: FolderTree,
  planSummary: PrunePlanSummary,
  execution: PruneExecutionResult,
): ContentPruneResult {
  return {
    ok: true,
    mode: options.dryRun ? 'dry-run' : 'apply',
    groupId: context.groupId,
    siteFriendlyUrl: context.siteFriendlyUrl,
    rootFolders: context.rootFolderIds,
    folderCount: tree.allFolders.size,
    articleCount: planSummary.candidateArticles.length,
    keptCount: planSummary.keptCount,
    deletedCount: options.dryRun
      ? planSummary.toDelete.length
      : Math.max(planSummary.toDelete.length - execution.failedArticles.length, 0),
    structures: [...planSummary.summaryByKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    sampleArticles: planSummary.sampleArticles,
    removedFolders: options.dryRun ? planSummary.plannedRemovableFolderIds : execution.removedFolders,
    missingFolders: [],
    failedArticles: execution.failedArticles,
    failedFolders: execution.failedFolders,
  };
}

function filterCandidateArticles(
  allArticles: ArticleWithFolder[],
  structures: string[] | undefined,
  structureMap: Map<number, string>,
): ArticleWithFolder[] {
  if (!structures || structures.length === 0) {
    return allArticles;
  }

  const filterKeys = new Set(structures);
  return allArticles.filter((article) => {
    const key = article.contentStructureId !== undefined ? structureMap.get(article.contentStructureId) : undefined;
    return key !== undefined && filterKeys.has(key);
  });
}

function buildStructureSummary(
  plan: ArticlePlan[],
  structureNameMap: Map<string, string>,
): Map<string, StructurePruneSummary> {
  const summaryByKey = new Map<string, StructurePruneSummary>();

  for (const item of plan) {
    const entry = summaryByKey.get(item.structureKey);
    if (entry) {
      entry.found++;
      if (item.action === 'keep') {
        entry.kept++;
      } else {
        entry.deleted++;
      }
      continue;
    }

    summaryByKey.set(item.structureKey, {
      key: item.structureKey,
      name: structureNameMap.get(item.structureKey) ?? item.structureKey,
      found: 1,
      kept: item.action === 'keep' ? 1 : 0,
      deleted: item.action === 'delete' ? 1 : 0,
    });
  }

  return summaryByKey;
}

function buildArticleCountByFolder(articles: ArticleWithFolder[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const article of articles) {
    counts.set(article.folderId, (counts.get(article.folderId) ?? 0) + 1);
  }

  return counts;
}

function buildSampleArticles(plan: ArticlePlan[]): SampleArticle[] {
  return plan
    .filter((item) => item.action === 'delete')
    .sort((left, right) => compareArticlesByRecencyDescThenIdAsc(left.article, right.article))
    .slice(0, 5)
    .map((item) => ({
      id: item.article.id ?? 0,
      title: normalizeLocalizedName(item.article.title),
      structureKey: item.structureKey,
      modifiedDate: item.article.dateModified ?? '',
      action: 'delete',
    }));
}

async function collectFolderTree(
  gateway: LiferayGateway,
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

    let folder: HeadlessFolder;

    try {
      folder = await gateway.getJson<HeadlessFolder>(
        `/o/headless-delivery/v1.0/structured-content-folders/${rootId}`,
        `content folder ${rootId}`,
      );
    } catch (error) {
      if (ignoreMissingRootFolders && isGatewayStatus(error, 404)) {
        missingRootFolders.push(rootId);
        continue;
      }

      if (isGatewayError(error)) {
        throw LiferayErrors.contentPruneError(
          `Folder ${rootId} not found (status=${getGatewayStatus(error) ?? 'unknown'}).`,
        );
      }

      throw error;
    }

    if (folder.siteId !== groupId) {
      throw LiferayErrors.contentPruneError(
        `Folder ${rootId} belongs to group ${folder.siteId ?? 'unknown'}, not ${groupId}.`,
      );
    }

    allFolders.set(rootId, folder);
    depths.set(rootId, 0);
    await collectSubfolders(gateway, rootId, 1, allFolders, childrenMap, depths);
  }

  return {allFolders, childrenMap, depths, missingRootFolders};
}

async function collectSubfolders(
  gateway: LiferayGateway,
  parentId: number,
  depth: number,
  allFolders: Map<number, HeadlessFolder>,
  childrenMap: Map<number, number[]>,
  depths: Map<number, number>,
): Promise<void> {
  const subfolders: HeadlessFolder[] = [];
  let page = 1;

  while (true) {
    let response: {items?: HeadlessFolder[]; lastPage?: number};

    try {
      response = await gateway.getJson<{items?: HeadlessFolder[]; lastPage?: number}>(
        `/o/headless-delivery/v1.0/structured-content-folders/${parentId}/structured-content-folders?page=${page}&pageSize=200`,
        `content subfolders ${parentId}`,
      );
    } catch (error) {
      if (isGatewayError(error)) {
        throw LiferayErrors.contentPruneError(
          `Subfolders for folder ${parentId} failed with status=${getGatewayStatus(error) ?? 'unknown'}.`,
        );
      }

      throw error;
    }

    const items = response?.items ?? [];
    subfolders.push(...items);

    const lastPage = response?.lastPage ?? page;
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
    await collectSubfolders(gateway, sf.id, depth + 1, allFolders, childrenMap, depths);
  }

  childrenMap.set(parentId, children);
}

async function fetchJournalArticlesInFolder(
  gateway: LiferayGateway,
  groupId: number,
  folderId: number,
): Promise<ArticleWithFolder[]> {
  const rows = await fetchJournalArticleRowsInFolder(gateway, groupId, folderId, 'LIFERAY_CONTENT_PRUNE_ERROR');

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
  gateway: LiferayGateway,
  groupId: number,
  id: number,
  articleId: string,
): Promise<FailedArticle | null> {
  if (!articleId) {
    throw LiferayErrors.contentPruneError('Cannot delete article without articleId.');
  }

  try {
    await gateway.postForm<unknown>(
      '/api/jsonws/journal.journalarticle/delete-article',
      {
        groupId: String(groupId),
        articleId,
        articleURL: '',
      },
      `delete journal article ${articleId}`,
    );
    return null;
  } catch (error) {
    if (isGatewayStatus(error, 404)) {
      return null;
    }

    if (!isGatewayError(error)) {
      throw error;
    }

    return {
      id,
      articleId,
      status: getGatewayStatus(error),
      operation: 'delete-article',
    };
  }
}

async function tryDeleteFolder(gateway: LiferayGateway, folderId: number): Promise<{ok: boolean; status?: number}> {
  try {
    await gateway.deleteJson<unknown>(
      `/o/headless-delivery/v1.0/structured-content-folders/${folderId}`,
      `delete content folder ${folderId}`,
    );

    return {ok: true};
  } catch (error) {
    if (!isGatewayError(error)) {
      throw error;
    }

    const status = getGatewayStatus(error);
    return {ok: status === 404, status};
  }
}

async function deleteJournalFolder(gateway: LiferayGateway, folderId: number): Promise<{ok: boolean; status?: number}> {
  try {
    await gateway.postForm<unknown>(
      '/api/jsonws/journal.journalfolder/delete-folder',
      {
        folderId: String(folderId),
        includeTrashedEntries: 'true',
      },
      `delete journal folder ${folderId}`,
    );

    return {ok: true};
  } catch (error) {
    if (!isGatewayError(error)) {
      throw error;
    }

    const status = getGatewayStatus(error);
    return {
      ok: status === 404,
      status,
    };
  }
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

function isGatewayError(error: unknown): error is CliError {
  return error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR';
}

function isGatewayStatus(error: unknown, status: number): boolean {
  return isGatewayError(error) && error.message.includes(`status=${status}`);
}

function getGatewayStatus(error: CliError): number | undefined {
  const match = /status=(\d+)/.exec(error.message);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}
