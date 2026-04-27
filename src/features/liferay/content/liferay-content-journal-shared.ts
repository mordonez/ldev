import type {AppConfig} from '../../../core/config/load-config.js';
import {CliError} from '../../../core/errors.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {LiferayErrors} from '../errors/index.js';
import {fetchPagedItems} from '../inventory/liferay-inventory-shared.js';
import {normalizeLocalizedName} from '../portal/site-resolution.js';

export type JsonwsJournalArticleRow = {
  resourcePrimKey?: string;
  articleId?: string;
  folderId?: string;
  groupId?: string;
  DDMStructureId?: string;
  modifiedDate?: number;
  titleCurrentValue?: string;
  status?: number;
};

export type JournalStructureDefinition = {
  id?: number;
  dataDefinitionKey?: string;
  name?: string | Record<string, string>;
};

export type JsonwsJournalFolder = {
  folderId?: string | number;
  id?: string | number;
  name?: string;
};

export async function resolveJournalStructureDefinitions(
  config: AppConfig,
  apiClient: HttpApiClient,
  tokenClient: OAuthTokenClient,
  groupId: number,
  structureMap: Map<number, string>,
  structureNameMap: Map<string, string>,
): Promise<void> {
  const definitions = await fetchPagedItems<JournalStructureDefinition>(
    config,
    `/o/data-engine/v2.0/sites/${groupId}/data-definitions/by-content-type/journal`,
    200,
    {apiClient, tokenClient},
  );

  for (const definition of definitions) {
    if (definition.id && definition.dataDefinitionKey) {
      structureMap.set(definition.id, definition.dataDefinitionKey);
      structureNameMap.set(definition.dataDefinitionKey, normalizeLocalizedName(definition.name));
    }
  }
}

export async function hydrateMissingJournalStructureDefinitions(
  gateway: LiferayGateway,
  structureIds: number[],
  structureMap: Map<number, string>,
  structureNameMap: Map<string, string>,
): Promise<void> {
  const missingIds = [...new Set(structureIds.filter((id) => Number.isFinite(id)))].filter(
    (id) => !structureMap.has(id),
  );

  for (const structureId of missingIds) {
    let definition: JournalStructureDefinition;

    try {
      definition = await gateway.getJson<JournalStructureDefinition>(
        `/o/data-engine/v2.0/data-definitions/${structureId}`,
        `journal structure ${structureId}`,
      );
    } catch (error) {
      if (isGatewayError(error)) {
        continue;
      }

      throw error;
    }

    if (!definition.id || !definition.dataDefinitionKey) {
      continue;
    }

    structureMap.set(definition.id, definition.dataDefinitionKey);
    structureNameMap.set(definition.dataDefinitionKey, normalizeLocalizedName(definition.name));
  }
}

export async function fetchJournalArticleRowsInFolder(
  gateway: LiferayGateway,
  groupId: number,
  folderId: number,
): Promise<JsonwsJournalArticleRow[]> {
  const pageSize = 200;
  const rows: JsonwsJournalArticleRow[] = [];
  let start = 0;

  for (;;) {
    const end = start + pageSize;
    let rawPage: JsonwsJournalArticleRow[];

    try {
      rawPage = await gateway.getJson<JsonwsJournalArticleRow[]>(
        `/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=${groupId}&folderId=${folderId}&start=${start}&end=${end}&-orderByComparator=`,
        `journal folder articles ${folderId}`,
      );
    } catch (error) {
      if (isGatewayStatus(error, 403)) {
        throw LiferayErrors.contentJournalError(
          `403 Forbidden on journal.journalfolder/get-folders-and-articles for folder ${folderId}.`,
        );
      }

      if (isGatewayError(error)) {
        throw LiferayErrors.contentJournalError(
          `journal folder articles for folder ${folderId} failed with status=${getGatewayStatus(error) ?? 'unknown'}.`,
        );
      }

      throw error;
    }

    if (!Array.isArray(rawPage)) {
      throw LiferayErrors.contentJournalError(
        `journal folder articles for folder ${folderId} failed with status=unknown.`,
      );
    }

    const page = dedupeJournalRows(rawPage.filter(isJournalArticleRow));
    rows.push(...page);

    if (rawPage.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return rows;
}

export async function fetchJournalFoldersByParent(
  gateway: LiferayGateway,
  groupId: number,
  parentFolderId: number,
): Promise<Array<{folderId: number; name: string}>> {
  let folders: JsonwsJournalFolder[];

  try {
    folders = await gateway.getJson<JsonwsJournalFolder[]>(
      `/api/jsonws/journal.journalfolder/get-folders?groupId=${groupId}&parentFolderId=${parentFolderId}`,
      `journal folders ${parentFolderId}`,
    );
  } catch (error) {
    if (isGatewayError(error)) {
      throw LiferayErrors.contentJournalError(
        `journal folders for parent ${parentFolderId} failed with status=${getGatewayStatus(error) ?? 'unknown'}.`,
      );
    }

    throw error;
  }

  if (!Array.isArray(folders)) {
    throw LiferayErrors.contentJournalError(`journal folders for parent ${parentFolderId} failed with status=unknown.`);
  }

  return folders
    .map((folder) => ({
      folderId: Number(folder.folderId ?? folder.id ?? 0),
      name: folder.name ?? '',
    }))
    .filter((folder) => Number.isInteger(folder.folderId) && folder.folderId > 0);
}

function isJournalArticleRow(
  row: JsonwsJournalArticleRow,
): row is JsonwsJournalArticleRow & Required<Pick<JsonwsJournalArticleRow, 'articleId' | 'resourcePrimKey'>> {
  return Boolean(row.articleId && row.resourcePrimKey);
}

function dedupeJournalRows(rows: JsonwsJournalArticleRow[]): JsonwsJournalArticleRow[] {
  const unique = new Map<string, JsonwsJournalArticleRow>();

  for (const row of rows) {
    const key = `${row.resourcePrimKey ?? ''}:${row.articleId ?? ''}`;
    if (!unique.has(key)) {
      unique.set(key, row);
    }
  }

  return [...unique.values()];
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
