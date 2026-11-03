import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {toBooleanOrFalse} from '../../../../core/utils/coerce.js';
import {isRecord, type JsonRecord} from '../../../../core/utils/json.js';
import {normalizeScalarString} from '../../../../core/utils/text.js';
import {LiferayErrors} from '../../errors/index.js';
import {parseStringList} from './structure-content-plan.js';

export type MigrationStage = 'introduce' | 'cleanup';

export type MigrationStageDescriptor = {
  structureFile?: string;
  planNode: MigrationPlanNode;
  cleanupMigration: boolean;
};

type MigrationPlanMapping = JsonRecord & {
  source: string;
  target: string;
  cleanupSource: boolean;
};

export type MigrationPlanNode = JsonRecord & {
  mappings?: MigrationPlanMapping[];
  articleIds?: unknown;
  folderIds?: unknown;
  rootFolderIds?: unknown;
};

export type MigrationDescriptor = {
  site: string;
  structureKey: string;
  dependentStructures: string[];
  templates: boolean;
  introduce: MigrationStageDescriptor;
};

export async function readMigrationDescriptor(config: AppConfig, migrationFile: string): Promise<MigrationDescriptor> {
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
    dependentStructures: parseStringList(descriptorNode.dependentStructures),
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

export function normalizeMappingsArray(value: unknown): MigrationPlanMapping[] {
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
