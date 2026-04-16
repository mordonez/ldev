import {runConcurrent} from '../../../core/concurrency.js';
import type {Printer} from '../../../core/output/printer.js';
import {runStep} from '../../../core/output/run-step.js';
import {LiferayErrors} from '../errors/index.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {getGatewayStatus, isGatewayError, isGatewayStatus} from './liferay-content-prune-context.js';
import type {PruneContext} from './liferay-content-prune-context.js';
import {
  computeRemovableFolderIds,
  countStructuredContents,
  countStructuredContentsForRoots,
  type FolderTree,
} from './liferay-content-prune-folders.js';
import type {ArticleWithFolder} from './liferay-content-prune-plan.js';
import type {ContentPruneOptions, ContentPruneResult, FailedArticle, FailedFolder} from './liferay-content-prune.js';

const ARTICLE_DELETE_CONCURRENCY = 2;

export type PruneExecutionResult = {
  removedFolders: number[];
  failedArticles: FailedArticle[];
  failedFolders: FailedFolder[];
};

export async function runWholeFolderDelete(
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

export async function executePrunePlan(
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
