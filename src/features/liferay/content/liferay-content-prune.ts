import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type LiferayApiClient} from '../../../core/http/client.js';
import {
  authedGet,
  fetchAccessToken,
  fetchPagedItems,
  normalizeLocalizedName,
  resolveSite,
} from '../inventory/liferay-inventory-shared.js';

// === Public types ===

export type ContentPruneOptions = {
  site?: string;
  groupId?: number;
  rootFolders: number[];
  structures?: string[];
  keep?: number;
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
};

// === Internal types ===

type PruneDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
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

type DataDefinition = {
  id?: number;
  dataDefinitionKey?: string;
  name?: string | Record<string, string>;
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
};

// === Main export ===

export async function runContentPrune(
  config: AppConfig,
  options: ContentPruneOptions,
  dependencies?: PruneDependencies,
): Promise<ContentPruneResult> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const accessToken = await fetchAccessToken(config, {tokenClient});
  const deps = {apiClient, accessToken};

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

  // 2. Validate root folders and build folder tree
  const tree = await collectFolderTree(config, apiClient, accessToken, options.rootFolders, groupId);

  // 3. Resolve structures
  const structureMap = new Map<number, string>(); // structureId -> key
  const structureNameMap = new Map<string, string>(); // key -> name

  const allDefs = await fetchPagedItems<DataDefinition>(
    config,
    `/o/data-engine/v2.0/sites/${groupId}/data-definitions/by-content-type/journal`,
    200,
    deps,
  );

  for (const def of allDefs) {
    if (def.id && def.dataDefinitionKey) {
      structureMap.set(def.id, def.dataDefinitionKey);
      structureNameMap.set(def.dataDefinitionKey, normalizeLocalizedName(def.name));
    }
  }

  if (options.structures && options.structures.length > 0) {
    for (const key of options.structures) {
      const found = [...structureMap.values()].includes(key);
      if (!found) {
        throw new CliError(`Structure "${key}" not found in group ${groupId}.`, {
          code: 'LIFERAY_CONTENT_PRUNE_ERROR',
        });
      }
    }
  }

  // 4. Fetch all articles in all folders
  const allArticles: ArticleWithFolder[] = [];
  for (const [folderId] of tree.allFolders) {
    const articles = await fetchPagedItems<HeadlessArticle>(
      config,
      `/o/headless-delivery/v1.0/structured-content-folders/${folderId}/structured-contents`,
      200,
      deps,
    );
    allArticles.push(...articles.map((a) => ({...a, folderId})));
  }

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

  // 6. Plan: group by structure, sort deterministically, apply keep
  const keepPerStructure = options.keep ?? 0;
  const plan = buildPlan(candidateArticles, structureMap, keepPerStructure);

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

  const removableFolderIds = computeRemovableFolderIds(
    options.rootFolders,
    tree.allFolders,
    tree.childrenMap,
    tree.depths,
    toDeleteByFolder,
  );

  // 9. Build stable sample (first 5 articles to delete, sorted by date desc + id asc)
  const sampleArticles: SampleArticle[] = plan
    .filter((p) => p.action === 'delete')
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
  if (!options.dryRun) {
    for (const article of toDelete) {
      await authedDeleteResource(
        config,
        apiClient,
        accessToken,
        `/o/headless-delivery/v1.0/structured-contents/${article.id}`,
      );
    }

    // Delete folders bottom-up (deepest first)
    const sortedRemovable = removableFolderIds
      .slice()
      .sort((a, b) => (tree.depths.get(b) ?? 0) - (tree.depths.get(a) ?? 0));
    for (const folderId of sortedRemovable) {
      const deleted = await tryDeleteFolder(config, apiClient, accessToken, folderId);
      if (deleted) removedFolders.push(folderId);
    }
  }

  return {
    ok: true,
    mode: options.dryRun ? 'dry-run' : 'apply',
    groupId,
    siteFriendlyUrl,
    rootFolders: options.rootFolders,
    folderCount: tree.allFolders.size,
    articleCount: candidateArticles.length,
    keptCount,
    deletedCount: toDelete.length,
    structures: [...summaryByKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
    sampleArticles,
    removedFolders: options.dryRun ? removableFolderIds : removedFolders,
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
  accessToken: string,
  rootFolderIds: number[],
  groupId: number,
): Promise<FolderTree> {
  const allFolders = new Map<number, HeadlessFolder>();
  const childrenMap = new Map<number, number[]>();
  const depths = new Map<number, number>();

  for (const rootId of rootFolderIds) {
    if (allFolders.has(rootId)) continue;

    const resp = await authedGet<HeadlessFolder>(
      config,
      apiClient,
      accessToken,
      `/o/headless-delivery/v1.0/structured-content-folders/${rootId}`,
    );

    if (!resp.ok) {
      throw new CliError(`Folder ${rootId} not found (status=${resp.status}).`, {
        code: 'LIFERAY_CONTENT_PRUNE_ERROR',
      });
    }

    const folder = resp.data ?? {};
    if (folder.siteId !== groupId) {
      throw new CliError(`Folder ${rootId} belongs to group ${folder.siteId ?? 'unknown'}, not ${groupId}.`, {
        code: 'LIFERAY_CONTENT_PRUNE_ERROR',
      });
    }

    allFolders.set(rootId, folder);
    depths.set(rootId, 0);
    await collectSubfolders(config, apiClient, accessToken, rootId, 1, allFolders, childrenMap, depths);
  }

  return {allFolders, childrenMap, depths};
}

async function collectSubfolders(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  parentId: number,
  depth: number,
  allFolders: Map<number, HeadlessFolder>,
  childrenMap: Map<number, number[]>,
  depths: Map<number, number>,
): Promise<void> {
  const subfolders = await fetchPagedItems<HeadlessFolder>(
    config,
    `/o/headless-delivery/v1.0/structured-content-folders/${parentId}/structured-content-folders`,
    200,
    {apiClient, accessToken},
  );

  const children: number[] = [];
  for (const sf of subfolders) {
    if (!sf.id || allFolders.has(sf.id)) continue;
    allFolders.set(sf.id, sf);
    depths.set(sf.id, depth);
    children.push(sf.id);
    await collectSubfolders(config, apiClient, accessToken, sf.id, depth + 1, allFolders, childrenMap, depths);
  }

  childrenMap.set(parentId, children);
}

function buildPlan(
  articles: ArticleWithFolder[],
  structureMap: Map<number, string>,
  keepPerStructure: number,
): ArticlePlan[] {
  const byStructure = new Map<string, ArticleWithFolder[]>();

  for (const article of articles) {
    const key =
      article.contentStructureId !== undefined
        ? (structureMap.get(article.contentStructureId) ?? `unknown_${article.contentStructureId}`)
        : 'unknown';
    const bucket = byStructure.get(key) ?? [];
    bucket.push(article);
    byStructure.set(key, bucket);
  }

  const plan: ArticlePlan[] = [];

  for (const [structureKey, bucket] of byStructure) {
    const sorted = bucket.slice().sort((a, b) => {
      const tA = a.dateModified ? new Date(a.dateModified).getTime() : 0;
      const tB = b.dateModified ? new Date(b.dateModified).getTime() : 0;
      if (tA !== tB) return tB - tA; // most recent first
      return (a.id ?? 0) - (b.id ?? 0); // stable tiebreaker: lower id first (older)
    });

    for (let i = 0; i < sorted.length; i++) {
      plan.push({
        article: sorted[i]!,
        structureKey,
        action: i < keepPerStructure ? 'keep' : 'delete',
      });
    }
  }

  return plan;
}

function computeRemovableFolderIds(
  rootFolderIds: number[],
  allFolders: Map<number, HeadlessFolder>,
  childrenMap: Map<number, number[]>,
  depths: Map<number, number>,
  toDeleteByFolder: Map<number, number>,
): number[] {
  const result: number[] = [];

  function isRemovable(folderId: number): boolean {
    const folder = allFolders.get(folderId);
    if (!folder) return false;

    const totalArticles = folder.numberOfStructuredContents;
    if (totalArticles === undefined) return false; // unknown total — be conservative

    const deletedCount = toDeleteByFolder.get(folderId) ?? 0;
    if (deletedCount !== totalArticles) return false; // not all articles deleted

    const children = childrenMap.get(folderId) ?? [];
    return children.every((childId) => isRemovable(childId));
  }

  function collect(folderId: number): void {
    if (isRemovable(folderId)) {
      result.push(folderId);
      for (const childId of childrenMap.get(folderId) ?? []) {
        collect(childId);
      }
    }
  }

  for (const rootId of rootFolderIds) {
    collect(rootId);
  }

  // Sort bottom-up (deepest first) for safe deletion order
  result.sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));

  return result;
}

async function authedDeleteResource(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  path: string,
): Promise<void> {
  const response = await apiClient.delete(config.liferay.url, path, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {Authorization: `Bearer ${accessToken}`},
  });

  if (!response.ok && response.status !== 404) {
    throw new CliError(`DELETE ${path} failed with status=${response.status}.`, {
      code: 'LIFERAY_CONTENT_PRUNE_ERROR',
    });
  }
}

async function tryDeleteFolder(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  folderId: number,
): Promise<boolean> {
  const response = await apiClient.delete(
    config.liferay.url,
    `/o/headless-delivery/v1.0/structured-content-folders/${folderId}`,
    {
      timeoutSeconds: config.liferay.timeoutSeconds,
      headers: {Authorization: `Bearer ${accessToken}`},
    },
  );

  return response.ok || response.status === 404;
}
