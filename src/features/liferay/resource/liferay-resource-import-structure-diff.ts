/** Structure field reference collection, diff, and transition payload helpers. */

import type {JsonRecord} from '../../../core/utils/json.js';
import {normalizeScalarString} from '../../../core/utils/text.js';

export type StructureDefinitionPayload = JsonRecord;

export function collectFieldReferences(definition: StructureDefinitionPayload): Set<string> {
  const refs = new Set<string>();
  collectFieldReferencesRecursive(definition.dataDefinitionFields, refs);
  return refs;
}

export function collectDuplicateFieldIdentities(definition: StructureDefinitionPayload): string[] {
  const counts = new Map<string, number>();
  collectFieldIdentityCounts(definition.dataDefinitionFields, counts);

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([identity]) => identity)
    .sort();
}

function collectFieldReferencesRecursive(fields: unknown, refs: Set<string>): void {
  if (!Array.isArray(fields)) {
    return;
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = field as JsonRecord;
    const name = normalizeScalarString(record.name) ?? '';
    if (name) {
      refs.add(name);
    }
    const customProperties = (record.customProperties ?? {}) as JsonRecord;
    const fieldReference = normalizeScalarString(customProperties.fieldReference) ?? '';
    if (fieldReference) {
      refs.add(fieldReference);
    }
    collectFieldReferencesRecursive(record.nestedDataDefinitionFields, refs);
  }
}

function collectFieldIdentityCounts(fields: unknown, counts: Map<string, number>): void {
  if (!Array.isArray(fields)) {
    return;
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = field as JsonRecord;
    const customProperties = (record.customProperties ?? {}) as JsonRecord;
    const identities = new Set(
      [normalizeScalarString(customProperties.fieldReference), normalizeScalarString(record.name)].filter(
        (value): value is string => Boolean(value),
      ),
    );
    for (const identity of identities) {
      counts.set(identity, (counts.get(identity) ?? 0) + 1);
    }
    collectFieldIdentityCounts(record.nestedDataDefinitionFields, counts);
  }
}

export function setDifference<T>(left: Set<T>, right: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of left) {
    if (!right.has(item)) {
      result.add(item);
    }
  }
  return result;
}

export function collectFieldShapeChanges(
  runtimeDefinition: StructureDefinitionPayload,
  nextDefinition: StructureDefinitionPayload,
): string[] {
  const before = collectFieldShapeByIdentity(runtimeDefinition.dataDefinitionFields);
  const after = collectFieldShapeByIdentity(nextDefinition.dataDefinitionFields);
  const changed: string[] = [];

  for (const [identity, beforeShape] of before) {
    const afterShape = after.get(identity);
    if (!afterShape) {
      continue;
    }
    if (JSON.stringify(beforeShape) !== JSON.stringify(afterShape)) {
      changed.push(identity);
    }
  }

  return changed.sort();
}

/**
 * Builds a transition payload that preserves all runtime fields while adding new ones.
 * Used when migrating content to a new structure definition.
 */
export function buildTransitionPayload(
  runtimeDefinition: StructureDefinitionPayload,
  finalPayload: StructureDefinitionPayload,
): StructureDefinitionPayload {
  const transition = structuredClone(finalPayload);
  const runtimeFields = Array.isArray(runtimeDefinition.dataDefinitionFields)
    ? (structuredClone(runtimeDefinition.dataDefinitionFields) as JsonRecord[])
    : [];
  const finalFields = Array.isArray(transition.dataDefinitionFields)
    ? (transition.dataDefinitionFields as JsonRecord[])
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

function fieldIdentity(field: JsonRecord): string {
  const customProperties = (field.customProperties ?? {}) as JsonRecord;
  const fieldReference = normalizeScalarString(customProperties.fieldReference) ?? '';
  if (fieldReference) {
    return fieldReference;
  }
  return normalizeScalarString(field.name) ?? '';
}

export function removeExternalReferenceCode(payload: StructureDefinitionPayload): StructureDefinitionPayload {
  const copy = structuredClone(payload);
  delete copy.externalReferenceCode;
  return copy;
}

export function extractStructureShapeSignature(definition: StructureDefinitionPayload): string {
  const key = normalizeScalarString(definition.dataDefinitionKey) ?? '';
  const fields = normalizeFieldShape(definition.dataDefinitionFields);
  return JSON.stringify({key, fields});
}

export function structureShapeMatches(
  runtimeDefinition: StructureDefinitionPayload,
  expectedSignature: string,
): boolean {
  return extractStructureShapeSignature(runtimeDefinition) === expectedSignature;
}

function normalizeFieldShape(fields: unknown): unknown[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .filter((field): field is JsonRecord => Boolean(field) && typeof field === 'object' && !Array.isArray(field))
    .map((field) => {
      const customProperties = (field.customProperties ?? {}) as JsonRecord;
      return {
        fieldType: normalizeScalarString(field.fieldType) ?? '',
        name: normalizeScalarString(field.name) ?? '',
        reference: normalizeScalarString(customProperties.fieldReference) ?? '',
        repeatable: Boolean(field.repeatable),
        nested: normalizeFieldShape(field.nestedDataDefinitionFields),
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.reference}\u0000${left.name}`;
      const rightKey = `${right.reference}\u0000${right.name}`;
      return leftKey.localeCompare(rightKey);
    });
}

type FieldShape = {
  fieldType: string;
  path: string;
  repeatable: boolean;
};

function collectFieldShapeByIdentity(fields: unknown, parentPath = ''): Map<string, FieldShape> {
  const result = new Map<string, FieldShape>();
  collectFieldShapeByIdentityRecursive(fields, parentPath, result);
  return result;
}

function collectFieldShapeByIdentityRecursive(
  fields: unknown,
  parentPath: string,
  result: Map<string, FieldShape>,
): void {
  if (!Array.isArray(fields)) {
    return;
  }

  for (const field of fields) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      continue;
    }

    const record = field as JsonRecord;
    const identity = fieldIdentity(record);
    if (identity === '') {
      continue;
    }

    const repeatable = Boolean(record.repeatable);
    const path = parentPath === '' ? identity : `${parentPath}.${identity}`;
    result.set(identity, {
      fieldType: normalizeScalarString(record.fieldType) ?? '',
      path,
      repeatable,
    });

    collectFieldShapeByIdentityRecursive(record.nestedDataDefinitionFields, repeatable ? `${path}[]` : path, result);
  }
}
