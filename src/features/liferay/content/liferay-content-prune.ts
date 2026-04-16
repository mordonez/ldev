import type {AppConfig} from '../../../core/config/load-config.js';
import {runStep} from '../../../core/output/run-step.js';
import {LiferayErrors} from '../errors/index.js';
import {
  hydrateMissingJournalStructureDefinitions,
  resolveJournalStructureDefinitions,
} from './liferay-content-journal-shared.js';
import {
  assertValidContentPruneOptions,
  createPruneContext,
  isPresentNumber,
  type PruneContext,
  type PruneDependencies,
} from './liferay-content-prune-context.js';
import {executePrunePlan, runWholeFolderDelete, type PruneExecutionResult} from './liferay-content-prune-execute.js';
import {collectFolderTree, type FolderTree} from './liferay-content-prune-folders.js';
import {
  buildPrunePlanSummary,
  collectPruneArticles,
  type PrunePlanSummary,
  type SampleArticle,
  type StructurePruneSummary,
} from './liferay-content-prune-plan.js';

// === Public types ===

export type {SampleArticle, StructurePruneSummary} from './liferay-content-prune-plan.js';

export type ContentPruneOptions = {
  site?: string;
  groupId?: number;
  rootFolders: number[];
  structures?: string[];
  keep?: number;
  keepScope?: 'folder' | 'structure';
  dryRun?: boolean;
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

type StructureResolution = {
  structureMap: Map<number, string>;
  structureNameMap: Map<string, string>;
};

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
    options.structures,
    options.keep,
    options.keepScope,
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

// === Private orchestration helpers ===

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
