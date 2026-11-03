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
import {createLiferayGateway} from '../liferay-gateway.js';
import {resolveExistingArtifactFile} from '../portal/artifact-file-lookup.js';
import {resolveObjectsBaseDir, sanitizeArtifactToken} from '../portal/artifact-paths.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {getOrNull, listAllPages} from './liferay-resource-headless-shared.js';

import {textOf} from './liferay-resource-object-diff.js';

export * from './liferay-resource-object-diff.js';

export const OBJECT_ADMIN_BASE = '/o/object-admin/v1.0';

export type ObjectDefinitionPayload = Record<string, unknown> & {
  id?: number;
  externalReferenceCode?: string;
  name?: string;
  status?: {code?: number; label?: string};
  objectFields?: Record<string, unknown>[];
  objectRelationships?: Record<string, unknown>[];
};

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
