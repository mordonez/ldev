/**
 * Normalization and diff for Liferay Object Definitions.
 *
 * The portable shape drops ids and read-only data, system fields, reverse
 * relationships and sub-resources with their own endpoints (actions, layouts,
 * validation rules, views), and sorts named arrays so files are stable.
 */

import {normalizeScalarString} from '../../../core/utils/text.js';

/** Keys that are server-generated, read-only or environment-specific ids. */
const VOLATILE_KEYS = new Set([
  'actions',
  'dateCreated',
  'dateModified',
  'id',
  'listTypeDefinitionId',
  'objectDefinitionId',
  'objectDefinitionId1',
  'objectDefinitionId2',
  'objectFieldId',
  'objectRelationshipId',
  'parameterObjectFieldId',
  'parameterRequired',
  'restContextPath',
  'rootObjectDefinitionExternalReferenceCode',
  'status',
  'titleObjectFieldId',
]);

/** Sub-resources with their own endpoints; out of scope for definition import. */
const UNMANAGED_KEYS = new Set(['objectActions', 'objectLayouts', 'objectValidationRules', 'objectViews']);

export type ObjectDefinitionChange = {
  kind: 'add' | 'change' | 'remove';
  path: string;
};

// ── Normalization ────────────────────────────────────────────────────────────

/**
 * Reduce a remote or local definition to its portable, managed shape: no ids,
 * no system fields, no reverse relationships, and arrays sorted by name so the
 * serialized form is stable across environments.
 */
export function normalizeObjectDefinition(definition: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(definition)) {
    if (VOLATILE_KEYS.has(key) || UNMANAGED_KEYS.has(key) || key === 'system') {
      continue;
    }

    if (key === 'objectFields' && Array.isArray(value)) {
      result.objectFields = sortByName(
        value.filter((field) => isRecord(field) && field.system !== true).map((field) => stripVolatile(field)),
      );
      continue;
    }

    if (key === 'objectRelationships' && Array.isArray(value)) {
      result.objectRelationships = sortByName(
        value.filter((rel) => isRecord(rel) && rel.reverse !== true).map((rel) => stripVolatile(rel)),
      );
      continue;
    }

    result[key] = stripVolatile(value);
  }

  return sortKeys(result) as Record<string, unknown>;
}

export function serializeObjectDefinition(definition: Record<string, unknown>): string {
  return `${JSON.stringify(normalizeObjectDefinition(definition), null, 2)}\n`;
}

function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => stripVolatile(item));
    return items.every((item) => isRecord(item) && typeof item.name === 'string') ? sortByName(items) : items;
  }

  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!VOLATILE_KEYS.has(key)) {
      result[key] = stripVolatile(child);
    }
  }
  return result;
}

function sortByName<T>(items: T[]): T[] {
  return [...items].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

// ── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Compare a local definition against the remote one. Local is authoritative for
 * every key it declares; remote keys the file omits are portal defaults and are
 * ignored. Custom fields present only remotely are reported as `remove` (the
 * PUT deletes them). Remote-only relationships are left alone, so they are not
 * reported.
 */
export function diffObjectDefinition(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): ObjectDefinitionChange[] {
  const localNormalized = normalizeObjectDefinition(local);
  const remoteNormalized = normalizeObjectDefinition(remote);
  const changes: ObjectDefinitionChange[] = [];

  for (const [key, localValue] of Object.entries(localNormalized)) {
    if (key === 'objectFields' || key === 'objectRelationships') {
      continue;
    }
    if (!isSubset(localValue, remoteNormalized[key])) {
      changes.push({kind: remoteNormalized[key] === undefined ? 'add' : 'change', path: key});
    }
  }

  changes.push(
    ...diffNamedCollection(
      'objectFields',
      asRecords(localNormalized.objectFields),
      asRecords(remoteNormalized.objectFields),
      true,
    ),
    ...diffNamedCollection(
      'objectRelationships',
      asRecords(localNormalized.objectRelationships),
      asRecords(remoteNormalized.objectRelationships),
      false,
    ),
  );

  return changes;
}

function diffNamedCollection(
  collection: string,
  local: Record<string, unknown>[],
  remote: Record<string, unknown>[],
  reportRemoteOnly: boolean,
): ObjectDefinitionChange[] {
  const changes: ObjectDefinitionChange[] = [];
  const remoteByName = new Map(remote.map((item) => [nameOf(item), item]));
  const localNames = new Set(local.map((item) => nameOf(item)));

  for (const item of local) {
    const name = nameOf(item);
    const remoteItem = remoteByName.get(name);
    if (!remoteItem) {
      changes.push({kind: 'add', path: `${collection}[${name}]`});
      continue;
    }
    for (const [key, value] of Object.entries(item)) {
      if (!isSubset(value, remoteItem[key])) {
        changes.push({kind: 'change', path: `${collection}[${name}].${key}`});
      }
    }
  }

  if (reportRemoteOnly) {
    for (const item of remote) {
      if (!localNames.has(nameOf(item))) {
        changes.push({kind: 'remove', path: `${collection}[${nameOf(item)}]`});
      }
    }
  }

  return changes;
}

/** True when every key the local item declares (ids aside) has the same value remotely. */
export function matchesRemote(local: Record<string, unknown>, remote: Record<string, unknown>): boolean {
  return isSubset(stripVolatile(local), stripVolatile(remote));
}

function isSubset(local: unknown, remote: unknown): boolean {
  if (Array.isArray(local)) {
    if (!Array.isArray(remote)) {
      return false;
    }
    if (local.every((item) => isRecord(item) && typeof item.name === 'string')) {
      // Named entries (e.g. objectFieldSettings): match by name, remote defaults may add more.
      const remoteByName = new Map(remote.map((item) => [nameOf(item), item]));
      return local.every((item) => isSubset(item, remoteByName.get(nameOf(item))));
    }
    if (local.length !== remote.length) {
      return false;
    }
    return local.every((item, index) => isSubset(item, remote[index]));
  }

  if (isRecord(local)) {
    if (!isRecord(remote)) {
      return false;
    }
    return Object.entries(local).every(([key, value]) => isSubset(value, remote[key]));
  }

  return local === remote;
}

// ── Utilities ────────────────────────────────────────────────────────────────

/** Scalar value as a trimmed string, or '' for anything else. */
export function textOf(value: unknown): string {
  return normalizeScalarString(value) ?? '';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function nameOf(item: unknown): string {
  return isRecord(item) ? textOf(item.name) : '';
}
