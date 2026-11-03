import {isRecord, type JsonRecord} from '../../../../core/utils/json.js';
import {LiferayErrors} from '../../errors/index.js';
import type {LiferayGateway} from '../../liferay-gateway.js';
import {contentFieldsEqual, type DataDefinitionField, type StructuredContentRow} from './structure-content-fields.js';
import type {MigrationPlanData} from './structure-content-plan.js';

type StructuredContentsPage = {
  items?: StructuredContentRow[];
  lastPage?: number;
};

export type StructureLookup = {
  id?: string | number;
  dataDefinitionKey?: string;
};

export async function selectStructureContents(
  gateway: LiferayGateway,
  siteId: number,
  structureId: string,
  planData: MigrationPlanData,
): Promise<StructuredContentRow[]> {
  const scopedFolderIds = new Set<number>([
    ...planData.scopedFolderIds,
    ...(planData.scopedRootFolderIds.length > 0
      ? await expandRootFolderScope(gateway, siteId, planData.scopedRootFolderIds)
      : []),
  ]);
  const articleIds = new Set(planData.articleIds);

  if (articleIds.size > 0) {
    const selected = await listStructureContentsByArticleIds(gateway, siteId, planData.articleIds);

    return selected.filter((item) => {
      const folderId = Number(item.structuredContentFolderId ?? Number.MIN_SAFE_INTEGER);
      const articleId = String(item.key ?? '');
      const folderOk = scopedFolderIds.size === 0 || scopedFolderIds.has(folderId);
      const articleOk = articleIds.has(articleId);
      const structureOk = String(item.contentStructureId ?? '') === structureId;
      return folderOk && articleOk && structureOk;
    });
  }

  const contents =
    scopedFolderIds.size > 0
      ? await listStructureContentsByFolders(gateway, [...scopedFolderIds], structureId)
      : await listStructureContents(gateway, structureId);

  return contents.filter((item) => {
    const folderId = Number(item.structuredContentFolderId ?? Number.MIN_SAFE_INTEGER);
    const articleId = String(item.key ?? '');
    const folderOk = scopedFolderIds.size === 0 || scopedFolderIds.has(folderId);
    const articleOk = articleIds.size === 0 || articleIds.has(articleId);
    return folderOk && articleOk;
  });
}

async function listStructureContentsByArticleIds(
  gateway: LiferayGateway,
  siteId: number,
  articleIds: string[],
): Promise<StructuredContentRow[]> {
  const deduped = new Map<string, StructuredContentRow>();

  for (const articleId of articleIds) {
    const article = await fetchLatestJournalArticle(gateway, siteId, articleId);
    const structuredContentId = Number(article?.resourcePrimKey ?? article?.id ?? -1);

    if (!Number.isFinite(structuredContentId) || structuredContentId <= 0) {
      continue;
    }

    const content = await fetchStructuredContentForMigration(gateway, String(structuredContentId));
    const contentId = String(content.id ?? '').trim();

    if (contentId !== '' && !deduped.has(contentId)) {
      deduped.set(contentId, content);
    }
  }

  return [...deduped.values()];
}

async function fetchPagedStructuredContents(
  gateway: LiferayGateway,
  baseUrl: string,
  label: string,
): Promise<StructuredContentRow[]> {
  const fields = encodeURIComponent('id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title');
  const rows: StructuredContentRow[] = [];
  let page = 1;
  let lastPage: number;
  do {
    const response = await gateway.getJson<StructuredContentsPage>(
      `${baseUrl}?page=${page}&pageSize=200&fields=${fields}`,
      label,
    );
    rows.push(...((response as StructuredContentsPage | null)?.items ?? []));
    lastPage = (response as StructuredContentsPage | null)?.lastPage ?? 1;
    page += 1;
  } while (page <= lastPage);
  return rows;
}

async function listStructureContents(gateway: LiferayGateway, structureId: string): Promise<StructuredContentRow[]> {
  return fetchPagedStructuredContents(
    gateway,
    `/o/headless-delivery/v1.0/content-structures/${structureId}/structured-contents`,
    'structure-migrate list',
  );
}

