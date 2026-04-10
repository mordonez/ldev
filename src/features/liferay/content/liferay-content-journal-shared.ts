import type {AppConfig} from '../../../core/config/load-config.js';
import {CliError} from '../../../core/errors.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {
  authedGet,
  fetchAccessToken,
  fetchPagedItems,
  normalizeLocalizedName,
} from '../inventory/liferay-inventory-shared.js';

export type JournalAuthState = {
  accessToken: string;
  tokenClient: OAuthTokenClient;
};

export async function authedGetWithRefresh<T>(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: JournalAuthState,
  path: string,
) {
  const response = await authedGet<T>(config, apiClient, authState.accessToken, path);

  if (response.status !== 401) {
    return response;
  }

  authState.accessToken = await fetchAccessToken(config, {
    apiClient,
    tokenClient: authState.tokenClient,
    forceRefresh: true,
  });

  return authedGet<T>(config, apiClient, authState.accessToken, path);
}

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
  apiClient: LiferayApiClient,
  authState: JournalAuthState,
  groupId: number,
  structureMap: Map<number, string>,
  structureNameMap: Map<string, string>,
): Promise<void> {
  const definitions = await fetchPagedItems<JournalStructureDefinition>(
    config,
    `/o/data-engine/v2.0/sites/${groupId}/data-definitions/by-content-type/journal`,
    200,
    {apiClient, tokenClient: authState.tokenClient, accessToken: authState.accessToken},
  );

  for (const definition of definitions) {
    if (definition.id && definition.dataDefinitionKey) {
      structureMap.set(definition.id, definition.dataDefinitionKey);
      structureNameMap.set(definition.dataDefinitionKey, normalizeLocalizedName(definition.name));
    }
  }
}

export async function hydrateMissingJournalStructureDefinitions(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: JournalAuthState,
  structureIds: number[],
  structureMap: Map<number, string>,
  structureNameMap: Map<string, string>,
): Promise<void> {
  const missingIds = [...new Set(structureIds.filter((id) => Number.isFinite(id)))].filter(
    (id) => !structureMap.has(id),
  );

  for (const structureId of missingIds) {
    const response = await authedGetWithRefresh<JournalStructureDefinition>(
      config,
      apiClient,
      authState,
      `/o/data-engine/v2.0/data-definitions/${structureId}`,
    );

    if (!response.ok) {
      continue;
    }

    const definition = response.data;
    if (!definition?.id || !definition.dataDefinitionKey) {
      continue;
    }

    structureMap.set(definition.id, definition.dataDefinitionKey);
    structureNameMap.set(definition.dataDefinitionKey, normalizeLocalizedName(definition.name));
  }
}

export async function fetchJournalArticleRowsInFolder(
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: JournalAuthState,
  groupId: number,
  folderId: number,
  errorCode: string,
): Promise<JsonwsJournalArticleRow[]> {
  const pageSize = 200;
  const timeoutSeconds = Math.max(config.liferay.timeoutSeconds, 600);
  const rows: JsonwsJournalArticleRow[] = [];
  let start = 0;

  while (true) {
    const end = start + pageSize;
    const response = await authedGetWithRefresh<JsonwsJournalArticleRow[]>(
      {
        ...config,
        liferay: {
          ...config.liferay,
          timeoutSeconds,
        },
      },
      apiClient,
      authState,
      `/api/jsonws/journal.journalfolder/get-folders-and-articles?groupId=${groupId}&folderId=${folderId}&start=${start}&end=${end}&-orderByComparator=`,
    );

    if (response.status === 403) {
      throw new CliError(`403 Forbidden on journal.journalfolder/get-folders-and-articles for folder ${folderId}.`, {
        code: errorCode,
      });
    }

    if (!response.ok || !Array.isArray(response.data)) {
      throw new CliError(`journal folder articles for folder ${folderId} failed with status=${response.status}.`, {
        code: errorCode,
      });
    }

    const rawPage = response.data ?? [];
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
  config: AppConfig,
  apiClient: LiferayApiClient,
  authState: JournalAuthState,
  groupId: number,
  parentFolderId: number,
  errorCode: string,
): Promise<Array<{folderId: number; name: string}>> {
  const response = await authedGetWithRefresh<JsonwsJournalFolder[]>(
    config,
    apiClient,
    authState,
    `/api/jsonws/journal.journalfolder/get-folders?groupId=${groupId}&parentFolderId=${parentFolderId}`,
  );

  if (!response.ok || !Array.isArray(response.data)) {
    throw new CliError(`journal folders for parent ${parentFolderId} failed with status=${response.status}.`, {
      code: errorCode,
    });
  }

  return (response.data ?? [])
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
