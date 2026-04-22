import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {withProgress, type Printer} from '../../../core/output/printer.js';
import {toBooleanOrFalse} from '../../../core/utils/coerce.js';
import {isRecord, type JsonRecord} from '../../../core/utils/json.js';
import {normalizeScalarString} from '../../../core/utils/text.js';
import {LiferayErrors} from '../errors/index.js';
import {runLiferayInventoryTemplates} from '../inventory/liferay-inventory-templates.js';
import {runLiferayResourceGetStructure} from './liferay-resource-get-structure.js';
import {resolveStructureFile} from './liferay-resource-paths.js';
import {runLiferayResourceSyncStructure} from './liferay-resource-sync-structure.js';
import {runLiferayResourceSyncTemplate} from './liferay-resource-sync-template.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';

type MigrationStage = 'introduce' | 'cleanup';

type MigrationStageDescriptor = {
  structureFile?: string;
  planNode: MigrationPlanNode;
  cleanupMigration: boolean;
};

type MigrationPlanMapping = JsonRecord & {
  source: string;
  target: string;
  cleanupSource: boolean;
};

type MigrationPlanNode = JsonRecord & {
  mappings?: MigrationPlanMapping[];
  articleIds?: unknown;
  folderIds?: unknown;
  rootFolderIds?: unknown;
};

type LayoutNode = JsonRecord;

type MigrationDescriptor = {
  site: string;
  structureKey: string;
  dependentStructures: string[];
  templates: boolean;
  introduce: MigrationStageDescriptor;
};

export type LiferayResourceMigrationRunResult = {
  site: string;
  structureKey: string;
  stage: MigrationStage;
  status: string;
  id: string;
  migrationApplied: boolean;
  migratedArticleKeys: string[];
};

export type LiferayResourceMigrationPipelineResult = {
  site: string;
  structureKey: string;
  dependentStructureResults: Array<{key: string; status: string; id: string}>;
  structureStatus: string;
  templateResults: Array<{name: string; status: string; id: string}>;
  validationRun: boolean;
  cleanupRun: boolean;
};

