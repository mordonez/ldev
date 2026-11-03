/**
 * HTTP transport for structure import: lookup by key, create/update through the gateway,
 * and recovery when a large structure update times out but is persisted by the portal.
 */

import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {CliError} from '../../../../core/errors.js';
import {createLiferayApiClient} from '../../../../core/http/client.js';
import type {JsonRecord} from '../../../../core/utils/json.js';
import {createLiferayGateway, type LiferayGateway} from '../../liferay-gateway.js';
import {LiferayErrors} from '../../errors/index.js';
import {
  extractStructureShapeSignature,
  type StructureDefinitionPayload,
  structureShapeMatches,
} from '../liferay-resource-import-structure-diff.js';
import {isGatewayStatus, rethrowGatewayAsResourceError} from './shared.js';
import type {StructureResourceDependencies} from './structure-import-strategy.js';

export function createStructureTransport(config: AppConfig, dependencies?: StructureResourceDependencies) {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient;

  return {
    apiClient,
    tokenClient,
    gateway: createLiferayGateway(config, apiClient, tokenClient),
  };
}

export async function readJsonRecord(filePath: string): Promise<JsonRecord> {
  const payload: unknown = await fs.readJson(filePath);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw LiferayErrors.resourceError(`Structure JSON must be an object: ${filePath}`);
  }
  return payload as JsonRecord;
}

export async function fetchStructureByKeyViaGateway(
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

export async function fetchStructureByKey(
  _config: AppConfig,
  gateway: LiferayGateway,
  siteId: number,
  key: string,
): Promise<StructureDefinitionPayload | null> {
  return fetchStructureByKeyViaGateway(gateway, siteId, key);
}

export async function postJsonAsResource<T>(
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

export async function putJsonAsResource<T>(
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

export async function updateStructureWithRecovery(
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
  const maxAttempts = 20;
  const retryDelayMs = 3000;
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
