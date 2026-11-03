/**
 * Remote access and local files for Liferay Object Definitions (headless object-admin v1.0).
 *
 * Object definitions are company-scoped, so they are addressed by external
 * reference code (ERC) rather than by site.
 */

import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, isGatewayStatus} from '../liferay-gateway.js';
import {resolveExistingArtifactFile} from '../portal/artifact-file-lookup.js';
import {resolveObjectsBaseDir, sanitizeArtifactToken} from '../portal/artifact-paths.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';

import {textOf} from './liferay-resource-object-diff.js';

export * from './liferay-resource-object-diff.js';

export const OBJECT_ADMIN_BASE = '/o/object-admin/v1.0';
const LIST_TYPE_ADMIN_BASE = '/o/headless-admin-list-type/v1.0';
const PAGE_SIZE = 200;

export type ObjectDefinitionPayload = Record<string, unknown> & {
  id?: number;
  externalReferenceCode?: string;
  name?: string;
  status?: {code?: number; label?: string};
  objectFields?: Record<string, unknown>[];
  objectRelationships?: Record<string, unknown>[];
};

type Page<T> = {items?: T[]; lastPage?: number};

// ── Remote access ────────────────────────────────────────────────────────────

/**
 * Resolve one object definition by numeric id, ERC, or name (`Course` or
 * `C_Course`). Returns the definition with its relationships attached.
 */
export async function findObjectDefinition(
  config: AppConfig,
  identifier: string,
  dependencies?: ResourceDependencies,
): Promise<ObjectDefinitionPayload | null> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const value = identifier.trim();

  let definition: ObjectDefinitionPayload | null = null;
  if (/^\d+$/.test(value)) {
    definition = await getOrNull(() =>
      gateway.getJson<ObjectDefinitionPayload>(`${OBJECT_ADMIN_BASE}/object-definitions/${value}`, 'object-get'),
    );
  }

  definition ??= await getObjectDefinitionByErc(config, value, dependencies);

  if (!definition) {
    const wanted = value.replace(/^C_/, '').toLowerCase();
    definition =
      (await listObjectDefinitions(config, dependencies)).find((item) => textOf(item.name).toLowerCase() === wanted) ??
      null;
  }

  if (!definition) {
    return null;
  }

  return {
    ...definition,
    objectRelationships: await listObjectRelationships(config, Number(definition.id), dependencies),
  };
}

/** Strict lookup by ERC, without relationships. Returns null on 404. */
export async function getObjectDefinitionByErc(
  config: AppConfig,
  externalReferenceCode: string,
  dependencies?: ResourceDependencies,
): Promise<ObjectDefinitionPayload | null> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  return getOrNull(() =>
    gateway.getJson<ObjectDefinitionPayload>(
      `${OBJECT_ADMIN_BASE}/object-definitions/by-external-reference-code/${encodeURIComponent(externalReferenceCode)}`,
      'object-get-by-erc',
    ),
  );
}

export async function listObjectDefinitions(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<ObjectDefinitionPayload[]> {
  return listAllPages<ObjectDefinitionPayload>(
    config,
    `${OBJECT_ADMIN_BASE}/object-definitions`,
    'object-list',
    dependencies,
  );
}

export async function listObjectRelationships(
  config: AppConfig,
  objectDefinitionId: number,
  dependencies?: ResourceDependencies,
): Promise<Record<string, unknown>[]> {
  return listAllPages<Record<string, unknown>>(
    config,
    `${OBJECT_ADMIN_BASE}/object-definitions/${objectDefinitionId}/object-relationships`,
    'object-relationship-list',
    dependencies,
  );
}

export async function listTypeDefinitionExists(
  config: AppConfig,
  externalReferenceCode: string,
  dependencies?: ResourceDependencies,
): Promise<boolean> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const found = await getOrNull(() =>
    gateway.getJson<Record<string, unknown>>(
      `${LIST_TYPE_ADMIN_BASE}/list-type-definitions/by-external-reference-code/${encodeURIComponent(externalReferenceCode)}`,
      'picklist-get-by-erc',
    ),
  );
  return found !== null;
}

async function listAllPages<T>(
  config: AppConfig,
  basePath: string,
  label: string,
  dependencies?: ResourceDependencies,
): Promise<T[]> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const items: T[] = [];

  for (let page = 1; ; page++) {
    const response = await gateway.getJson<Page<T>>(`${basePath}?page=${page}&pageSize=${PAGE_SIZE}`, label);
    items.push(...(response.items ?? []));
    if (!response.items?.length || page >= (response.lastPage ?? 1)) {
      return items;
    }
  }
}

async function getOrNull<T>(request: () => Promise<T>): Promise<T | null> {
  try {
    return await request();
  } catch (error) {
    if (isGatewayStatus(error, 404)) {
      return null;
    }
    throw error;
  }
}

// ── Local files ──────────────────────────────────────────────────────────────

export function defaultObjectDefinitionFile(config: AppConfig, externalReferenceCode: string): string {
  return path.join(resolveObjectsBaseDir(config), `${sanitizeArtifactToken(externalReferenceCode)}.json`);
}

export async function resolveObjectDefinitionFile(
  config: AppConfig,
  externalReferenceCode: string | undefined,
  file: string | undefined,
): Promise<string> {
  if (file?.trim()) {
    return resolveExistingArtifactFile(config, file);
  }

  if (!externalReferenceCode?.trim()) {
    throw LiferayErrors.configError('import-object requires --object or --file');
  }

  const candidate = defaultObjectDefinitionFile(config, externalReferenceCode);
  if (!(await fs.pathExists(candidate))) {
    throw LiferayErrors.resourceFileNotFound(`object:${externalReferenceCode} at ${candidate} (use --file)`, {
      details: {key: externalReferenceCode, type: 'object', file: candidate},
    });
  }
  return candidate;
}
