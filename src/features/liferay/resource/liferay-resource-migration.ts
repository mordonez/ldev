import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {runLiferayInventoryTemplates} from '../inventory/liferay-inventory-templates.js';
import {runLiferayResourceGetStructure} from './liferay-resource-get-structure.js';
import {resolveStructureFile} from './liferay-resource-paths.js';
import {runLiferayResourceSyncStructure} from './liferay-resource-sync-structure.js';
import {runLiferayResourceSyncTemplate} from './liferay-resource-sync-template.js';
import type {ResourceSyncDependencies} from './liferay-resource-sync-shared.js';

type MigrationStage = 'introduce' | 'cleanup';

type MigrationStageDescriptor = {
  structureFile?: string;
  planNode: Record<string, unknown>;
  cleanupMigration: boolean;
};

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
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceMigrationRunResult> {
  const descriptor = await readMigrationDescriptor(config, options.migrationFile);
  const stage = options.stage ?? 'introduce';
  const stageDescriptor = descriptor.introduce;
  const structureFile = await resolveMigrationStructureFile(config, descriptor, stageDescriptor);

  const planFile = await writeTempPlanFile(stageDescriptor.planNode);

  try {
    const result = await runLiferayResourceSyncStructure(
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
      },
      dependencies,
    );

    return {
      site: descriptor.site,
      structureKey: descriptor.structureKey,
      stage,
      status: result.status,
      id: result.id,
      migrationApplied: Boolean(result.migration),
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
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceMigrationPipelineResult> {
  const descriptor = await readMigrationDescriptor(config, options.migrationFile);
  const dependentStructureResults: Array<{key: string; status: string; id: string}> = [];

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

  const structure = await runLiferayResourceMigrationRun(
    config,
    {
      migrationFile: options.migrationFile,
      stage: 'introduce',
      checkOnly: options.checkOnly,
      migrationDryRun: options.migrationDryRun,
    },
    dependencies,
  );

  const pipelineTemplates = await resolvePipelineTemplates(config, descriptor, dependencies);
  const templateResults: Array<{name: string; status: string; id: string}> = [];
  for (const templateName of pipelineTemplates) {
    const result = await runLiferayResourceSyncTemplate(
      config,
      {
        site: descriptor.site,
        key: templateName,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissingTemplates),
      },
      dependencies,
    );
    templateResults.push({name: templateName, status: result.status, id: result.id});
  }

  if (options.runCleanup) {
    await runCleanupStage(
      config,
      descriptor,
      structure.migratedArticleKeys,
      {
        checkOnly: options.checkOnly,
        migrationDryRun: options.migrationDryRun,
      },
      dependencies,
    );
  }

  if (!options.skipValidation) {
    if (options.runCleanup) {
      await runCleanupStage(
        config,
        descriptor,
        structure.migratedArticleKeys,
        {
          checkOnly: true,
          migrationDryRun: true,
        },
        dependencies,
      );
    } else {
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
    }

    for (const templateName of pipelineTemplates) {
      await runLiferayResourceSyncTemplate(
        config,
        {
          site: descriptor.site,
          key: templateName,
          checkOnly: true,
        },
        dependencies,
      );
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

async function readDescriptorNode(config: AppConfig, migrationFile: string): Promise<Record<string, unknown>> {
  const candidate = path.isAbsolute(migrationFile)
    ? migrationFile
    : path.resolve(config.repoRoot ?? config.cwd, migrationFile);
  if (!(await fs.pathExists(candidate))) {
    throw new CliError(`Migration descriptor not found: ${migrationFile}`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }
  return await fs.readJson(candidate);
}

function parseMigrationDescriptor(descriptorNode: Record<string, unknown>): MigrationDescriptor {
  const site = String(descriptorNode.site ?? '/global').trim() || '/global';
  const structureKey = String(descriptorNode.structureKey ?? '').trim();
  if (structureKey === '') {
    throw new CliError('Invalid descriptor: missing structureKey', {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  const introduceNode = asRecord(descriptorNode.introduce);
  if (Object.keys(introduceNode).length === 0) {
    throw new CliError('Invalid descriptor: missing introduce.', {code: 'LIFERAY_RESOURCE_ERROR'});
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

function parseStageDescriptor(node: Record<string, unknown>, stageName: MigrationStage): MigrationStageDescriptor {
  const structureFile = String(node.structureFile ?? '').trim();
  const rawPlanNode = Array.isArray(node.mappings) ? node : asRecord(node.plan);
  const planNode = {
    ...rawPlanNode,
    mappings: normalizeMappingsArray(rawPlanNode.mappings),
  };
  if (!Array.isArray(planNode.mappings) || planNode.mappings.length === 0) {
    throw new CliError(`Invalid descriptor: ${stageName}.mappings[] is empty.`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }
  return {
    structureFile,
    planNode,
    cleanupMigration: false,
  };
}

function normalizeMappingsArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return [];
    }
    const source = String((row as Record<string, unknown>).source ?? '').trim();
    const target = String((row as Record<string, unknown>).target ?? '').trim();
    if (source === '' || target === '') {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

async function writeTempPlanFile(planNode: Record<string, unknown>): Promise<string> {
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

function buildCleanupPlanNode(
  introducePlanNode: Record<string, unknown>,
  migratedArticleKeys: string[],
): Record<string, unknown> {
  const cleanupMappings = normalizeMappingsArray(introducePlanNode.mappings)
    .filter((mapping) => Boolean((mapping as Record<string, unknown>).cleanupSource))
    .map((mapping) => ({
      source: String((mapping as Record<string, unknown>).source ?? '').trim(),
      target: String((mapping as Record<string, unknown>).target ?? '').trim(),
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
    throw new CliError(
      'Cleanup stage unsafe: no migrated articleIds were produced and the descriptor does not declare articleIds, folderIds or rootFolderIds.',
      {code: 'LIFERAY_RESOURCE_ERROR'},
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

function cleanupSourceFields(planNode: Record<string, unknown>): string[] {
  return normalizeMappingsArray(planNode.mappings)
    .filter((mapping) => Boolean((mapping as Record<string, unknown>).cleanupSource))
    .map((mapping) => String((mapping as Record<string, unknown>).source ?? '').trim())
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
  const payload = (await fs.readJson(absoluteStructureFile)) as Record<string, unknown>;
  payload.dataDefinitionFields = removeFieldsRecursive(payload.dataDefinitionFields, new Set(cleanupSources));
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'dev-cli-migration-cleanup-')), 'structure.json');
  await fs.writeJson(target, payload, {spaces: 2});
  return target;
}

function removeFieldsRecursive(fields: unknown, cleanupSources: Set<string>): Array<Record<string, unknown>> {
  if (!Array.isArray(fields)) {
    return [];
  }

  const kept: Array<Record<string, unknown>> = [];
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = structuredClone(field) as Record<string, unknown>;
    const reference = String(
      (record.customProperties as Record<string, unknown> | undefined)?.fieldReference ?? record.name ?? '',
    ).trim();
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
