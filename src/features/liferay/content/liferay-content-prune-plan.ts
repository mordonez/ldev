import {runConcurrent} from '../../../core/concurrency.js';
import type {Printer} from '../../../core/output/printer.js';
import {runStep} from '../../../core/output/run-step.js';
import {normalizeLocalizedName} from '../inventory/liferay-inventory-shared.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {fetchJournalArticleRowsInFolder} from './liferay-content-journal-shared.js';
import {computeRemovableFolderIds, type FolderTree} from './liferay-content-prune-folders.js';

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

export type HeadlessArticle = {
  id?: number;
  key?: string;
  title?: string | Record<string, string>;
  dateModified?: string;
  contentStructureId?: number;
};

export type ArticleWithFolder = HeadlessArticle & {folderId: number};

export type ArticlePlan = {
  article: ArticleWithFolder;
  structureKey: string;
  action: 'keep' | 'delete';
};

export type PrunePlanSummary = {
  candidateArticles: ArticleWithFolder[];
  summaryByKey: Map<string, StructurePruneSummary>;
  toDelete: ArticleWithFolder[];
  keptCount: number;
  plannedRemovableFolderIds: number[];
  sampleArticles: SampleArticle[];
};

export async function fetchJournalArticlesInFolder(
  gateway: LiferayGateway,
  groupId: number,
  folderId: number,
): Promise<ArticleWithFolder[]> {
  const rows = await fetchJournalArticleRowsInFolder(gateway, groupId, folderId);

  return rows.map((article) => ({
    id: Number(article.resourcePrimKey ?? 0),
    key: article.articleId,
    title: article.titleCurrentValue ?? '',
    dateModified: typeof article.modifiedDate === 'number' ? new Date(article.modifiedDate).toISOString() : undefined,
    contentStructureId: article.DDMStructureId !== undefined ? Number(article.DDMStructureId) : undefined,
    folderId: article.folderId !== undefined ? Number(article.folderId) : folderId,
  }));
}

export function filterCandidateArticles(
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

export function buildPlan(
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

export function buildStructureSummary(
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

export function buildArticleCountByFolder(articles: ArticleWithFolder[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const article of articles) {
    counts.set(article.folderId, (counts.get(article.folderId) ?? 0) + 1);
  }

  return counts;
}

export function buildSampleArticles(plan: ArticlePlan[]): SampleArticle[] {
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

export function compareArticlesByRecencyDescThenIdAsc(left: HeadlessArticle, right: HeadlessArticle): number {
  const leftTime = left.dateModified ? new Date(left.dateModified).getTime() : 0;
  const rightTime = right.dateModified ? new Date(right.dateModified).getTime() : 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return (left.id ?? 0) - (right.id ?? 0);
}

export function dedupeArticles(articles: ArticleWithFolder[]): ArticleWithFolder[] {
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
const ARTICLE_INVENTORY_CONCURRENCY = 2;

export async function collectPruneArticles(
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

export async function buildPrunePlanSummary(
  printer: Printer | undefined,
  structures: string[] | undefined,
  keep: number | undefined,
  keepScope: 'folder' | 'structure' | undefined,
  rootFolderIds: number[],
  tree: FolderTree,
  allArticles: ArticleWithFolder[],
  structureMap: Map<number, string>,
  structureNameMap: Map<string, string>,
): Promise<PrunePlanSummary> {
  const candidateArticles = filterCandidateArticles(allArticles, structures, structureMap);
  const keepPerBucket = keep ?? 0;
  const keepScopeResolved = keepScope ?? 'folder';
  const plan = await runStep(printer, 'Planning content prune', async () =>
    buildPlan(candidateArticles, structureMap, keepPerBucket, keepScopeResolved),
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
