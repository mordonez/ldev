import fs from 'fs-extra';

import {toBooleanOrFalse} from '../../../../core/utils/coerce.js';
import {isRecord} from '../../../../core/utils/json.js';
import {normalizeScalarString} from '../../../../core/utils/text.js';
import {LiferayErrors} from '../../errors/index.js';

export type MigrationRule = {
  source: string;
  target: string;
  cleanupSource: boolean;
};

export type MigrationPlanData = {
  rules: MigrationRule[];
  scopedRootFolderIds: number[];
  scopedFolderIds: number[];
  articleIds: string[];
};

type MigrationPlanShape = {
  mappings?: unknown;
  rootFolderIds?: unknown;
  folderIds?: unknown;
  articleIds?: unknown;
};

export function parseMigrationPlan(plan: MigrationPlanShape): MigrationPlanData {
  const rules = parseMappings(plan.mappings);
  return {
    rules,
    scopedRootFolderIds: parseNumberList(plan.rootFolderIds),
    scopedFolderIds: parseNumberList(plan.folderIds),
    articleIds: parseStringList(plan.articleIds),
  };
}

export async function readMigrationPlanData(migrationPlanPath: string): Promise<MigrationPlanData> {
  const planRoot: unknown = await fs.readJson(migrationPlanPath);
  const plan = readMigrationPlanShape(planRoot);
  const planData = parseMigrationPlan(plan);
  if (planData.rules.length === 0) {
    throw LiferayErrors.resourceError('Invalid migration plan: missing mappings[]');
  }
  return planData;
}

function parseMappings(rawMappings: unknown): MigrationRule[] {
  if (!Array.isArray(rawMappings)) {
    return [];
  }

  return rawMappings.flatMap((row) => {
    if (!isRecord(row)) {
      return [];
    }
    const source = normalizeScalarString(row.source) ?? normalizeScalarString(row.from) ?? '';
    const target = normalizeScalarString(row.target) ?? normalizeScalarString(row.to) ?? '';
    if (!source || !target) {
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

function parseNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

export function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeScalarString(item)).filter((item): item is string => Boolean(item));
}

function readMigrationPlanShape(planRoot: unknown): MigrationPlanShape {
  const plan =
    isRecord(planRoot) && 'plan' in planRoot
      ? planRoot.plan
      : isRecord(planRoot) && isRecord(planRoot.introduce)
        ? Array.isArray(planRoot.introduce.mappings)
          ? planRoot.introduce
          : planRoot.introduce.plan
        : planRoot;
  return isRecord(plan) ? plan : {};
}