async function listStructureContentsByFolders(
  gateway: LiferayGateway,
  folderIds: number[],
  structureId: string,
): Promise<StructuredContentRow[]> {
  const deduped = new Map<number, StructuredContentRow>();

  for (const folderId of folderIds.sort((left, right) => left - right)) {
    const items = await fetchPagedStructuredContents(
      gateway,
      `/o/headless-delivery/v1.0/structured-content-folders/${folderId}/structured-contents`,
      'structure-migrate list-by-folder',
    );
    for (const item of items) {
      if (String(item.contentStructureId ?? '') !== structureId) {
        continue;
      }
      const id = Number(item.id ?? -1);
      if (id > 0 && !deduped.has(id)) {
        deduped.set(id, item);
      }
    }
  }

  return [...deduped.values()];
}

export async function fetchStructuredContentForMigration(
  gateway: LiferayGateway,
  contentId: string,
  acceptLanguage = '',
): Promise<StructuredContentRow> {
  const fields = encodeURIComponent(
    'id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title,availableLanguages,contentFields',
  );
  const content = await gateway.getJson<unknown>(
    `/o/headless-delivery/v1.0/structured-contents/${encodeURIComponent(contentId)}?fields=${fields}`,
    'structure-migrate get',
    acceptLanguage !== '' ? {headers: {'Accept-Language': acceptLanguage}} : undefined,
  );

  if (!isRecord(content)) {
    throw LiferayErrors.resourceError(
      `structure-migrate get returned an empty or invalid response for contentId=${contentId}`,
    );
  }

  return content;
}

async function fetchLatestJournalArticle(
  gateway: LiferayGateway,
  siteId: number,
  articleId: string,
): Promise<JsonRecord | null> {
  const response = await gateway.getRaw<JsonRecord>(
    `/api/jsonws/journal.journalarticle/get-latest-article?groupId=${siteId}&articleId=${encodeURIComponent(articleId)}&status=0`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw LiferayErrors.resourceError(
      `structure-migrate get-latest-article failed with status=${response.status} for articleId=${articleId}`,
    );
  }

  return response.data ?? null;
}

export async function fetchStructureDefinitionFields(
  gateway: LiferayGateway,
  structureId: string,
): Promise<DataDefinitionField[]> {
  const definition = await gateway.getJson<JsonRecord>(
    `/o/data-engine/v2.0/data-definitions/${encodeURIComponent(structureId)}`,
    'structure-migrate definition',
  );

  return Array.isArray(definition.dataDefinitionFields)
    ? (definition.dataDefinitionFields as DataDefinitionField[])
    : [];
}

async function expandRootFolderScope(
  gateway: LiferayGateway,
  siteId: number,
  rootFolderIds: number[],
): Promise<number[]> {
  const queue = [...rootFolderIds];
  const scoped = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (scoped.has(current)) {
      continue;
    }
    scoped.add(current);
    const response = await gateway.getJson<Array<{folderId?: number}>>(
      `/api/jsonws/journal.journalfolder/get-folders?groupId=${siteId}&parentFolderId=${current}`,
      'journal-folder-get-folders',
    );
    for (const row of (response as Array<{folderId?: number}> | null) ?? []) {
      const childId = Number(row.folderId ?? -1);
      if (childId > 0 && !scoped.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return [...scoped];
}

export async function verifyStructuredContentPersistence(
  gateway: LiferayGateway,
  contentId: string,
  expected: StructuredContentRow,
  runtimeDefinitionFields: DataDefinitionField[],
  acceptLanguage = '',
): Promise<void> {
  const maxAttempts = 8;
  const baseRetryDelayMs = 500;
  let lastPersisted: StructuredContentRow | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const persisted = await fetchStructuredContentForMigration(gateway, contentId, acceptLanguage);
    lastPersisted = persisted;
    if (contentFieldsEqual(expected, persisted, runtimeDefinitionFields)) {
      return;
    }

    if (attempt < maxAttempts) {
      // Liferay may persist structured content asynchronously; use bounded backoff.
      const delayMs = baseRetryDelayMs * attempt;
      await sleep(delayMs);
    }
  }

  const expectedKey = String(expected.key ?? '').trim();
  const persistedId = String(lastPersisted?.id ?? '').trim();

  throw LiferayErrors.resourceError(
    `structure-migrate update was accepted but contentFields were not persisted after ${maxAttempts} verification attempts for contentId=${contentId}${
      expectedKey !== '' ? ` (articleKey=${expectedKey})` : ''
    }${persistedId !== '' ? `; latest fetched contentId=${persistedId}` : ''}.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
