/** Structure field reference collection, diff, and transition payload helpers. */

import type {JsonRecord} from '../../../core/utils/json.js';
import {normalizeScalarString} from '../../../core/utils/text.js';

export type StructureDefinitionPayload = JsonRecord;

export function collectFieldReferences(definition: StructureDefinitionPayload): Set<string> {
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

export function setDifference<T>(left: Set<T>, right: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of left) {
    if (!right.has(item)) {
      result.add(item);
    }
  }
  return result;
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
  const refs = [...collectFieldReferences(definition)].sort();
  return JSON.stringify({key, refs});
}

export function structureShapeMatches(
  runtimeDefinition: StructureDefinitionPayload,
  expectedSignature: string,
): boolean {
  return extractStructureShapeSignature(runtimeDefinition) === expectedSignature;
}
