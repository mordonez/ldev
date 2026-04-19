import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {Printer} from '../../../core/output/printer.js';
import {toBooleanOrFalse} from '../../../core/utils/coerce.js';
import {LiferayErrors} from '../errors/index.js';
import type {LiferayGateway} from '../liferay-gateway.js';

export type MigrationRule = {
  source: string;
  target: string;
  cleanupSource: boolean;
};

export type MigrationReasonBreakdown = {
  copiedToNewField: number;
  alreadyHadTargetValue: number;
  sourceEmpty: number;
  noEffectiveChange: number;
  sourceCleaned: number;
};

export type MigrationStats = {
  scanned: number;
  migrated: number;
  unchanged: number;
  failed: number;
  dryRun: boolean;
  articleKeys: string[];
  reasonBreakdown: MigrationReasonBreakdown;
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

type JsonMap = Record<string, unknown>;

type StructuredContentRow = JsonMap & {
  id?: string | number;
  key?: string;
  contentStructureId?: string | number;
  structuredContentFolderId?: number | string;
  contentFields?: unknown;
  availableLanguages?: string[];
};

type StructuredContentsPage = {
  items?: StructuredContentRow[];
  lastPage?: number;
};

type StructureLookup = {
  id?: string | number;
  dataDefinitionKey?: string;
};

type MigrationPlanShape = {
  mappings?: unknown;
  rootFolderIds?: unknown;
  folderIds?: unknown;
  articleIds?: unknown;
};

type LocalizedContentSnapshots = Map<string, StructuredContentRow>;

type DataDefinitionField = JsonMap & {
  name?: string;
  customProperties?: JsonMap;
  nestedDataDefinitionFields?: unknown;
};

export async function runStructureMigration(
  config: AppConfig,
  structureKey: string,
  siteId: number,
  migrationPlanPath: string,
  options: {
    gateway: LiferayGateway;
    dryRun: boolean;
    cleanupSource: boolean;
    sourceSnapshots?: Map<string, LocalizedContentSnapshots>;
    printer?: Printer;
    fetchStructureByKeyFn: (
      config: AppConfig,
      gateway: LiferayGateway,
      siteId: number,
      key: string,
    ) => Promise<StructureLookup | null>;
  },
): Promise<MigrationStats> {
  const planRoot = await fs.readJson(migrationPlanPath);
  const plan =
    typeof planRoot === 'object' && planRoot && 'plan' in planRoot
      ? (planRoot.plan as MigrationPlanShape)
      : (planRoot as MigrationPlanShape);
  const planData = parseMigrationPlan(plan);
  if (planData.rules.length === 0) {
    throw LiferayErrors.resourceError('Invalid migration plan: missing mappings[]');
  }

  options.printer?.info(
    `Migrating structure content: resolving structure definition and selecting targeted content...`,
  );
  const structure = await options.fetchStructureByKeyFn(config, options.gateway, siteId, structureKey);
  if (!structure?.id) {
    throw LiferayErrors.resourceError(`Could not resolve structure ${structureKey}`);
  }

  const runtimeDefinitionFields = await fetchStructureDefinitionFields(options.gateway, String(structure.id));

  const selected = await selectStructureContents(options.gateway, siteId, String(structure.id), planData);
  options.printer?.info(
    `Found ${selected.length} content item(s) matching migration criteria; processing migrations...`,
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
    reasonBreakdown: {
      copiedToNewField: 0,
      alreadyHadTargetValue: 0,
      sourceEmpty: 0,
      noEffectiveChange: 0,
      sourceCleaned: 0,
    },
  };

  const progressInterval = 10; // Print progress every 10 items

  for (const item of selected) {
    stats.scanned += 1;
    if (options.printer && selected.length > progressInterval && (stats.scanned - 1) % progressInterval === 0) {
      options.printer.info(
        `Migrating content: ${stats.scanned}/${selected.length} scanned (${stats.migrated} migrated, ${stats.unchanged} unchanged, ${stats.failed} failed)`,
      );
    }
    try {
      const contentId = String(item.id ?? '');
      const articleKey = String(item.key ?? '').trim();
      const before = await fetchStructuredContentForMigration(options.gateway, contentId);
      const sourceSnapshots = options.sourceSnapshots?.get(contentId);
      const locales = resolveMigrationLocales(before, sourceSnapshots);
      const localizedSnapshots = new Map<string, StructuredContentRow>();
      for (const locale of locales) {
        localizedSnapshots.set(
          locale,
          locale === '' ? before : await fetchStructuredContentForMigration(options.gateway, contentId, locale),
        );
      }
      const titleI18n = buildTitleI18n(localizedSnapshots);
      let changedAcrossLocales = false;
      let sourceValueFound = false;
      let sourceValueMissing = false;
      let targetValueAlreadyPresent = false;
      let copiedToTarget = false;
      let sourceCleaned = false;
      let noEffectiveChange = false;

      for (const locale of locales) {
        const beforeLocalized = localizedSnapshots.get(locale) ?? before;
        const source = sourceSnapshots?.get(locale) ?? beforeLocalized;
        const after = structuredClone(beforeLocalized);
        const diagnostics = applyMappings(after, source, planData.rules, options.cleanupSource);
        sourceValueFound = sourceValueFound || diagnostics.sourceWithValue > 0;
        sourceValueMissing = sourceValueMissing || diagnostics.sourceEmpty > 0;
        targetValueAlreadyPresent = targetValueAlreadyPresent || diagnostics.targetAlreadySet > 0;
        copiedToTarget = copiedToTarget || diagnostics.targetWritten > 0;
        sourceCleaned = sourceCleaned || diagnostics.sourceCleaned > 0;

        if (!diagnostics.changed) {
          continue;
        }

        if (contentFieldsEqual(beforeLocalized, after)) {
          noEffectiveChange = true;
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
          if (payload.contentFields !== undefined) {
            payload.contentFields = toApiContentFields(payload.contentFields, runtimeDefinitionFields);
          }
          if (Object.keys(titleI18n).length > 0) {
            payload.title_i18n = titleI18n;
          }
          await options.gateway.putJson(
            `/o/headless-delivery/v1.0/structured-contents/${encodeURIComponent(contentId)}`,
            payload,
            'structure-migrate update',
            locale !== '' ? {headers: {'Accept-Language': locale}} : undefined,
          );
          await verifyStructuredContentPersistence(options.gateway, contentId, after, locale);
        }
      }

      if (!changedAcrossLocales) {
        stats.unchanged += 1;

        if (targetValueAlreadyPresent && !copiedToTarget) {
          stats.reasonBreakdown.alreadyHadTargetValue += 1;
        } else if (!sourceValueFound && sourceValueMissing) {
          stats.reasonBreakdown.sourceEmpty += 1;
        } else if (noEffectiveChange) {
          stats.reasonBreakdown.noEffectiveChange += 1;
        } else if (sourceValueMissing) {
          stats.reasonBreakdown.sourceEmpty += 1;
        } else {
          stats.reasonBreakdown.noEffectiveChange += 1;
        }
        continue;
      }

      stats.migrated += 1;
      if (copiedToTarget) {
        stats.reasonBreakdown.copiedToNewField += 1;
      }
      if (sourceCleaned) {
        stats.reasonBreakdown.sourceCleaned += 1;
      }
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

  options.printer?.info(
    `Migration phase complete: ${stats.migrated} updated, ${stats.unchanged} unchanged, ${stats.failed} failed out of ${stats.scanned} total (${options.dryRun ? 'dry-run' : 'persisted'})`,
  );

  if (failures.length > 0) {
    const summary = failures
      .map(({contentId, articleKey, message}) => `${articleKey || contentId}: ${message}`)
      .join('; ');
    throw LiferayErrors.resourceError(`Structure migration failed for ${failures.length} content item(s): ${summary}`, {
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
    gateway: LiferayGateway;
  },
): Promise<Map<string, LocalizedContentSnapshots>> {
  const planRoot = await fs.readJson(migrationPlanPath);
  const plan =
    typeof planRoot === 'object' && planRoot && 'plan' in planRoot
      ? (planRoot.plan as MigrationPlanShape)
      : (planRoot as MigrationPlanShape);
  const planData = parseMigrationPlan(plan);
  const selected = await selectStructureContents(options.gateway, siteId, structureId, planData);
  const snapshots = new Map<string, LocalizedContentSnapshots>();
  for (const item of selected) {
    const contentId = String(item.id ?? '').trim();
    if (contentId === '') {
      continue;
    }
    const baseSnapshot = await fetchStructuredContentForMigration(options.gateway, contentId);
    const localizedSnapshots: LocalizedContentSnapshots = new Map();
    for (const locale of resolveMigrationLocales(baseSnapshot)) {
      localizedSnapshots.set(
        locale,
        locale === '' ? baseSnapshot : await fetchStructuredContentForMigration(options.gateway, contentId, locale),
      );
    }
    snapshots.set(contentId, localizedSnapshots);
  }
  return snapshots;
}

async function selectStructureContents(
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

async function listStructureContents(gateway: LiferayGateway, structureId: string): Promise<StructuredContentRow[]> {
  const rows: StructuredContentRow[] = [];
  let page = 1;
  let lastPage = 1;
  const fields = encodeURIComponent('id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title');

  do {
    const response = await gateway.getJson<StructuredContentsPage>(
      `/o/headless-delivery/v1.0/content-structures/${structureId}/structured-contents?page=${page}&pageSize=200&fields=${fields}`,
      'structure-migrate list',
    );
    rows.push(...((response as StructuredContentsPage | null)?.items ?? []));
    lastPage = (response as StructuredContentsPage | null)?.lastPage ?? 1;
    page += 1;
  } while (page <= lastPage);

  return rows;
}

async function listStructureContentsByFolders(
  gateway: LiferayGateway,
  folderIds: number[],
  structureId: string,
): Promise<StructuredContentRow[]> {
  const deduped = new Map<number, StructuredContentRow>();
  const fields = encodeURIComponent('id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title');

  for (const folderId of folderIds.sort((left, right) => left - right)) {
    let page = 1;
    let lastPage = 1;
    do {
      const response = await gateway.getJson<StructuredContentsPage>(
        `/o/headless-delivery/v1.0/structured-content-folders/${folderId}/structured-contents?page=${page}&pageSize=200&fields=${fields}`,
        'structure-migrate list-by-folder',
      );
      for (const item of (response as StructuredContentsPage | null)?.items ?? []) {
        if (String(item.contentStructureId ?? '') !== structureId) {
          continue;
        }
        const id = Number(item.id ?? -1);
        if (id > 0 && !deduped.has(id)) {
          deduped.set(id, item);
        }
      }
      lastPage = (response as {lastPage?: number} | null)?.lastPage ?? 1;
      page += 1;
    } while (page <= lastPage);
  }

  return [...deduped.values()];
}

async function fetchStructuredContentForMigration(
  gateway: LiferayGateway,
  contentId: string,
  acceptLanguage = '',
): Promise<StructuredContentRow> {
  const fields = encodeURIComponent(
    'id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title,availableLanguages,contentFields',
  );
  return (
    (await gateway.getJson<StructuredContentRow>(
      `/o/headless-delivery/v1.0/structured-contents/${encodeURIComponent(contentId)}?fields=${fields}`,
      'structure-migrate get',
      acceptLanguage !== '' ? {headers: {'Accept-Language': acceptLanguage}} : undefined,
    )) ?? {}
  );
}

async function fetchLatestJournalArticle(
  gateway: LiferayGateway,
  siteId: number,
  articleId: string,
): Promise<JsonMap | null> {
  const response = await gateway.getRaw<JsonMap>(
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

  return (response.data as JsonMap | null) ?? null;
}

async function fetchStructureDefinitionFields(
  gateway: LiferayGateway,
  structureId: string,
): Promise<DataDefinitionField[]> {
  const definition = await gateway.getJson<JsonMap>(
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

async function verifyStructuredContentPersistence(
  gateway: LiferayGateway,
  contentId: string,
  expected: StructuredContentRow,
  acceptLanguage = '',
): Promise<void> {
  const maxAttempts = 8;
  const baseRetryDelayMs = 500;
  let lastPersisted: StructuredContentRow | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const persisted = await fetchStructuredContentForMigration(gateway, contentId, acceptLanguage);
    lastPersisted = persisted;
    if (contentFieldsEqual(expected, persisted)) {
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

function resolveMigrationLocales(content: StructuredContentRow, snapshots?: LocalizedContentSnapshots): string[] {
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

function buildTitleI18n(localizedSnapshots: Map<string, StructuredContentRow>): Record<string, string> {
  const titles: Record<string, string> = {};

  for (const [locale, snapshot] of localizedSnapshots) {
    const normalizedLocale = locale.trim();
    if (normalizedLocale === '') {
      continue;
    }

    const title = String(snapshot.title ?? '').trim();
    if (title === '') {
      continue;
    }

    titles[normalizedLocale] = title;
  }

  return titles;
}

export function parseMigrationPlan(plan: MigrationPlanShape): MigrationPlanData {
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
    const mapping = row as JsonMap;
    const source = String(mapping.source ?? mapping.from ?? '').trim();
    const target = String(mapping.target ?? mapping.to ?? '').trim();
    if (!source || !target) {
      return [];
    }
    return [
      {
        source,
        target,
        cleanupSource: toBooleanOrFalse(mapping.cleanupSource),
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
  item: StructuredContentRow,
  sourceItem: StructuredContentRow,
  mappings: MigrationRule[],
  cleanupSource: boolean,
): {
  changed: boolean;
  sourceEmpty: number;
  sourceWithValue: number;
  targetWritten: number;
  targetAlreadySet: number;
  sourceCleaned: number;
} {
  let changed = false;
  let sourceEmpty = 0;
  let sourceWithValue = 0;
  let targetWritten = 0;
  let targetAlreadySet = 0;
  let sourceCleaned = 0;

  for (const mapping of mappings) {
    const value = firstSourceValue(sourceItem.contentFields, mapping.source);
    if (!value || isEmptyValue(value)) {
      sourceEmpty += 1;
      continue;
    }

    sourceWithValue += 1;
    if (setTargetValue(item, mapping.target, structuredClone(value))) {
      changed = true;
      targetWritten += 1;
    } else {
      targetAlreadySet += 1;
    }

    if (cleanupSource) {
      if (cleanupSourceField(item, mapping.source)) {
        changed = true;
        sourceCleaned += 1;
      }
    }
  }

  return {
    changed,
    sourceEmpty,
    sourceWithValue,
    targetWritten,
    targetAlreadySet,
    sourceCleaned,
  };
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
  return (
    JSON.stringify(normalizeComparableValue(left.contentFields ?? [])) ===
    JSON.stringify(normalizeComparableValue(right.contentFields ?? []))
  );
}

function toApiContentFields(contentFields: unknown, definitionFields: unknown): unknown {
  if (!Array.isArray(contentFields)) {
    return contentFields;
  }

  const scope = Array.isArray(definitionFields) ? (definitionFields as DataDefinitionField[]) : [];

  return contentFields.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }

    const field = structuredClone(entry) as Record<string, unknown>;
    const definition = findDefinitionField(scope, String(field.name ?? '').trim());

    if (definition?.name) {
      field.name = definition.name;
    }

    if (Array.isArray(field.nestedContentFields)) {
      field.nestedContentFields = toApiContentFields(field.nestedContentFields, definition?.nestedDataDefinitionFields);
    }

    return field;
  });
}

function findDefinitionField(scope: DataDefinitionField[], fieldName: string): DataDefinitionField | null {
  if (fieldName === '') {
    return null;
  }

  for (const definition of scope) {
    const internalName = String(definition.name ?? '').trim();
    const fieldReference = String((definition.customProperties?.fieldReference as string | undefined) ?? '').trim();

    if (fieldName === internalName || fieldName === fieldReference) {
      return definition;
    }
  }

  return null;
}

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparableValue(entry));
  }

  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = normalizeComparableValue((value as Record<string, unknown>)[key]);
    }
    return normalized;
  }

  return value;
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
