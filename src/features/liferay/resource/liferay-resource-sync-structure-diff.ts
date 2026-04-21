/** Structure field reference collection, diff, and transition payload helpers. */

import {normalizeScalarString} from '../../../core/utils/text.js';

export function collectFieldReferences(definition: Record<string, unknown>): Set<string> {
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
    const name = normalizeScalarString(record.name) ?? '';
    if (name) {
      refs.add(name);
    }
    const customProperties = (record.customProperties ?? {}) as Record<string, unknown>;
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
  const fieldReference = normalizeScalarString(customProperties.fieldReference) ?? '';
  if (fieldReference) {
    return fieldReference;
  }
  return normalizeScalarString(field.name) ?? '';
}

export function removeExternalReferenceCode(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(payload);
  delete copy.externalReferenceCode;
  return copy;
}

export function extractStructureShapeSignature(definition: Record<string, unknown>): string {
  const key = normalizeScalarString(definition.dataDefinitionKey) ?? '';
  const refs = [...collectFieldReferences(definition)].sort();
  return JSON.stringify({key, refs});
}

export function structureShapeMatches(runtimeDefinition: Record<string, unknown>, expectedSignature: string): boolean {
  return extractStructureShapeSignature(runtimeDefinition) === expectedSignature;
}
