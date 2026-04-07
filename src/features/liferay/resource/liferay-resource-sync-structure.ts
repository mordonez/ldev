import fs from 'fs-extra';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {fetchAccessToken, resolveSite} from '../inventory/liferay-inventory-shared.js';
import {resolveStructureFile} from './liferay-resource-paths.js';
import {
  buildTransitionPayload,
  collectFieldReferences,
  extractStructureShapeSignature,
  removeExternalReferenceCode,
  setDifference,
  structureShapeMatches,
} from './liferay-resource-sync-structure-diff.js';
import {
  captureMigrationSourceSnapshots,
  runStructureMigration,
  type MigrationStats,
} from './liferay-resource-sync-structure-migration.js';
import {
  authOptions,
  expectJsonSuccess,
  normalizeMigrationPhase,
  shouldRunPostMigration,
} from './liferay-resource-sync-structure-utils.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
  sleep?: (ms: number) => Promise<void>;
};

export type LiferayResourceSyncStructureResult = {
  status: 'created' | 'updated' | 'checked' | 'checked_missing';
  id: string;
  key: string;
  siteId: number;
  siteFriendlyUrl: string;
  structureFile: string;
  removedFieldReferences: string[];
  recoveredAfterTimeout?: boolean;
  migration?: MigrationStats;
};

export async function runLiferayResourceSyncStructure(
  config: AppConfig,
  options: {
    site?: string;
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
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceSyncStructureResult> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const site = await resolveSite(config, options.site ?? '/global', dependencies);
  const structureFile = await resolveStructureFile(config, options.key, options.file);
  const payload = await fs.readJson(structureFile);
  const existing = await fetchStructureByKey(config, apiClient, accessToken, site.id, options.key);
  const removedFieldReferences = existing
    ? [...setDifference(collectFieldReferences(existing), collectFieldReferences(payload))]
    : [];

  if (removedFieldReferences.length > 0 && !options.migrationPlan && !options.allowBreakingChange) {
    throw new CliError(
      `Blocked change: the structure removes ${removedFieldReferences.length} field(s) ${removedFieldReferences.join(', ')}. Define --migration-plan or use --allow-breaking-change.`,
      {code: 'LIFERAY_RESOURCE_BREAKING_CHANGE'},
    );
  }

  const phase = normalizeMigrationPhase(options.migrationPhase);
  let migration: MigrationStats | undefined;
  const migrationOptions = {
    apiClient,
    tokenClient: dependencies?.tokenClient,
    cleanupSource: Boolean(options.cleanupMigration),
    dryRun: Boolean(options.migrationDryRun),
    fetchStructureByKeyFn: fetchStructureByKey,
  };

  if (!existing) {
    if (!options.createMissing) {
      throw new CliError(`Structure '${options.key}' does not exist and create-missing is not enabled.`, {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }

    if (options.checkOnly) {
      return {
        status: 'checked_missing',
        id: '',
        key: options.key,
        siteId: site.id,
        siteFriendlyUrl: site.friendlyUrlPath,
        structureFile,
        removedFieldReferences,
      };
    }

    if (options.migrationPlan && (phase === 'pre' || phase === 'both')) {
      migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, migrationOptions);
    }

    const createPayload = removeExternalReferenceCode(payload);
    const created = await expectJsonSuccess(
      await apiClient.postJson<Record<string, unknown>>(
        config.liferay.url,
        `/o/data-engine/v2.0/sites/${site.id}/data-definitions/by-content-type/journal`,
        createPayload,
        authOptions(config, accessToken),
      ),
      'structure-create',
    );

    const createdId = String(created.data?.id ?? '');
    if (options.migrationPlan && shouldRunPostMigration(phase)) {
      migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, migrationOptions);
    }

    return {
      status: 'created',
      id: createdId,
      key: options.key,
      siteId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
      structureFile,
      removedFieldReferences,
      ...(migration ? {migration} : {}),
    };
  }

  if (options.checkOnly || options.skipUpdate) {
    if (options.migrationPlan && shouldRunPostMigration(phase)) {
      migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, {
        ...migrationOptions,
        dryRun: true,
      });
    }

    return {
      status: 'checked',
      id: String(existing.id ?? ''),
      key: options.key,
      siteId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
      structureFile,
      removedFieldReferences,
      ...(migration ? {migration} : {}),
    };
  }

  if (options.migrationPlan && (phase === 'pre' || phase === 'both')) {
    migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, migrationOptions);
  }

  const runtimeId = String(existing.id ?? '');
  let updatePayload = payload;
  const autoTransition = options.migrationPlan && phase === 'post' && removedFieldReferences.length > 0;
  if (autoTransition) {
    const sourceSnapshots = await captureMigrationSourceSnapshots(config, runtimeId, site.id, options.migrationPlan!, {
      apiClient,
      tokenClient: dependencies?.tokenClient,
    });
    updatePayload = buildTransitionPayload(existing, payload);
    await expectJsonSuccess(
      await apiClient.putJson<Record<string, unknown>>(
        config.liferay.url,
        `/o/data-engine/v2.0/data-definitions/${runtimeId}`,
        updatePayload,
        authOptions(config, accessToken),
      ),
      'structure-update transition',
    );

    migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan!, {
      ...migrationOptions,
      sourceSnapshots,
    });
  }

  const updated = await updateStructureWithRecovery(
    config,
    apiClient,
    accessToken,
    site.id,
    runtimeId,
    options.key,
    payload,
    dependencies,
  );

  if (options.migrationPlan && shouldRunPostMigration(phase) && !autoTransition) {
    migration = await runStructureMigration(config, options.key, site.id, options.migrationPlan, migrationOptions);
  }

  return {
    status: 'updated',
    id: String(updated.data?.id ?? runtimeId),
    key: options.key,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    structureFile,
    removedFieldReferences,
    ...(updated.recoveredAfterTimeout ? {recoveredAfterTimeout: true} : {}),
    ...(migration ? {migration} : {}),
  };
}

