import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import type {AppConfig} from '../../../../core/config/load-config.js';
import type {JsonRecord} from '../../../../core/utils/json.js';
import {normalizeScalarString} from '../../../../core/utils/text.js';
import {normalizeMappingsArray, type MigrationPlanNode} from './pipeline-descriptor.js';

type LayoutNode = JsonRecord;

export function cleanupSourceFields(planNode: MigrationPlanNode): string[] {
  return normalizeMappingsArray(planNode.mappings)
    .filter((mapping) => mapping.cleanupSource)
    .map((mapping) => normalizeScalarString(mapping.source) ?? '')
    .filter(Boolean);
}

export async function writeDerivedCleanupStructureFile(
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