export async function runLiferayResourceMigrationRun(
  config: AppConfig,
  options: {
    migrationFile: string;
    stage?: MigrationStage;
    checkOnly?: boolean;
    migrationDryRun?: boolean;
    skipUpdate?: boolean;
    printer?: Printer;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceMigrationRunResult> {
  const descriptor = await readMigrationDescriptor(config, options.migrationFile);
  const stage = options.stage ?? 'introduce';
  const stageDescriptor = descriptor.introduce;
  const structureFile = await resolveMigrationStructureFile(config, descriptor, stageDescriptor);

  const planFile = await writeTempPlanFile(stageDescriptor.planNode);

  try {
    const syncTask = async () =>
      runLiferayResourceSyncStructure(
        config,
        {
          site: descriptor.site,
          key: descriptor.structureKey,
          file: structureFile,
          checkOnly: Boolean(options.checkOnly),
          skipUpdate: Boolean(options.skipUpdate),
          migrationPlan: planFile,
          migrationPhase: stage === 'cleanup' ? 'pre' : 'post',
          migrationDryRun: Boolean(options.checkOnly) || Boolean(options.migrationDryRun),
          cleanupMigration: stageDescriptor.cleanupMigration,
          printer: options.printer,
        },
        dependencies,
      );

    const progressMessage = `Running ${stage} migration for structure: ${descriptor.structureKey} (site: ${descriptor.site})`;
    const result = options.printer ? await withProgress(options.printer, progressMessage, syncTask) : await syncTask();

    if (result.migration) {
      options.printer?.info(
        `Migration complete: ${result.migration.migrated} updated, ${result.migration.unchanged} unchanged, ${result.migration.failed} failed out of ${result.migration.scanned} scanned`,
      );
      options.printer?.info(
        `Migration reasons: copied=${result.migration.reasonBreakdown.copiedToNewField}, already-target=${result.migration.reasonBreakdown.alreadyHadTargetValue}, source-empty=${result.migration.reasonBreakdown.sourceEmpty}, no-delta=${result.migration.reasonBreakdown.noEffectiveChange}, source-cleaned=${result.migration.reasonBreakdown.sourceCleaned}`,
      );
    } else {
      options.printer?.info(`Migration phase completed: ${result.status}`);
    }
    return {
      site: descriptor.site,
      structureKey: descriptor.structureKey,
      stage,
      status: result.status,
      id: result.id,
      migrationApplied: Boolean(result.migration) && !result.migration?.dryRun,
      migratedArticleKeys: result.migration?.articleKeys ?? [],
    };
  } finally {
    await fs.remove(planFile);
  }
}

export async function runLiferayResourceMigrationPipeline(
  config: AppConfig,
  options: {
    migrationFile: string;
    checkOnly?: boolean;
    migrationDryRun?: boolean;
    runCleanup?: boolean;
    skipValidation?: boolean;
    createMissingTemplates?: boolean;
    printer?: Printer;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceMigrationPipelineResult> {
  const descriptor = await readMigrationDescriptor(config, options.migrationFile);
  options.printer?.info(
    `Starting migration pipeline for structure: ${descriptor.structureKey} (site: ${descriptor.site})`,
  );
  const dependentStructureResults: Array<{key: string; status: string; id: string}> = [];

  if (descriptor.dependentStructures.length > 0) {
    options.printer?.info(`Processing ${descriptor.dependentStructures.length} dependent structure(s)...`);
  }

  for (const dependentKey of descriptor.dependentStructures) {
    const checked = await runLiferayResourceSyncStructure(
      config,
      {
        site: '/global',
        key: dependentKey,
        checkOnly: true,
        createMissing: true,
      },
      dependencies,
    );
    if (checked.status === 'checked_missing' && !options.checkOnly) {
      const created = await runLiferayResourceSyncStructure(
        config,
        {
          site: '/global',
          key: dependentKey,
          createMissing: true,
        },
        dependencies,
      );
      dependentStructureResults.push({key: dependentKey, status: created.status, id: created.id});
      continue;
    }
    dependentStructureResults.push({key: dependentKey, status: checked.status, id: checked.id});
  }

  options.printer?.info(`Running introduce phase of structure migration...`);
  const structure = await runLiferayResourceMigrationRun(
    config,
    {
      migrationFile: options.migrationFile,
      stage: 'introduce',
      checkOnly: options.checkOnly,
      migrationDryRun: options.migrationDryRun,
      printer: options.printer,
    },
    dependencies,
  );

  const pipelineTemplates = await resolvePipelineTemplates(config, descriptor, dependencies);
  const templateResults: Array<{name: string; status: string; id: string}> = [];
  for (const templateName of pipelineTemplates) {
    const templateTask = async () =>
      runLiferayResourceSyncTemplate(
        config,
        {
          site: descriptor.site,
          key: templateName,
          checkOnly: Boolean(options.checkOnly),
          createMissing: Boolean(options.createMissingTemplates),
        },
        dependencies,
      );
    const result = options.printer
      ? await withProgress(
          options.printer,
          `Syncing template: ${templateName} (site: ${descriptor.site})`,
          templateTask,
        )
      : await templateTask();
    templateResults.push({name: templateName, status: result.status, id: result.id});
  }

  if (options.runCleanup) {
    const cleanupTask = async () =>
      runCleanupStage(
        config,
        descriptor,
        structure.migratedArticleKeys,
        {
          checkOnly: options.checkOnly,
          migrationDryRun: options.migrationDryRun,
        },
        dependencies,
      );
    const cleanupMessage = `Running cleanup phase of structure migration: ${descriptor.structureKey} (site: ${descriptor.site})`;
    if (options.printer) {
      await withProgress(options.printer, cleanupMessage, cleanupTask);
    } else {
      await cleanupTask();
    }
  }

  if (!options.skipValidation) {
    if (options.runCleanup) {
      const validationCleanupTask = async () =>
        runCleanupStage(
          config,
          descriptor,
          structure.migratedArticleKeys,
          {
            checkOnly: true,
            migrationDryRun: true,
          },
          dependencies,
        );
      const validationCleanupMessage = `Validating cleanup phase of structure migration: ${descriptor.structureKey} (site: ${descriptor.site})`;
      if (options.printer) {
        await withProgress(options.printer, validationCleanupMessage, validationCleanupTask);
      } else {
        await validationCleanupTask();
      }
    } else {
      const validationMessage = `Validating structure migration: ${descriptor.structureKey} (site: ${descriptor.site})`;
      const validationTask = async () => {
        const validationPlanFile = await writeTempPlanFile(descriptor.introduce.planNode);
        try {
          await runLiferayResourceSyncStructure(
            config,
            {
              site: descriptor.site,
              key: descriptor.structureKey,
              file: await resolveMigrationStructureFile(config, descriptor, descriptor.introduce),
              checkOnly: true,
              migrationPlan: validationPlanFile,
              migrationPhase: 'post',
              cleanupMigration: false,
            },
            dependencies,
          );
        } finally {
          await fs.remove(validationPlanFile);
        }
      };
      if (options.printer) {
        await withProgress(options.printer, validationMessage, validationTask);
      } else {
        await validationTask();
      }
    }

    for (const templateName of pipelineTemplates) {
      const validateTemplateTask = async () =>
        runLiferayResourceSyncTemplate(
          config,
          {
            site: descriptor.site,
            key: templateName,
            checkOnly: true,
          },
          dependencies,
        );
      if (options.printer) {
        await withProgress(
          options.printer,
          `Validating template: ${templateName} (site: ${descriptor.site})`,
          validateTemplateTask,
        );
      } else {
        await validateTemplateTask();
      }
    }
  }

  return {
    site: descriptor.site,
    structureKey: descriptor.structureKey,
    dependentStructureResults,
    structureStatus: structure.status,
    templateResults,
    validationRun: !options.skipValidation,
    cleanupRun: Boolean(options.runCleanup),
  };
}

export function formatLiferayResourceMigrationRun(result: LiferayResourceMigrationRunResult): string {
  return `${result.status}\t${result.structureKey}\t${result.id}\nsite=${result.site}\nstage=${result.stage}\nmigrationApplied=${result.migrationApplied}`;
}

export function formatLiferayResourceMigrationPipeline(result: LiferayResourceMigrationPipelineResult): string {
  const lines = [
    `${result.structureStatus}\t${result.structureKey}`,
    `site=${result.site}`,
    `dependentStructures=${result.dependentStructureResults.length}`,
    `templates=${result.templateResults.length}`,
    `validationRun=${result.validationRun}`,
    `cleanupRun=${result.cleanupRun}`,
  ];
  for (const dependentStructure of result.dependentStructureResults) {
    lines.push(`dependency ${dependentStructure.status}\t${dependentStructure.key}\t${dependentStructure.id}`);
  }
  for (const template of result.templateResults) {
    lines.push(`template ${template.status}\t${template.name}\t${template.id}`);
  }
  return lines.join('\n');
}

async function readMigrationDescriptor(config: AppConfig, migrationFile: string): Promise<MigrationDescriptor> {
  return parseMigrationDescriptor(await readDescriptorNode(config, migrationFile));
}

async function readDescriptorNode(config: AppConfig, migrationFile: string): Promise<JsonRecord> {
  const candidate = path.isAbsolute(migrationFile)
    ? migrationFile
    : path.resolve(config.repoRoot ?? config.cwd, migrationFile);
  if (!(await fs.pathExists(candidate))) {
    throw LiferayErrors.resourceError(`Migration descriptor not found: ${migrationFile}`);
  }
  const descriptor: unknown = await fs.readJson(candidate);
  if (!isRecord(descriptor)) {
    throw LiferayErrors.resourceError(`Migration descriptor must be a JSON object: ${migrationFile}`);
  }
  return descriptor;
}

function parseMigrationDescriptor(descriptorNode: JsonRecord): MigrationDescriptor {
  const site = normalizeScalarString(descriptorNode.site) ?? '/global';
  const structureKey = normalizeScalarString(descriptorNode.structureKey) ?? '';
  if (structureKey === '') {
    throw LiferayErrors.resourceError('Invalid descriptor: missing structureKey');
  }

  const introduceNode = asRecord(descriptorNode.introduce);
  if (Object.keys(introduceNode).length === 0) {
    throw LiferayErrors.resourceError('Invalid descriptor: missing introduce.');
  }

  const introduce = parseStageDescriptor(introduceNode, 'introduce');

  return {
    site,
    structureKey,
    dependentStructures: parseStringArray(descriptorNode.dependentStructures),
    templates: Boolean(descriptorNode.templates),
    introduce,
  };
}

function parseStageDescriptor(node: JsonRecord, stageName: MigrationStage): MigrationStageDescriptor {
  const structureFile = normalizeScalarString(node.structureFile) ?? '';
  const rawPlanNode = Array.isArray(node.mappings) ? node : asRecord(node.plan);
  const planNode = {
    ...rawPlanNode,
    mappings: normalizeMappingsArray(rawPlanNode.mappings),
  };
  if (!Array.isArray(planNode.mappings) || planNode.mappings.length === 0) {
    throw LiferayErrors.resourceError(`Invalid descriptor: ${stageName}.mappings[] is empty.`);
  }
  return {
    structureFile,
    planNode,
    cleanupMigration: false,
  };
}

function normalizeMappingsArray(value: unknown): MigrationPlanMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((row) => {
    if (!isRecord(row)) {
      return [];
    }
    const source = normalizeScalarString(row.source) ?? '';
    const target = normalizeScalarString(row.target) ?? '';
    if (source === '' || target === '') {
      return [];
    }
    return [
      {
        source,
        target,
        cleanupSource: toBooleanOrFalse(row.cleanupSource),
      },
    ];
  });
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeScalarString(item)).filter((item): item is string => Boolean(item));
}

async function writeTempPlanFile(planNode: MigrationPlanNode): Promise<string> {
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'dev-cli-migration-plan-')), 'plan.json');
  await fs.writeJson(target, planNode, {spaces: 2});
  return target;
}

