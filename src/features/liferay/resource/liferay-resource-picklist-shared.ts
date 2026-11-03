/**
 * Liferay picklists (list type definitions, headless-admin-list-type v1.0).
 *
 * Picklists are company-scoped and addressed by ERC. Entries are identified by
 * `key`, which is the value object entries store, so removing one is breaking.
 */

import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import {resolveExistingArtifactFile} from '../portal/artifact-file-lookup.js';
import {resolveObjectsBaseDir, sanitizeArtifactToken} from '../portal/artifact-paths.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {getOrNull, listAllPages} from './liferay-resource-headless-shared.js';
import {
  asRecords,
  isRecord,
  matchesRemote,
  normalizeI18nMap,
  textOf,
  type ObjectDefinitionChange,
} from './liferay-resource-object-diff.js';

export const LIST_TYPE_ADMIN_BASE = '/o/headless-admin-list-type/v1.0';

export type PicklistPayload = Record<string, unknown> & {
  id?: number;
  externalReferenceCode?: string;
  name?: string;
  listTypeEntries?: Record<string, unknown>[];
};

export type PicklistChange = ObjectDefinitionChange;

const VOLATILE_KEYS = new Set([
  'actions',
  'creator',
  'dateCreated',
  'dateModified',
  'id',
  'listTypeDefinitionId',
  'status',
  'system',
  'type',
]);

// ── Normalization and diff ───────────────────────────────────────────────────

/** Portable shape: no ids or audit data, entries sorted by key, keys sorted. */
export function normalizePicklist(picklist: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(picklist).sort()) {
    if (VOLATILE_KEYS.has(key)) {
      continue;
    }
    result[key] =
      key === 'listTypeEntries'
        ? asRecords(picklist[key])
            .map((entry) => stripEntry(entry))
            .sort((a, b) => textOf(a.key).localeCompare(textOf(b.key)))
        : key.endsWith('_i18n')
          ? normalizeI18nMap(picklist[key])
          : picklist[key];
  }
  return result;
}

export function serializePicklist(picklist: Record<string, unknown>): string {
  return `${JSON.stringify(normalizePicklist(picklist), null, 2)}\n`;
}

function stripEntry(entry: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(entry)
      .sort()
      .filter((key) => !VOLATILE_KEYS.has(key))
      .map((key) => [key, key.endsWith('_i18n') ? normalizeI18nMap(entry[key]) : entry[key]]),
  );
}

/**
 * Local is authoritative for the keys it declares. Entries are matched by key;
 * entries present only remotely are reported as `remove`.
 */
export function diffPicklist(local: Record<string, unknown>, remote: Record<string, unknown>): PicklistChange[] {
  const localNormalized = normalizePicklist(local);
  const remoteNormalized = normalizePicklist(remote);
  const changes: PicklistChange[] = [];

  for (const [key, value] of Object.entries(localNormalized)) {
    if (key === 'listTypeEntries') {
      continue;
    }
    const remoteValue = remoteNormalized[key];
    if (!matchesRemote({value}, {value: remoteValue})) {
      changes.push({kind: remoteValue === undefined ? 'add' : 'change', path: key});
    }
  }

  const localEntries = asRecords(localNormalized.listTypeEntries);
  const remoteEntries = new Map(asRecords(remoteNormalized.listTypeEntries).map((entry) => [textOf(entry.key), entry]));
  const localKeys = new Set(localEntries.map((entry) => textOf(entry.key)));

  for (const entry of localEntries) {
    const key = textOf(entry.key);
    const remoteEntry = remoteEntries.get(key);
    if (!remoteEntry) {
      changes.push({kind: 'add', path: `listTypeEntries[${key}]`});
    } else if (!matchesRemote(entry, remoteEntry)) {
      changes.push({kind: 'change', path: `listTypeEntries[${key}]`});
    }
  }
  for (const key of remoteEntries.keys()) {
    if (!localKeys.has(key)) {
      changes.push({kind: 'remove', path: `listTypeEntries[${key}]`});
    }
  }

  return changes;
}

// ── Remote access ────────────────────────────────────────────────────────────

/** Resolve one picklist by numeric id, ERC or name. Returns it with its entries. */
export async function findPicklist(
  config: AppConfig,
  identifier: string,
  dependencies?: ResourceDependencies,
): Promise<PicklistPayload | null> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const value = identifier.trim();

  let picklist: PicklistPayload | null = null;
  if (/^\d+$/.test(value)) {
    picklist = await getOrNull(() =>
      gateway.getJson<PicklistPayload>(`${LIST_TYPE_ADMIN_BASE}/list-type-definitions/${value}`, 'picklist-get'),
    );
  }

  picklist ??= await getPicklistByErc(config, value, dependencies);

  if (!picklist) {
    const wanted = value.toLowerCase();
    picklist =
      (await listPicklists(config, dependencies)).find(
        (item) =>
          textOf(item.name).toLowerCase() === wanted ||
          (isRecord(item.name_i18n) &&
            Object.values(item.name_i18n).some((name) => textOf(name).toLowerCase() === wanted)),
      ) ?? null;
  }

  return picklist ? withEntries(config, picklist, dependencies) : null;
}

/** Strict lookup by ERC, with entries. Returns null on 404. */
export async function getPicklistByErc(
  config: AppConfig,
  externalReferenceCode: string,
  dependencies?: ResourceDependencies,
): Promise<PicklistPayload | null> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const picklist = await getOrNull(() =>
    gateway.getJson<PicklistPayload>(
      `${LIST_TYPE_ADMIN_BASE}/list-type-definitions/by-external-reference-code/${encodeURIComponent(externalReferenceCode)}`,
      'picklist-get-by-erc',
    ),
  );
  return picklist ? withEntries(config, picklist, dependencies) : null;
}

export async function listPicklists(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<PicklistPayload[]> {
  return listAllPages<PicklistPayload>(
    config,
    `${LIST_TYPE_ADMIN_BASE}/list-type-definitions`,
    'picklist-list',
    dependencies,
  );
}

async function withEntries(
  config: AppConfig,
  picklist: PicklistPayload,
  dependencies?: ResourceDependencies,
): Promise<PicklistPayload> {
  return {
    ...picklist,
    listTypeEntries: await listAllPages<Record<string, unknown>>(
      config,
      `${LIST_TYPE_ADMIN_BASE}/list-type-definitions/${Number(picklist.id)}/list-type-entries`,
      'picklist-entry-list',
      dependencies,
    ),
  };
}

// ── Local files ──────────────────────────────────────────────────────────────

export function defaultPicklistFile(config: AppConfig, externalReferenceCode: string): string {
  return path.join(resolveObjectsBaseDir(config), 'picklists', `${sanitizeArtifactToken(externalReferenceCode)}.json`);
}

export async function resolvePicklistFile(
  config: AppConfig,
  externalReferenceCode: string | undefined,
  file: string | undefined,
): Promise<string> {
  if (file?.trim()) {
    return resolveExistingArtifactFile(config, file);
  }

  if (!externalReferenceCode?.trim()) {
    throw LiferayErrors.configError('import-picklist requires --picklist or --file');
  }

  const candidate = defaultPicklistFile(config, externalReferenceCode);
  if (!(await fs.pathExists(candidate))) {
    throw LiferayErrors.resourceFileNotFound(`picklist:${externalReferenceCode} at ${candidate} (use --file)`, {
      details: {key: externalReferenceCode, type: 'picklist', file: candidate},
    });
  }
  return candidate;
}
