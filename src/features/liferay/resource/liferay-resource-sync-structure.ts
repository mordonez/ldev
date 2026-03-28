import fs from 'fs-extra';

import {CliError} from '../../../cli/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpResponse, LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {fetchAccessToken, resolveSite} from '../inventory/liferay-inventory-shared.js';
import {resolveStructureFile} from './liferay-resource-paths.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

type MigrationRule = {
  source: string;
  target: string;
  cleanupSource: boolean;
};

type MigrationStats = {
  scanned: number;
  migrated: number;
  unchanged: number;
  failed: number;
  dryRun: boolean;
  articleKeys: string[];
};

export type LiferayResourceSyncStructureResult = {
  status: 'created' | 'updated' | 'checked' | 'checked_missing';
  id: string;
  key: string;
  siteId: number;
  siteFriendlyUrl: string;
  structureFile: string;
  removedFieldReferences: string[];
  migration?: MigrationStats;
};

export async function runLiferayResourceSyncStructure(
  config: AppConfig,
  options: {
    site?: string;
    key: string;
    file?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
    skipUpdate?: boolean;
    migrationPlan?: string;
    migrationPhase?: string;
    migrationDryRun?: boolean;
    cleanupMigration?: boolean;
    allowBreakingChange?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceSyncStructureResult> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const site = await resolveSite(config, options.site ?? '/global', dependencies);
  const structureFile = await resolveStructureFile(config, options.key, options.file);
  const payload = await fs.readJson(structureFile);
  const existing = await fetchStructureByKey(config, apiClient, accessToken, site.id, options.key);
  const removedFieldReferences = existing
    ? [...setDifference(collectFieldReferences(existing), collectFieldReferences(payload))]
    : [];

  if (removedFieldReferences.length > 0 && !options.migrationPlan && !options.allowBreakingChange) {
    throw new CliError(
      `Cambio bloqueado: la estructura elimina ${removedFieldReferences.length} campo(s) ${removedFieldReferences.join(', ')}. Define --migration-plan o usa --allow-breaking-change.`,
      {code: 'LIFERAY_RESOURCE_BREAKING_CHANGE'},
    );
  }

  const phase = normalizeMigrationPhase(options.migrationPhase);
  let migration: MigrationStats | undefined;

  if (!existing) {
    if (!options.createMissing) {
      throw new CliError(`Structure '${options.key}' no existe y create-missing no está activo.`, {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }

    if (options.checkOnly) {
      return {
        status: 'checked_missing',
        id: '',
        key: options.key,
        siteId: site.id,
        siteFriendlyUrl: site.friendlyUrlPath,
        structureFile,
        removedFieldReferences,
      };
    }

    if (options.migrationPlan && (phase === 'pre' || phase === 'both')) {
      migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, {
        apiClient,
        tokenClient: dependencies?.tokenClient,
        cleanupSource: Boolean(options.cleanupMigration),
        dryRun: Boolean(options.migrationDryRun),
      });
    }

    const createPayload = removeExternalReferenceCode(payload);
    const created = await expectJsonSuccess(
      await apiClient.postJson<Record<string, unknown>>(
        config.liferay.url,
        `/o/data-engine/v2.0/sites/${site.id}/data-definitions/by-content-type/journal`,
        createPayload,
        authOptions(config, accessToken),
      ),
      'structure-create',
    );

    const createdId = String(created.data?.id ?? '');
    if (options.migrationPlan && shouldRunPostMigration(phase)) {
      migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, {
        apiClient,
        tokenClient: dependencies?.tokenClient,
        cleanupSource: Boolean(options.cleanupMigration),
        dryRun: Boolean(options.migrationDryRun),
      });
    }

    return {
      status: 'created',
      id: createdId,
      key: options.key,
      siteId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
      structureFile,
      removedFieldReferences,
      ...(migration ? {migration} : {}),
    };
  }

  if (options.checkOnly || options.skipUpdate) {
    if (options.migrationPlan && shouldRunPostMigration(phase)) {
      migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, {
        apiClient,
        tokenClient: dependencies?.tokenClient,
        cleanupSource: Boolean(options.cleanupMigration),
        dryRun: true,
      });
    }

    return {
      status: 'checked',
      id: String(existing.id ?? ''),
      key: options.key,
      siteId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
      structureFile,
      removedFieldReferences,
      ...(migration ? {migration} : {}),
    };
  }

  if (options.migrationPlan && (phase === 'pre' || phase === 'both')) {
    migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, {
      apiClient,
      tokenClient: dependencies?.tokenClient,
      cleanupSource: Boolean(options.cleanupMigration),
      dryRun: Boolean(options.migrationDryRun),
    });
  }

  const runtimeId = String(existing.id ?? '');
  let updatePayload = payload;
  const autoTransition = options.migrationPlan && phase === 'post' && removedFieldReferences.length > 0;
  if (autoTransition) {
    const migrationPlanPath = options.migrationPlan;
    updatePayload = buildTransitionPayload(existing, payload);
    await expectJsonSuccess(
      await apiClient.putJson<Record<string, unknown>>(
        config.liferay.url,
        `/o/data-engine/v2.0/data-definitions/${runtimeId}`,
        updatePayload,
        authOptions(config, accessToken),
      ),
      'structure-update transition',
    );

    migration = await runStructureMigration(config, options.key, site.id, migrationPlanPath!, {
      apiClient,
      tokenClient: dependencies?.tokenClient,
      cleanupSource: Boolean(options.cleanupMigration),
      dryRun: Boolean(options.migrationDryRun),
    });
  }

  const updated = await expectJsonSuccess(
    await apiClient.putJson<Record<string, unknown>>(
      config.liferay.url,
      `/o/data-engine/v2.0/data-definitions/${runtimeId}`,
      payload,
      authOptions(config, accessToken),
    ),
    'structure-update',
  );

  if (options.migrationPlan && shouldRunPostMigration(phase) && !autoTransition) {
    migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, {
      apiClient,
      tokenClient: dependencies?.tokenClient,
      cleanupSource: Boolean(options.cleanupMigration),
      dryRun: Boolean(options.migrationDryRun),
    });
  }

  return {
    status: 'updated',
    id: String(updated.data?.id ?? runtimeId),
    key: options.key,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    structureFile,
    removedFieldReferences,
    ...(migration ? {migration} : {}),
  };
}