async function runCleanupStage(
  config: AppConfig,
  descriptor: MigrationDescriptor,
  migratedArticleKeys: string[],
  options: {
    checkOnly?: boolean;
    migrationDryRun?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<void> {
  const cleanupSources = cleanupSourceFields(descriptor.introduce.planNode);
  if (cleanupSources.length === 0) {
    return;
  }

  const cleanupStructureFile = await writeDerivedCleanupStructureFile(
    config,
    await resolveMigrationStructureFile(config, descriptor, descriptor.introduce),
    cleanupSources,
  );
  const cleanupPlanNode = buildCleanupPlanNode(descriptor.introduce.planNode, migratedArticleKeys);
  const cleanupPlanFile = await writeTempPlanFile(cleanupPlanNode);

  try {
    await runLiferayResourceSyncStructure(
      config,
      {
        site: descriptor.site,
        key: descriptor.structureKey,
        file: cleanupStructureFile,
        checkOnly: Boolean(options.checkOnly),
        migrationPlan: cleanupPlanFile,
        migrationPhase: 'pre',
        migrationDryRun: Boolean(options.checkOnly) || Boolean(options.migrationDryRun),
        cleanupMigration: true,
      },
      dependencies,
    );
  } finally {
    await fs.remove(cleanupPlanFile);
    await fs.remove(cleanupStructureFile);
  }
}

function buildCleanupPlanNode(introducePlanNode: MigrationPlanNode, migratedArticleKeys: string[]): MigrationPlanNode {
  const cleanupMappings = normalizeMappingsArray(introducePlanNode.mappings)
    .filter((mapping) => mapping.cleanupSource)
    .map((mapping) => ({
      source: normalizeScalarString(mapping.source) ?? '',
      target: normalizeScalarString(mapping.target) ?? '',
      cleanupSource: true,
    }));

  const explicitArticleIds = parseStringArray(introducePlanNode.articleIds);
  const explicitFolderIds = Array.isArray(introducePlanNode.folderIds) ? introducePlanNode.folderIds : undefined;
  const explicitRootFolderIds = Array.isArray(introducePlanNode.rootFolderIds)
    ? introducePlanNode.rootFolderIds
    : undefined;
  const hasExplicitScope =
    explicitArticleIds.length > 0 ||
    (Array.isArray(explicitFolderIds) && explicitFolderIds.length > 0) ||
    (Array.isArray(explicitRootFolderIds) && explicitRootFolderIds.length > 0);

  if (migratedArticleKeys.length === 0 && !hasExplicitScope) {
    throw LiferayErrors.resourceError(
      'Cleanup stage unsafe: no migrated articleIds were produced and the descriptor does not declare articleIds, folderIds or rootFolderIds.',
    );
  }

  return {
    mappings: cleanupMappings,
    ...(Array.isArray(explicitRootFolderIds) && explicitRootFolderIds.length > 0
      ? {rootFolderIds: explicitRootFolderIds}
      : {}),
    ...(Array.isArray(explicitFolderIds) && explicitFolderIds.length > 0 ? {folderIds: explicitFolderIds} : {}),
    ...(migratedArticleKeys.length > 0
      ? {articleIds: migratedArticleKeys}
      : explicitArticleIds.length > 0
        ? {articleIds: explicitArticleIds}
        : {}),
  };
}

async function resolveMigrationStructureFile(
  config: AppConfig,
  descriptor: MigrationDescriptor,
  stage: MigrationStageDescriptor,
): Promise<string> {
  return resolveStructureFile(config, descriptor.structureKey, stage.structureFile);
}

function cleanupSourceFields(planNode: MigrationPlanNode): string[] {
  return normalizeMappingsArray(planNode.mappings)
    .filter((mapping) => mapping.cleanupSource)
    .map((mapping) => normalizeScalarString(mapping.source) ?? '')
    .filter(Boolean);
}

async function writeDerivedCleanupStructureFile(
  config: AppConfig,
  structureFile: string,
  cleanupSources: string[],
): Promise<string> {
  const absoluteStructureFile = path.isAbsolute(structureFile)
    ? structureFile
    : path.resolve(config.repoRoot ?? config.cwd, structureFile);
  const payload = (await fs.readJson(absoluteStructureFile)) as JsonRecord;
  const cleanupSourceSet = new Set(cleanupSources);
  payload.dataDefinitionFields = removeFieldsRecursive(payload.dataDefinitionFields, cleanupSourceSet);
  if (payload.defaultDataLayout && typeof payload.defaultDataLayout === 'object') {
    payload.defaultDataLayout = removeLayoutReferences(payload.defaultDataLayout, cleanupSourceSet);
  }
  if (payload.dataLayout && typeof payload.dataLayout === 'object') {
    payload.dataLayout = removeLayoutReferences(payload.dataLayout, cleanupSourceSet);
  }
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'dev-cli-migration-cleanup-')), 'structure.json');
  await fs.writeJson(target, payload, {spaces: 2});
  return target;
}

