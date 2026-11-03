import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {normalizeScalarString} from '../../../../core/utils/text.js';
import {LiferayErrors} from '../../errors/index.js';
import {runLiferayInventoryTemplates} from '../../inventory/liferay-inventory-templates.js';
import {runLiferayResourceGetStructure} from '../liferay-resource-get-structure.js';
import {resolveStructureFile} from '../../portal/artifact-paths.js';
import {runLiferayResourceImportStructure} from '../liferay-resource-import-structure.js';
import type {ResourceDependencies} from '../liferay-resource-artifact-shared.js';
import {
  normalizeMappingsArray,
  type MigrationDescriptor,
  type MigrationPlanNode,
  type MigrationStageDescriptor,
} from './pipeline-descriptor.js';
import {cleanupSourceFields, writeDerivedCleanupStructureFile} from './pipeline-structure-cleanup.js';
import {parseStringList} from './structure-content-plan.js';

export async function writeTempPlanFile(planNode: MigrationPlanNode): Promise<string> {
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'dev-cli-migration-plan-')), 'plan.json');
  await fs.writeJson(target, planNode, {spaces: 2});
  return target;
}

export async function runCleanupStage(
  config: AppConfig,
  descriptor: MigrationDescriptor,
  migratedArticleKeys: string[],
  options: {
    checkOnly?: boolean;
    migrationDryRun?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<Awaited<ReturnType<typeof runLiferayResourceImportStructure>>> {
  const cleanupSources = cleanupSourceFields(descriptor.introduce.planNode);
  if (cleanupSources.length === 0) {
    throw LiferayErrors.resourceError(
      'Cleanup stage skipped: descriptor introduce.mappings has no cleanupSource=true entries.',
    );
  }

  const cleanupStructureFile = await writeDerivedCleanupStructureFile(
    config,
    await resolveMigrationStructureFile(config, descriptor, descriptor.introduce),
    cleanupSources,
  );
  const cleanupPlanNode = buildCleanupPlanNode(descriptor.introduce.planNode, migratedArticleKeys);
  const cleanupPlanFile = await writeTempPlanFile(cleanupPlanNode);

  try {
    return await runLiferayResourceImportStructure(
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

  const explicitArticleIds = parseStringList(introducePlanNode.articleIds);
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

export async function resolveMigrationStructureFile(
  config: AppConfig,
  descriptor: MigrationDescriptor,
  stage: MigrationStageDescriptor,
): Promise<string> {
  return resolveStructureFile(config, descriptor.structureKey, stage.structureFile);
}

export async function resolvePipelineTemplates(
  config: AppConfig,
  descriptor: MigrationDescriptor,
  dependencies?: ResourceDependencies,
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
