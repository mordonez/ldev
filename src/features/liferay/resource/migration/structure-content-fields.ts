import {isRecord, type JsonRecord} from '../../../../core/utils/json.js';
import {normalizeScalarString} from '../../../../core/utils/text.js';
import type {MigrationRule} from './structure-content-plan.js';

export type StructuredContentRow = JsonRecord & {
  id?: string | number;
  key?: string;
  contentStructureId?: string | number;
  structuredContentFolderId?: number | string;
  contentFields?: unknown;
  availableLanguages?: string[];
};

type ContentField = JsonRecord & {
  name?: string;
  contentFieldValue?: unknown;
  nestedContentFields?: unknown;
};

export type DataDefinitionField = JsonRecord & {
  name?: string;
  customProperties?: JsonRecord;
  nestedDataDefinitionFields?: unknown;
};

export function applyMappings(
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

function firstSourceValue(contentFields: unknown, source: string): unknown {
  if (!Array.isArray(contentFields)) {
    return null;
  }
  for (const field of contentFields) {
    if (!isRecord(field)) {
      continue;
    }
    if ((normalizeScalarString(field.name) ?? '') === source) {
      const value = field.contentFieldValue;
      if (!isEmptyValue(value)) {
        return value;
      }
    }
    const nested = firstSourceValue(field.nestedContentFields, source);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

function setTargetValue(item: StructuredContentRow, target: string, value: unknown): boolean {
  if (target.includes('[].')) {
    const [base, child] = target.split('[].', 2);
    return setFieldsetTarget(item, base, child, value);
  }
  return setSimpleTarget(item, target, value);
}

function setSimpleTarget(item: StructuredContentRow, target: string, value: unknown): boolean {
  const fields = ensureContentFields(item);
  for (const field of fields) {
    if ((normalizeScalarString(field.name) ?? '') === target) {
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

function setFieldsetTarget(item: StructuredContentRow, base: string, child: string, value: unknown): boolean {
  const fields = ensureContentFields(item);
  for (const field of fields) {
    if ((normalizeScalarString(field.name) ?? '') !== base) {
      continue;
    }
    const nested = ensureNestedContentFields(field);
    for (const nestedField of nested) {
      if ((normalizeScalarString(nestedField.name) ?? '') === child) {
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

function cleanupSourceField(item: StructuredContentRow, source: string): boolean {
  return cleanupSourceInFields(ensureContentFields(item), source);
}

function cleanupSourceInFields(fields: ContentField[], source: string): boolean {
  let changed = false;
  for (const field of fields) {
    if ((normalizeScalarString(field.name) ?? '') === source) {
      field.contentFieldValue = {data: ''};
      changed = true;
    }
    if (cleanupSourceInFields(getNestedContentFields(field), source)) {
      changed = true;
    }
  }
  return changed;
}

export function contentFieldsEqual(
  left: JsonRecord,
  right: JsonRecord,
  definitionFields?: DataDefinitionField[],
): boolean {
  return (
    JSON.stringify(normalizeComparableContentFields(left.contentFields ?? [], definitionFields)) ===
    JSON.stringify(normalizeComparableContentFields(right.contentFields ?? [], definitionFields))
  );
}

export function toApiContentFields(contentFields: unknown, definitionFields: unknown): unknown {
  if (!Array.isArray(contentFields)) {
    return contentFields;
  }

  const scope = Array.isArray(definitionFields) ? (definitionFields as DataDefinitionField[]) : [];

  return (contentFields as unknown[]).map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }

    const field = structuredClone(entry) as ContentField;
    const definition = findDefinitionField(scope, normalizeScalarString(field.name) ?? '');

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
    const internalName = normalizeScalarString(definition.name) ?? '';
    const fieldReference = normalizeScalarString(definition.customProperties?.fieldReference) ?? '';

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

  if (isRecord(value)) {
    const normalized: JsonRecord = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeComparableValue(value[key]);
    }
    return normalized;
  }

  return value;
}

function normalizeComparableContentFields(value: unknown, definitionFields?: DataDefinitionField[]): unknown {
  if (!Array.isArray(value)) {
    return normalizeComparableValue(value);
  }

  const scope = Array.isArray(definitionFields) ? definitionFields : [];
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return normalizeComparableValue(entry);
    }

    const normalized: JsonRecord = {};
    const definition = findDefinitionField(scope, normalizeScalarString(entry.name) ?? '');

    for (const key of Object.keys(entry).sort()) {
      if (key === 'name') {
        normalized.name =
          normalizeScalarString(definition?.customProperties?.fieldReference) ??
          normalizeScalarString(definition?.name) ??
          entry.name;
        continue;
      }

      if (key === 'nestedContentFields') {
        normalized.nestedContentFields = normalizeComparableContentFields(
          entry.nestedContentFields,
          definition?.nestedDataDefinitionFields as DataDefinitionField[] | undefined,
        );
        continue;
      }

      normalized[key] = normalizeComparableValue(entry[key]);
    }

    return normalized;
  });
}

function ensureContentFields(item: JsonRecord): ContentField[] {
  if (!Array.isArray(item.contentFields)) {
    item.contentFields = [];
  }
  return item.contentFields as ContentField[];
}

function ensureNestedContentFields(field: ContentField): ContentField[] {
  if (!Array.isArray(field.nestedContentFields)) {
    field.nestedContentFields = [];
  }
  return field.nestedContentFields as ContentField[];
}

function getNestedContentFields(field: ContentField): ContentField[] {
  return Array.isArray(field.nestedContentFields) ? (field.nestedContentFields as ContentField[]) : [];
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return true;
    }
    if (keys.length === 1 && keys[0] === 'data') {
      return (normalizeScalarString(value.data) ?? '') === '';
    }
  }
  return false;
}

export function copyIfPresent(source: JsonRecord, fields: string[]): JsonRecord {
  const target: JsonRecord = {};
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) {
      target[field] = structuredClone(source[field]);
    }
  }
  return target;
}