function removeFieldsRecursive(fields: unknown, cleanupSources: Set<string>): LayoutNode[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  const kept: LayoutNode[] = [];
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = structuredClone(field) as LayoutNode;
    const reference =
      normalizeScalarString((record.customProperties as JsonRecord | undefined)?.fieldReference) ??
      normalizeScalarString(record.name) ??
      '';
    if (reference !== '' && cleanupSources.has(reference)) {
      continue;
    }
    if (Array.isArray(record.nestedDataDefinitionFields)) {
      record.nestedDataDefinitionFields = removeFieldsRecursive(record.nestedDataDefinitionFields, cleanupSources);
    }
    kept.push(record);
  }
  return kept;
}

function removeLayoutReferences(layout: unknown, cleanupSources: Set<string>): LayoutNode {
  if (!layout || typeof layout !== 'object') {
    return {};
  }

  const record = structuredClone(layout) as LayoutNode;

  if (Array.isArray(record.dataLayoutPages)) {
    record.dataLayoutPages = removeDataLayoutPages(record.dataLayoutPages, cleanupSources);
  }

  if (Array.isArray(record.pages)) {
    record.pages = removeLegacyLayoutPages(record.pages, cleanupSources);
  }

  return record;
}

function removeDataLayoutPages(pages: unknown, cleanupSources: Set<string>): LayoutNode[] {
  if (!Array.isArray(pages)) {
    return [];
  }

  const kept: LayoutNode[] = [];

  for (const page of pages) {
    if (!page || typeof page !== 'object') {
      continue;
    }

    const record = structuredClone(page) as LayoutNode;
    if (Array.isArray(record.dataLayoutRows)) {
      record.dataLayoutRows = removeDataLayoutRows(record.dataLayoutRows, cleanupSources);
    }

    if (!Array.isArray(record.dataLayoutRows) || record.dataLayoutRows.length > 0) {
      kept.push(record);
    }
  }

  return kept;
}

