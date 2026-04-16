import type {LiferayGateway} from '../liferay-gateway.js';
import {LiferayErrors} from '../errors/index.js';
import {getGatewayStatus, isGatewayError, isGatewayStatus} from './liferay-content-prune-context.js';

export type HeadlessFolder = {
  id?: number;
  name?: string;
  siteId?: number;
  numberOfStructuredContents?: number;
};

export type FolderTree = {
  allFolders: Map<number, HeadlessFolder>;
  childrenMap: Map<number, number[]>;
  depths: Map<number, number>;
  missingRootFolders: number[];
};

export async function collectFolderTree(
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

export function countStructuredContents(allFolders: Map<number, HeadlessFolder>): number {
  let total = 0;

  for (const folder of allFolders.values()) {
    total += folder.numberOfStructuredContents ?? 0;
  }

  return total;
}

export function countStructuredContentsForRoots(
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

export function computeRemovableFolderIds(
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