export function formatLiferayResourceSyncStructure(result: LiferayResourceSyncStructureResult): string {
  const lines = [
    `${result.status}\t${result.key}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.structureFile}`,
  ];
  if (result.removedFieldReferences.length > 0) {
    lines.push(`removedFieldReferences=${result.removedFieldReferences.join(',')}`);
  }
  if (result.migration) {
    lines.push(
      `migration scanned=${result.migration.scanned} migrated=${result.migration.migrated} unchanged=${result.migration.unchanged} failed=${result.migration.failed} dryRun=${result.migration.dryRun}`,
    );
  }
  return lines.join('\n');
}

async function fetchStructureByKey(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  key: string,
): Promise<Record<string, unknown> | null> {
  const response = await apiClient.get<Record<string, unknown>>(
    config.liferay.url,
    `/o/data-engine/v2.0/sites/${siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(key)}`,
    authOptions(config, accessToken),
  );
  if (response.status === 404) {
    return null;
  }
  const success = await expectJsonSuccess(response, 'resource structure-sync get');
  return success.data;
}

async function runStructureMigration(
  config: AppConfig,
  structureKey: string,
  siteId: number,
  migrationPlanPath: string,
  options: {
    apiClient: LiferayApiClient;
    tokenClient?: OAuthTokenClient;
    dryRun: boolean;
    cleanupSource: boolean;
  },
): Promise<MigrationStats> {
  const accessToken = await fetchAccessToken(config, {apiClient: options.apiClient, tokenClient: options.tokenClient});
  const planRoot = await fs.readJson(migrationPlanPath);
  const plan =
    typeof planRoot === 'object' && planRoot && 'plan' in planRoot
      ? (planRoot.plan as Record<string, unknown>)
      : planRoot;
  const rules = parseMappings(plan?.mappings);
  if (rules.length === 0) {
    throw new CliError('Migration plan inválido: falta mappings[]', {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  const structure = await fetchStructureByKey(config, options.apiClient, accessToken, siteId, structureKey);
  if (!structure?.id) {
    throw new CliError(`No se pudo resolver estructura ${structureKey}`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  const scopedRootFolderIds = parseNumberList(plan?.rootFolderIds);
  const scopedFolderIds = new Set<number>([
    ...parseNumberList(plan?.folderIds),
    ...(scopedRootFolderIds.length > 0
      ? await expandRootFolderScope(config, options.apiClient, accessToken, siteId, scopedRootFolderIds)
      : []),
  ]);
  const articleIds = new Set(parseStringList(plan?.articleIds));
  const contents =
    scopedFolderIds.size > 0
      ? await listStructureContentsByFolders(
          config,
          options.apiClient,
          accessToken,
          [...scopedFolderIds],
          String(structure.id),
        )
      : await listStructureContents(config, options.apiClient, accessToken, String(structure.id));

  const selected = contents.filter((item) => {
    const folderId = Number(item.structuredContentFolderId ?? Number.MIN_SAFE_INTEGER);
    const articleId = String(item.key ?? '');
    const folderOk = scopedFolderIds.size === 0 || scopedFolderIds.has(folderId);
    const articleOk = articleIds.size === 0 || articleIds.has(articleId);
    return folderOk && articleOk;
  });

  const migratedArticleKeys = new Set<string>();
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
      const after = structuredClone(before);
      const changed = applyMappings(after, rules, options.cleanupSource);
      if (!changed || contentFieldsEqual(before, after)) {
        stats.unchanged += 1;
        continue;
      }

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
            authOptions(config, accessToken),
          ),
          'structure-migrate update',
        );
      }

      stats.migrated += 1;
      if (articleKey !== '') {
        migratedArticleKeys.add(articleKey);
      }
    } catch {
      stats.failed += 1;
    }
  }

  stats.articleKeys = [...migratedArticleKeys].sort();

  return stats;
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
): Promise<Record<string, unknown>> {
  const fields = encodeURIComponent(
    'id,key,contentStructureId,structuredContentFolderId,friendlyUrlPath,title,contentFields',
  );
  const response = await expectJsonSuccess(
    await apiClient.get<Record<string, unknown>>(
      config.liferay.url,
      `/o/headless-delivery/v1.0/structured-contents/${encodeURIComponent(contentId)}?fields=${fields}`,
      authOptions(config, accessToken),
    ),
    'structure-migrate get',
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

function applyMappings(item: Record<string, unknown>, mappings: MigrationRule[], cleanupSource: boolean): boolean {
  let changed = false;
  for (const mapping of mappings) {
    const value = firstSourceValue(item.contentFields, mapping.source);
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

function collectFieldReferences(definition: Record<string, unknown>): Set<string> {
  const refs = new Set<string>();
  collectFieldReferencesRecursive(definition.dataDefinitionFields, refs);
  return refs;
}

function collectFieldReferencesRecursive(fields: unknown, refs: Set<string>): void {
  if (!Array.isArray(fields)) {
    return;
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = field as Record<string, unknown>;
    const name = String(record.name ?? '').trim();
    if (name) {
      refs.add(name);
    }
    const customProperties = (record.customProperties ?? {}) as Record<string, unknown>;
    const fieldReference = String(customProperties.fieldReference ?? '').trim();
    if (fieldReference) {
      refs.add(fieldReference);
    }
    collectFieldReferencesRecursive(record.nestedDataDefinitionFields, refs);
  }
}

function buildTransitionPayload(
  runtimeDefinition: Record<string, unknown>,
  finalPayload: Record<string, unknown>,
): Record<string, unknown> {
  const transition = structuredClone(finalPayload);
  const runtimeFields = Array.isArray(runtimeDefinition.dataDefinitionFields)
    ? (structuredClone(runtimeDefinition.dataDefinitionFields) as Array<Record<string, unknown>>)
    : [];
  const finalFields = Array.isArray(transition.dataDefinitionFields)
    ? (transition.dataDefinitionFields as Array<Record<string, unknown>>)
    : [];
  const runtimeIds = new Set(runtimeFields.map(fieldIdentity));
  for (const field of finalFields) {
    const identity = fieldIdentity(field);
    if (!runtimeIds.has(identity)) {
      runtimeFields.push(structuredClone(field));
      runtimeIds.add(identity);
    }
  }
  transition.dataDefinitionFields = runtimeFields;
  return transition;
}

function fieldIdentity(field: Record<string, unknown>): string {
  const customProperties = (field.customProperties ?? {}) as Record<string, unknown>;
  const fieldReference = String(customProperties.fieldReference ?? '').trim();
  if (fieldReference) {
    return fieldReference;
  }
  return String(field.name ?? '').trim();
}

function removeExternalReferenceCode(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(payload);
  delete copy.externalReferenceCode;
  return copy;
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

async function expectJsonSuccess<T>(response: HttpResponse<T>, label: string): Promise<HttpResponse<T>> {
  if (response.ok) {
    return response;
  }
  throw new CliError(`${label} failed with status=${response.status}.`, {code: 'LIFERAY_RESOURCE_ERROR'});
}

function normalizeMigrationPhase(phase?: string): '' | 'pre' | 'post' | 'both' {
  const normalized = (phase ?? '').trim().toLowerCase();
  if (normalized === 'pre' || normalized === 'post' || normalized === 'both') {
    return normalized;
  }
  return '';
}

function shouldRunPostMigration(phase: '' | 'pre' | 'post' | 'both'): boolean {
  return phase === '' || phase === 'post' || phase === 'both';
}

function authOptions(
  config: AppConfig,
  accessToken: string,
): {headers: Record<string, string>; timeoutSeconds: number} {
  return {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

function setDifference<T>(left: Set<T>, right: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of left) {
    if (!right.has(item)) {
      result.add(item);
    }
  }
  return result;
}