function removeDataLayoutRows(rows: unknown, cleanupSources: Set<string>): LayoutNode[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const kept: LayoutNode[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }

    const record = structuredClone(row) as LayoutNode;
    if (Array.isArray(record.dataLayoutColumns)) {
      record.dataLayoutColumns = removeDataLayoutColumns(record.dataLayoutColumns, cleanupSources);
    }

    if (!Array.isArray(record.dataLayoutColumns) || record.dataLayoutColumns.length > 0) {
      kept.push(record);
    }
  }

  return kept;
}

function removeDataLayoutColumns(columns: unknown, cleanupSources: Set<string>): LayoutNode[] {
  if (!Array.isArray(columns)) {
    return [];
  }

  const kept: LayoutNode[] = [];

  for (const column of columns) {
    if (!column || typeof column !== 'object') {
      continue;
    }

    const record = structuredClone(column) as LayoutNode;
    const fieldNames = Array.isArray(record.fieldNames)
      ? (record.fieldNames as unknown[])
          .map((fieldName) => String(fieldName).trim())
          .filter((fieldName) => fieldName !== '' && !cleanupSources.has(fieldName))
      : undefined;

    if (fieldNames && fieldNames.length === 0) {
      continue;
    }

    if (fieldNames) {
      record.fieldNames = fieldNames;
    }

    kept.push(record);
  }

  return kept;
}

