import fs from 'fs-extra';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {fetchAccessToken} from '../inventory/liferay-inventory-shared.js';
import {authOptions, expectJsonSuccess} from './liferay-resource-sync-structure-utils.js';

export type MigrationRule = {
  source: string;
  target: string;
  cleanupSource: boolean;
};

export type MigrationStats = {
  scanned: number;
  migrated: number;
  unchanged: number;
  failed: number;
  dryRun: boolean;
  articleKeys: string[];
};

type MigrationFailure = {
  contentId: string;
  articleKey: string;
  message: string;
};

export type MigrationPlanData = {
  rules: MigrationRule[];
  scopedRootFolderIds: number[];
  scopedFolderIds: number[];
  articleIds: string[];
};

type LocalizedContentSnapshots = Map<string, Record<string, unknown>>;

export async function runStructureMigration(
  config: AppConfig,
  structureKey: string,
  siteId: number,
  migrationPlanPath: string,
  options: {
    apiClient: LiferayApiClient;
    tokenClient?: OAuthTokenClient;
    dryRun: boolean;
    cleanupSource: boolean;
    sourceSnapshots?: Map<string, LocalizedContentSnapshots>;
    fetchStructureByKeyFn: (
      config: AppConfig,
      apiClient: LiferayApiClient,
      accessToken: string,
      siteId: number,
      key: string,
    ) => Promise<Record<string, unknown> | null>;
  },
): Promise<MigrationStats> {
  const accessToken = await fetchAccessToken(config, {apiClient: options.apiClient, tokenClient: options.tokenClient});
  const planRoot = await fs.readJson(migrationPlanPath);
  const plan =
    typeof planRoot === 'object' && planRoot && 'plan' in planRoot
      ? (planRoot.plan as Record<string, unknown>)
      : planRoot;
  const planData = parseMigrationPlan(plan);
  if (planData.rules.length === 0) {
    throw new CliError('Invalid migration plan: missing mappings[]', {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  const structure = await options.fetchStructureByKeyFn(config, options.apiClient, accessToken, siteId, structureKey);
  if (!structure?.id) {
    throw new CliError(`Could not resolve structure ${structureKey}`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  const selected = await selectStructureContents(
    config,
    options.apiClient,
    accessToken,
    siteId,
    String(structure.id),
    planData,
  );

  const migratedArticleKeys = new Set<string>();
  const failures: MigrationFailure[] = [];
  const stats: MigrationStats = {
    scanned: 0,
    migrated: 0,
    unchanged: 0,
    failed: 0,
    dryRun: options.dryRun,
    articleKeys: [],
  };

  for (const item of selected) {
    stats.scanned += 1;
    try {
      const contentId = String(item.id ?? '');
      const articleKey = String(item.key ?? '').trim();
      const before = await fetchStructuredContentForMigration(config, options.apiClient, accessToken, contentId);
      const sourceSnapshots = options.sourceSnapshots?.get(contentId);
      const locales = resolveMigrationLocales(before, sourceSnapshots);
      let changedAcrossLocales = false;

      for (const locale of locales) {
        const beforeLocalized =
          locale === ''
            ? before
            : await fetchStructuredContentForMigration(config, options.apiClient, accessToken, contentId, locale);
        const source = sourceSnapshots?.get(locale) ?? beforeLocalized;
        const after = structuredClone(beforeLocalized);
        const changed = applyMappings(after, source, planData.rules, options.cleanupSource);
        if (!changed || contentFieldsEqual(beforeLocalized, after)) {
          continue;
        }
        changedAcrossLocales = true;

        if (!options.dryRun) {
          const payload = copyIfPresent(after, [
            'contentStructureId',
            'structuredContentFolderId',
            'friendlyUrlPath',
            'title',
            'contentFields',
          ]);
          await expectJsonSuccess(
            await options.apiClient.putJson(
              config.liferay.url,
              `/o/headless-delivery/v1.0/structured-contents/${encodeURIComponent(contentId)}`,
              payload,
              authOptions(config, accessToken, locale),
            ),
            'structure-migrate update',
            'LIFERAY_RESOURCE_ERROR',
          );
          await verifyStructuredContentPersistence(config, options.apiClient, accessToken, contentId, after, locale);
        }
      }

      if (!changedAcrossLocales) {
        stats.unchanged += 1;
        continue;
      }

      stats.migrated += 1;
      if (articleKey !== '') {
        migratedArticleKeys.add(articleKey);
      }
    } catch (error) {
      stats.failed += 1;
      failures.push({
        contentId: String(item.id ?? ''),
        articleKey: String(item.key ?? '').trim(),
        message: error instanceof Error ? error.message : 'Unknown content migration error',
      });
    }
  }

  stats.articleKeys = [...migratedArticleKeys].sort();

  if (failures.length > 0) {
    const summary = failures
      .map(({contentId, articleKey, message}) => `${articleKey || contentId}: ${message}`)
      .join('; ');
    throw new CliError(`Structure migration failed for ${failures.length} content item(s): ${summary}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
      details: {stats, failures},
    });
  }

  return stats;
}

export async function captureMigrationSourceSnapshots(
  config: AppConfig,
  structureId: string,
  siteId: number,
  migrationPlanPath: string,
  options: {
    apiClient: LiferayApiClient;
    tokenClient?: OAuthTokenClient;
  },
): Promise<Map<string, LocalizedContentSnapshots>> {
  const accessToken = await fetchAccessToken(config, {apiClient: options.apiClient, tokenClient: options.tokenClient});
  const planRoot = await fs.readJson(migrationPlanPath);
  const plan =
    typeof planRoot === 'object' && planRoot && 'plan' in planRoot
      ? (planRoot.plan as Record<string, unknown>)
      : planRoot;
  const planData = parseMigrationPlan(plan);
  const selected = await selectStructureContents(config, options.apiClient, accessToken, siteId, structureId, planData);
  const snapshots = new Map<string, LocalizedContentSnapshots>();
  for (const item of selected) {
    const contentId = String(item.id ?? '').trim();
    if (contentId === '') {
      continue;
    }
    const baseSnapshot = await fetchStructuredContentForMigration(config, options.apiClient, accessToken, contentId);
    const localizedSnapshots: LocalizedContentSnapshots = new Map();
    for (const locale of resolveMigrationLocales(baseSnapshot)) {
      localizedSnapshots.set(
        locale,
        locale === ''
          ? baseSnapshot
          : await fetchStructuredContentForMigration(config, options.apiClient, accessToken, contentId, locale),
      );
    }
    snapshots.set(contentId, localizedSnapshots);
  }
  return snapshots;
}

async function selectStructureContents(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  structureId: string,
  planData: MigrationPlanData,
): Promise<Array<Record<string, unknown>>> {
  const scopedFolderIds = new Set<number>([
    ...planData.scopedFolderIds,
    ...(planData.scopedRootFolderIds.length > 0
      ? await expandRootFolderScope(config, apiClient, accessToken, siteId, planData.scopedRootFolderIds)
      : []),
  ]);
  const articleIds = new Set(planData.articleIds);
  const contents =
    scopedFolderIds.size > 0
      ? await listStructureContentsByFolders(config, apiClient, accessToken, [...scopedFolderIds], structureId)
      : await listStructureContents(config, apiClient, accessToken, structureId);

  return contents.filter((item) => {
    const folderId = Number(item.structuredContentFolderId ?? Number.MIN_SAFE_INTEGER);
    const articleId = String(item.key ?? '');
    const folderOk = scopedFolderIds.size === 0 || scopedFolderIds.has(folderId);
    const articleOk = articleIds.size === 0 || articleIds.has(articleId);
    return folderOk && articleOk;
  });
}

async function listStructureContents(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  structureId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let page = 1;
  let lastPage = 1;
  const fields = encodeURIComponent('id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title');

  do {
    const response = await expectJsonSuccess(
      await apiClient.get<{items?: Array<Record<string, unknown>>; lastPage?: number}>(
        config.liferay.url,
        `/o/headless-delivery/v1.0/content-structures/${structureId}/structured-contents?page=${page}&pageSize=200&fields=${fields}`,
        authOptions(config, accessToken),
      ),
      'structure-migrate list',
      'LIFERAY_RESOURCE_ERROR',
    );
    rows.push(...(response.data?.items ?? []));
    lastPage = response.data?.lastPage ?? 1;
    page += 1;
  } while (page <= lastPage);

  return rows;
}

async function listStructureContentsByFolders(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  folderIds: number[],
  structureId: string,
): Promise<Array<Record<string, unknown>>> {
  const deduped = new Map<number, Record<string, unknown>>();
  const fields = encodeURIComponent('id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title');

  for (const folderId of folderIds.sort((left, right) => left - right)) {
    let page = 1;
    let lastPage = 1;
    do {
      const response = await expectJsonSuccess(
        await apiClient.get<{items?: Array<Record<string, unknown>>; lastPage?: number}>(
          config.liferay.url,
          `/o/headless-delivery/v1.0/structured-content-folders/${folderId}/structured-contents?page=${page}&pageSize=200&fields=${fields}`,
          authOptions(config, accessToken),
        ),
        'structure-migrate list-by-folder',
        'LIFERAY_RESOURCE_ERROR',
      );
      for (const item of response.data?.items ?? []) {
        if (String(item.contentStructureId ?? '') !== structureId) {
          continue;
        }
        const id = Number(item.id ?? -1);
        if (id > 0 && !deduped.has(id)) {
          deduped.set(id, item);
        }
      }
      lastPage = response.data?.lastPage ?? 1;
      page += 1;
    } while (page <= lastPage);
  }

  return [...deduped.values()];
}

async function fetchStructuredContentForMigration(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  contentId: string,
  acceptLanguage = '',
): Promise<Record<string, unknown>> {
  const fields = encodeURIComponent(
    'id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title,availableLanguages,contentFields',
  );
  const response = await expectJsonSuccess(
    await apiClient.get<Record<string, unknown>>(
      config.liferay.url,
      `/o/headless-delivery/v1.0/structured-contents/${encodeURIComponent(contentId)}?fields=${fields}`,
      authOptions(config, accessToken, acceptLanguage),
    ),
    'structure-migrate get',
    'LIFERAY_RESOURCE_ERROR',
  );
  return response.data ?? {};
}

async function expandRootFolderScope(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
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
    const response = await expectJsonSuccess(
      await apiClient.get<Array<{folderId?: number}>>(
        config.liferay.url,
        `/api/jsonws/journal.journalfolder/get-folders?groupId=${siteId}&parentFolderId=${current}`,
        authOptions(config, accessToken),
      ),
      'journal-folder-get-folders',
      'LIFERAY_RESOURCE_ERROR',
    );
    for (const row of response.data ?? []) {
      const childId = Number(row.folderId ?? -1);
      if (childId > 0 && !scoped.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return [...scoped];
}

async function verifyStructuredContentPersistence(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  contentId: string,
  expected: Record<string, unknown>,
  acceptLanguage = '',
): Promise<void> {
  const maxAttempts = 4;
  const retryDelayMs = 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const persisted = await fetchStructuredContentForMigration(
      config,
      apiClient,
      accessToken,
      contentId,
      acceptLanguage,
    );
    if (contentFieldsEqual(expected, persisted)) {
      return;
    }
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  throw new CliError(
    `structure-migrate update was accepted but contentFields were not persisted for content ${contentId}.`,
    {code: 'LIFERAY_RESOURCE_ERROR'},
  );
}

function resolveMigrationLocales(content: Record<string, unknown>, snapshots?: LocalizedContentSnapshots): string[] {
  const fromSnapshots = snapshots ? [...snapshots.keys()].filter(Boolean) : [];
  if (fromSnapshots.length > 0) {
    return fromSnapshots.sort();
  }

  const availableLanguages = parseStringList(content.availableLanguages);
  if (availableLanguages.length > 0) {
    return availableLanguages.sort();
  }

  return [''];
}

export function parseMigrationPlan(plan: Record<string, unknown>): MigrationPlanData {
  const rules = parseMappings(plan?.mappings);
  return {
    rules,
    scopedRootFolderIds: parseNumberList(plan?.rootFolderIds),
    scopedFolderIds: parseNumberList(plan?.folderIds),
    articleIds: parseStringList(plan?.articleIds),
  };
}

function parseMappings(rawMappings: unknown): MigrationRule[] {
  if (!Array.isArray(rawMappings)) {
    return [];
  }

  return rawMappings.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return [];
    }
    const source = String(
      (row as Record<string, unknown>).source ?? (row as Record<string, unknown>).from ?? '',
    ).trim();
    const target = String((row as Record<string, unknown>).target ?? (row as Record<string, unknown>).to ?? '').trim();
    if (!source || !target) {
      return [];
    }
    return [
      {
        source,
        target,
        cleanupSource: Boolean((row as Record<string, unknown>).cleanupSource),
      },
    ];
  });
}

function parseNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function applyMappings(
  item: Record<string, unknown>,
  sourceItem: Record<string, unknown>,
  mappings: MigrationRule[],
  cleanupSource: boolean,
): boolean {
  let changed = false;
  for (const mapping of mappings) {
    const value = firstSourceValue(sourceItem.contentFields, mapping.source);
    if (!value || isEmptyValue(value)) {
      continue;
    }
    if (setTargetValue(item, mapping.target, structuredClone(value))) {
      changed = true;
    }
    if (cleanupSource) {
      if (cleanupSourceField(item, mapping.source)) {
        changed = true;
      }
    }
  }
  return changed;
}

function firstSourceValue(contentFields: unknown, source: string): unknown | null {
  if (!Array.isArray(contentFields)) {
    return null;
  }
  for (const field of contentFields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = field as Record<string, unknown>;
    if (String(record.name ?? '') === source) {
      const value = record.contentFieldValue;
      if (!isEmptyValue(value)) {
        return value;
      }
    }
    const nested = firstSourceValue(record.nestedContentFields, source);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

function setTargetValue(item: Record<string, unknown>, target: string, value: unknown): boolean {
  if (target.includes('[].')) {
    const [base, child] = target.split('[].', 2);
    return setFieldsetTarget(item, base!, child!, value);
  }
  return setSimpleTarget(item, target, value);
}

function setSimpleTarget(item: Record<string, unknown>, target: string, value: unknown): boolean {
  const fields = ensureContentFields(item);
  for (const field of fields) {
    if (String(field.name ?? '') === target) {
      if (isEmptyValue(field.contentFieldValue)) {
        field.contentFieldValue = value;
        return true;
      }
      return false;
    }
  }
  fields.push({name: target, contentFieldValue: value});
  return true;
}

function setFieldsetTarget(item: Record<string, unknown>, base: string, child: string, value: unknown): boolean {
  const fields = ensureContentFields(item);
  for (const field of fields) {
    if (String(field.name ?? '') !== base) {
      continue;
    }
    const nested = ensureNestedContentFields(field);
    for (const nestedField of nested) {
      if (String(nestedField.name ?? '') === child) {
        if (isEmptyValue(nestedField.contentFieldValue)) {
          nestedField.contentFieldValue = value;
          return true;
        }
        return false;
      }
    }
    nested.push({name: child, contentFieldValue: value});
    return true;
  }

  const fieldset = {name: base, contentFieldValue: {}, nestedContentFields: [{name: child, contentFieldValue: value}]};
  fields.push(fieldset);
  return true;
}

function cleanupSourceField(item: Record<string, unknown>, source: string): boolean {
  return cleanupSourceInFields(ensureContentFields(item), source);
}

function cleanupSourceInFields(fields: Array<Record<string, unknown>>, source: string): boolean {
  let changed = false;
  for (const field of fields) {
    if (String(field.name ?? '') === source) {
      field.contentFieldValue = {data: ''};
      changed = true;
    }
    if (cleanupSourceInFields(getNestedContentFields(field), source)) {
      changed = true;
    }
  }
  return changed;
}

function contentFieldsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left.contentFields ?? []) === JSON.stringify(right.contentFields ?? []);
}

function ensureContentFields(item: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(item.contentFields)) {
    item.contentFields = [];
  }
  return item.contentFields as Array<Record<string, unknown>>;
}

function ensureNestedContentFields(field: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(field.nestedContentFields)) {
    field.nestedContentFields = [];
  }
  return field.nestedContentFields as Array<Record<string, unknown>>;
}

function getNestedContentFields(field: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(field.nestedContentFields) ? (field.nestedContentFields as Array<Record<string, unknown>>) : [];
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0) {
      return true;
    }
    if (keys.length === 1 && keys[0] === 'data') {
      return String(record.data ?? '').trim() === '';
    }
  }
  return false;
}

function copyIfPresent(source: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) {
      target[field] = structuredClone(source[field]);
    }
  }
  return target;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
