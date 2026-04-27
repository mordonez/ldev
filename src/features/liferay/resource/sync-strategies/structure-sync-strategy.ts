/**
 * Sync strategy for Liferay structures.
 * Implements artifact-specific logic for structure synchronization with multi-phase migration support.
 */

import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import type {Printer} from '../../../../core/output/printer.js';
import {CliError} from '../../../../core/errors.js';
import {createLiferayApiClient} from '../../../../core/http/client.js';
import {isRecord, type JsonRecord} from '../../../../core/utils/json.js';
import {createLiferayGateway, type LiferayGateway} from '../../liferay-gateway.js';
import {LiferayErrors} from '../../errors/index.js';
import type {ResolvedSite} from '../../inventory/liferay-site-resolver.js';
import {resolveStructureFile} from '../liferay-resource-paths.js';
import {
  buildTransitionPayload,
  collectFieldReferences,
  extractStructureShapeSignature,
  removeExternalReferenceCode,
  setDifference,
  type StructureDefinitionPayload,
  structureShapeMatches,
} from '../liferay-resource-sync-structure-diff.js';
import {
  captureMigrationSourceSnapshots,
  runStructureMigration,
  type MigrationStats,
} from '../liferay-resource-sync-structure-migration.js';
import {normalizeMigrationPhase, shouldRunPostMigration} from '../liferay-resource-sync-structure-utils.js';
import {ensureString, type ResourceSyncDependencies} from '../liferay-resource-sync-shared.js';
import type {LocalArtifact, RemoteArtifact, SyncStrategy} from '../sync-engine.js';

type StructureLocalData = {
  filePath: string;
};

type StructureRemoteData = {
  structureId: string;
  runtimeDefinition: StructureDefinitionPayload;
  existingFieldRefs: Set<string>;
  // Populated by upsert:
  removedFieldReferences: string[];
  migration?: MigrationStats;
  recoveredAfterTimeout: boolean;
};

type StructureSyncOptions = {
  key: string;
  file?: string;
  checkOnly?: boolean;
  createMissing?: boolean;
  skipUpdate?: boolean;
  migrationPlan?: string;
  migrationPhase?: string;
  migrationDryRun?: boolean;
  cleanupMigration?: boolean;
  allowBreakingChange?: boolean;
  printer?: Printer;
};