function removeLegacyLayoutPages(pages: unknown, cleanupSources: Set<string>): LayoutNode[] {
  if (!Array.isArray(pages)) {
    return [];
  }

  const kept: LayoutNode[] = [];

  for (const page of pages) {
    if (!page || typeof page !== 'object') {
      continue;
    }

    const record = structuredClone(page) as LayoutNode;
    if (Array.isArray(record.rows)) {
      record.rows = removeLegacyLayoutRows(record.rows, cleanupSources);
    }

    if (!Array.isArray(record.rows) || record.rows.length > 0) {
      kept.push(record);
    }
  }

  return kept;
}

function removeLegacyLayoutRows(rows: unknown, cleanupSources: Set<string>): LayoutNode[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const kept: LayoutNode[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }

    const record = structuredClone(row) as LayoutNode;
    if (Array.isArray(record.columns)) {
      record.columns = removeLegacyLayoutColumns(record.columns, cleanupSources);
    }

    if (!Array.isArray(record.columns) || record.columns.length > 0) {
      kept.push(record);
    }
  }

  return kept;
}

function removeLegacyLayoutColumns(columns: unknown, cleanupSources: Set<string>): LayoutNode[] {
  if (!Array.isArray(columns)) {
    return [];
  }

  const kept: LayoutNode[] = [];

  for (const column of columns) {
    if (!column || typeof column !== 'object') {
      continue;
    }

    const record = structuredClone(column) as LayoutNode;
    const fields = Array.isArray(record.fields)
      ? (record.fields as unknown[])
          .map((fieldName) => String(fieldName).trim())
          .filter((fieldName) => fieldName !== '' && !cleanupSources.has(fieldName))
      : undefined;

    if (fields && fields.length === 0) {
      continue;
    }

    if (fields) {
      record.fields = fields;
    }

    kept.push(record);
  }

  return kept;
}

async function resolvePipelineTemplates(
  config: AppConfig,
  descriptor: MigrationDescriptor,
  dependencies?: ResourceSyncDependencies,
): Promise<string[]> {
  if (!descriptor.templates) {
    return [];
  }

  const structure = await runLiferayResourceGetStructure(
    config,
    {
      site: descriptor.site,
      key: descriptor.structureKey,
    },
    dependencies,
  );
  const templates = await runLiferayInventoryTemplates(
    config,
    {
      site: descriptor.site,
    },
    dependencies,
  );

  return templates
    .filter((item) => Number(item.contentStructureId) === structure.id)
    .map((item) => item.id)
    .filter(Boolean);
}