export function formatLiferayResourceSyncStructure(result: LiferayResourceSyncStructureResult): string {
  const lines = [
    `${result.status}\t${result.key}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.structureFile}`,
  ];
  if (result.removedFieldReferences.length > 0) {
    lines.push(`removedFieldReferences=${result.removedFieldReferences.join(',')}`);
  }
  if (result.recoveredAfterTimeout) {
    lines.push('recoveredAfterTimeout=true');
  }
  if (result.migration) {
    lines.push(
      `migration scanned=${result.migration.scanned} migrated=${result.migration.migrated} unchanged=${result.migration.unchanged} failed=${result.migration.failed} dryRun=${result.migration.dryRun}`,
    );
  }
  return lines.join('\n');
}

// --- Persistence ---

async function fetchStructureByKey(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  key: string,
): Promise<Record<string, unknown> | null> {
  const response = await apiClient.get<Record<string, unknown>>(
    config.liferay.url,
    `/o/data-engine/v2.0/sites/${siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(key)}`,
    authOptions(config, accessToken),
  );
  if (response.status === 404) {
    return null;
  }
  const success = await expectJsonSuccess(response, 'resource structure-sync get');
  return success.data;
}

async function updateStructureWithRecovery(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  runtimeId: string,
  key: string,
  payload: Record<string, unknown>,
  dependencies?: ResourceDependencies,
): Promise<{data: Record<string, unknown> | null; recoveredAfterTimeout: boolean}> {
  try {
    const updated = await expectJsonSuccess(
      await apiClient.putJson<Record<string, unknown>>(
        config.liferay.url,
        `/o/data-engine/v2.0/data-definitions/${runtimeId}`,
        payload,
        authOptions(config, accessToken),
      ),
      'structure-update',
    );
    return {data: updated.data ?? null, recoveredAfterTimeout: false};
  } catch (error) {
    if (!isRecoverableTimeoutError(error)) {
      throw error;
    }

    const recovered = await pollStructureUpdateRecovery(
      config,
      apiClient,
      accessToken,
      siteId,
      key,
      payload,
      dependencies?.sleep ?? defaultSleep,
    );

    if (recovered) {
      return {data: recovered, recoveredAfterTimeout: true};
    }

    throw new CliError(
      `structure-update timed out, and ldev could not confirm whether the update eventually applied. Re-run 'ldev resource get-structure --site ${siteId} --key ${key}' or retry the import once the portal is responsive again.`,
      {
        code: 'LIFERAY_RESOURCE_TIMEOUT_RECOVERABLE',
        details: {operation: 'structure-update', key, siteId, recoverable: true},
      },
    );
  }
}

async function pollStructureUpdateRecovery(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  key: string,
  payload: Record<string, unknown>,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<Record<string, unknown> | null> {
  const maxAttempts = 4;
  const retryDelayMs = 1500;
  const expectedShape = extractStructureShapeSignature(payload);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const runtime = await fetchStructureByKey(config, apiClient, accessToken, siteId, key);
    if (runtime && structureShapeMatches(runtime, expectedShape)) {
      return runtime;
    }

    if (attempt < maxAttempts) {
      await sleepImpl(retryDelayMs);
    }
  }

  return null;
}

function isRecoverableTimeoutError(error: unknown): boolean {
  if (!(error instanceof CliError)) {
    return false;
  }

  if (error.code !== 'LIFERAY_HTTP_ERROR') {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('timed out') || message.includes('timeout') || message.includes('aborted');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