export type StructureResourceDependencies = ResourceSyncDependencies & {
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Structure sync strategy implementation.
 * Handles structure creation, update, and multi-phase migration.
 */
export const structureSyncStrategy: SyncStrategy<StructureLocalData, StructureRemoteData> = {
  async resolveLocal(
    config: AppConfig,
    site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<StructureLocalData> | null> {
    const opts = options as StructureSyncOptions;

    try {
      const filePath = await resolveStructureFile(config, opts.key, opts.file);
      const payload = await readJsonRecord(filePath);
      const normalizedContent = JSON.stringify(payload);

      return {
        id: opts.key,
        normalizedContent,
        contentHash: normalizedContent, // For structures, use content as hash
        data: {filePath},
      };
    } catch (error) {
      if (error instanceof CliError && error.code === 'LIFERAY_RESOURCE_FILE_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  },

  async findRemote(
    config: AppConfig,
    site: ResolvedSite,
    _localArtifact: LocalArtifact<StructureLocalData>,
    options: Record<string, unknown>,
    dependencies?: StructureResourceDependencies,
  ): Promise<RemoteArtifact<StructureRemoteData> | null> {
    const opts = options as StructureSyncOptions;
    const {gateway} = createStructureTransport(config, dependencies);

    const existing = await fetchStructureByKeyViaGateway(gateway, site.id, opts.key);
    if (!existing) {
      return null;
    }

    const existingFieldRefs = collectFieldReferences(existing);

    return {
      id: String((existing.id as string | undefined) ?? ''),
      name: opts.key,
      data: {
        structureId: String((existing.id as string | undefined) ?? ''),
        runtimeDefinition: existing,
        existingFieldRefs,
        removedFieldReferences: [],
        recoveredAfterTimeout: false,
      },
    };
  },

  async upsert(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<StructureLocalData>,
    remoteArtifact: RemoteArtifact<StructureRemoteData> | null,
    options: Record<string, unknown>,
    dependencies?: StructureResourceDependencies,
  ): Promise<RemoteArtifact<StructureRemoteData>> {
    const opts = options as StructureSyncOptions;
    const {gateway} = createStructureTransport(config, dependencies);

    const payload = await readJsonRecord(localArtifact.data.filePath);
    const payloadFieldRefs = collectFieldReferences(payload);
    const removedFieldReferences = remoteArtifact
      ? [...setDifference(remoteArtifact.data.existingFieldRefs, payloadFieldRefs)]
      : [];

    // Breaking-change guard
    if (removedFieldReferences.length > 0 && !opts.migrationPlan && !opts.allowBreakingChange) {
      throw LiferayErrors.resourceBreakingChange(
        `Blocked change: the structure removes ${removedFieldReferences.length} field(s) ${removedFieldReferences.join(', ')}. Define --migration-plan or use --allow-breaking-change.`,
      );
    }

    const phase = normalizeMigrationPhase(opts.migrationPhase);
    let migration: MigrationStats | undefined;
    const migrationOptions = {
      gateway,
      cleanupSource: Boolean(opts.cleanupMigration),
      dryRun: Boolean(opts.migrationDryRun),
      fetchStructureByKeyFn: fetchStructureByKey,
      printer: opts.printer,
    };

    // ---- checkOnly/skipUpdate path ----
    if (opts.checkOnly || opts.skipUpdate) {
      if (opts.migrationPlan && shouldRunPostMigration(phase)) {
        migration = await runStructureMigration(config, opts.key, site.id, opts.migrationPlan, {
          ...migrationOptions,
          dryRun: true,
        });
      }

      return {
        id: remoteArtifact?.id ?? '',
        name: opts.key,
        data: {
          ...remoteArtifact!.data,
          removedFieldReferences,
          migration,
        },
      };
    }

    // ---- Create path (no remote) ----
    if (!remoteArtifact) {
      if (opts.migrationPlan && (phase === 'pre' || phase === 'both')) {
        migration = await runStructureMigration(config, opts.key, site.id, opts.migrationPlan, migrationOptions);
      }

      const createPayload = removeExternalReferenceCode(payload);
      const created = await postJsonAsResource<StructureDefinitionPayload | null>(
        gateway,
        `/o/data-engine/v2.0/sites/${site.id}/data-definitions/by-content-type/journal`,
        createPayload,
        'structure-create',
      );

      const createdId = ensureString(created?.id, 'id');
      if (opts.migrationPlan && shouldRunPostMigration(phase)) {
        migration = await runStructureMigration(config, opts.key, site.id, opts.migrationPlan, migrationOptions);
      }

      return {
        id: createdId,
        name: opts.key,
        data: {
          structureId: createdId,
          runtimeDefinition: created ?? {},
          existingFieldRefs: payloadFieldRefs,
          removedFieldReferences,
          migration,
          recoveredAfterTimeout: false,
        },
      };
    }

    // ---- Update path (remote exists) ----
    if (opts.migrationPlan && (phase === 'pre' || phase === 'both')) {
      migration = await runStructureMigration(config, opts.key, site.id, opts.migrationPlan, migrationOptions);
    }

    const runtimeId = remoteArtifact.data.structureId;
    const autoTransition = opts.migrationPlan && phase === 'post' && removedFieldReferences.length > 0;

    if (autoTransition) {
      const sourceSnapshots = await captureMigrationSourceSnapshots(config, runtimeId, site.id, opts.migrationPlan!, {
        gateway,
      });
      const updatePayload = buildTransitionPayload(remoteArtifact.data.runtimeDefinition, payload);
      await putJsonAsResource<StructureDefinitionPayload>(
        gateway,
        `/o/data-engine/v2.0/data-definitions/${runtimeId}`,
        updatePayload,
        'structure-update transition',
      );

      migration = await runStructureMigration(config, opts.key, site.id, opts.migrationPlan!, {
        ...migrationOptions,
        sourceSnapshots,
      });
    }

    const updated = await updateStructureWithRecovery(
      gateway,
      site.id,
      site.friendlyUrlPath,
      runtimeId,
      opts.key,
      payload,
      remoteArtifact.data.runtimeDefinition,
      dependencies,
    );
    const recoveredAfterTimeout = updated.recoveredAfterTimeout;

    if (opts.migrationPlan && shouldRunPostMigration(phase) && !autoTransition) {
      migration = await runStructureMigration(config, opts.key, site.id, opts.migrationPlan, migrationOptions);
    }

    const updatedData = isRecord(updated.data) ? updated.data : null;
    const structureId = ensureString(updatedData?.id ?? runtimeId, 'structureId');

    return {
      id: structureId,
      name: opts.key,
      data: {
        structureId,
        runtimeDefinition: updatedData ?? remoteArtifact.data.runtimeDefinition,
        existingFieldRefs: payloadFieldRefs,
        removedFieldReferences,
        migration,
        recoveredAfterTimeout,
      },
    };
  },

  async verify(
    _config: AppConfig,
    _site: ResolvedSite,
    _localArtifact: LocalArtifact<StructureLocalData>,
    _remoteArtifact: RemoteArtifact<StructureRemoteData>,
    _dependencies?: StructureResourceDependencies,
  ): Promise<void> {
    // No-op: structure shape is verified during timeout recovery in updateStructureWithRecovery
  },
};

// ---- Private Helpers ----

function createStructureTransport(config: AppConfig, dependencies?: StructureResourceDependencies) {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient;

  return {
    apiClient,
    tokenClient,
    gateway: createLiferayGateway(config, apiClient, tokenClient),
  };
}

async function readJsonRecord(filePath: string): Promise<JsonRecord> {
  const payload: unknown = await fs.readJson(filePath);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw LiferayErrors.resourceError(`Structure JSON must be an object: ${filePath}`);
  }
  return payload as JsonRecord;
}

async function fetchStructureByKeyViaGateway(
  gateway: LiferayGateway,
  siteId: number,
  key: string,
): Promise<StructureDefinitionPayload | null> {
  try {
    return await gateway.getJson<StructureDefinitionPayload>(
      `/o/data-engine/v2.0/sites/${siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(key)}`,
      'resource structure-sync get',
    );
  } catch (error) {
    if (isGatewayStatus(error, 404)) {
      return null;
    }

    rethrowGatewayAsResourceError(error);
  }
}

async function fetchStructureByKey(
  _config: AppConfig,
  gateway: LiferayGateway,
  siteId: number,
  key: string,
): Promise<StructureDefinitionPayload | null> {
  return fetchStructureByKeyViaGateway(gateway, siteId, key);
}

async function postJsonAsResource<T>(
  gateway: LiferayGateway,
  path: string,
  payload: unknown,
  label: string,
): Promise<T> {
  try {
    return await gateway.postJson<T>(path, payload, label);
  } catch (error) {
    rethrowGatewayAsResourceError(error);
  }
}

async function putJsonAsResource<T>(
  gateway: LiferayGateway,
  path: string,
  payload: unknown,
  label: string,
): Promise<T> {
  try {
    return await gateway.putJson<T>(path, payload, label);
  } catch (error) {
    rethrowGatewayAsResourceError(error);
  }
}

async function updateStructureWithRecovery(
  gateway: LiferayGateway,
  siteId: number,
  siteFriendlyUrl: string,
  runtimeId: string,
  key: string,
  payload: StructureDefinitionPayload,
  previousRuntimeDefinition: StructureDefinitionPayload,
  dependencies?: StructureResourceDependencies,
): Promise<{data: StructureDefinitionPayload | null; recoveredAfterTimeout: boolean}> {
  try {
    const updated = await putJsonAsResource<StructureDefinitionPayload | null>(
      gateway,
      `/o/data-engine/v2.0/data-definitions/${runtimeId}`,
      payload,
      'structure-update',
    );
    return {data: updated ?? null, recoveredAfterTimeout: false};
  } catch (error) {
    if (!isRecoverableTimeoutError(error)) {
      throw error;
    }

    const recovered = await pollStructureUpdateRecovery(
      gateway,
      siteId,
      key,
      payload,
      previousRuntimeDefinition,
      dependencies?.sleep ?? defaultSleep,
    );

    if (recovered) {
      return {data: recovered, recoveredAfterTimeout: true};
    }

    throw LiferayErrors.resourceTimeoutRecoverable(
      `structure-update timed out, and ldev could not confirm whether the update eventually applied. Re-run 'ldev resource structure --site ${siteFriendlyUrl} --structure ${key}' or retry the import once the portal is responsive again.`,
      {details: {operation: 'structure-update', key, siteId, recoverable: true}},
    );
  }
}

async function pollStructureUpdateRecovery(
  gateway: LiferayGateway,
  siteId: number,
  key: string,
  payload: StructureDefinitionPayload,
  previousRuntimeDefinition: StructureDefinitionPayload,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<StructureDefinitionPayload | null> {
  const maxAttempts = 4;
  const retryDelayMs = 1500;
  const expectedShape = extractStructureShapeSignature(payload);
  const previousShape = extractStructureShapeSignature(previousRuntimeDefinition);

  // If expected and previous signatures are identical, shape-based polling cannot
  // prove that the timed-out update was applied; fail closed as recoverable timeout.
  if (expectedShape === previousShape) {
    return null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const runtime = await fetchStructureByKeyViaGateway(gateway, siteId, key);
    if (runtime && structureShapeMatches(runtime, expectedShape)) {
      return runtime;
    }

    if (attempt < maxAttempts) {
      await sleepImpl(retryDelayMs);
    }
  }

  return null;
}

function isGatewayStatus(error: unknown, status: number): boolean {
  return (
    error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR' && error.message.includes(`status=${status}`)
  );
}

function rethrowGatewayAsResourceError(error: unknown): never {
  if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR') {
    throw LiferayErrors.resourceError(error.message);
  }

  throw error;
}

function isRecoverableTimeoutError(error: unknown): boolean {
  if (!(error instanceof CliError)) {
    return false;
  }

  if (error.code !== 'HTTP_ERROR') {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('timed out') || message.includes('timeout') || message.includes('aborted');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
