import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {LiferayGateway} from '../liferay-gateway.js';

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

  const structure = await options.fetchStructureByKeyFn(config, options.gateway, siteId, structureKey);
  if (!structure?.id) {
    throw LiferayErrors.resourceError(`Could not resolve structure ${structureKey}`);
  }

  const selected = await selectStructureContents(options.gateway, siteId, String(structure.id), planData);

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
      const before = await fetchStructuredContentForMigration(options.gateway, contentId);
      const sourceSnapshots = options.sourceSnapshots?.get(contentId);
      const locales = resolveMigrationLocales(before, sourceSnapshots);
      let changedAcrossLocales = false;

      for (const locale of locales) {
        const beforeLocalized =
          locale === '' ? before : await fetchStructuredContentForMigration(options.gateway, contentId, locale);
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
  const maxAttempts = 4;
  const retryDelayMs = 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const persisted = await fetchStructuredContentForMigration(gateway, contentId, acceptLanguage);
    if (contentFieldsEqual(expected, persisted)) {
      return;
    }
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  throw LiferayErrors.resourceError(
    `structure-migrate update was accepted but contentFields were not persisted for content ${contentId}.`,
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
        cleanupSource: Boolean(mapping.cleanupSource),
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
