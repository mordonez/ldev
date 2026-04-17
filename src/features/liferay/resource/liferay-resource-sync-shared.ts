import {createHash} from 'node:crypto';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import type {HttpResponse} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import {ensureData} from '../liferay-http-shared.js';

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type ResourceSyncDependencies = ResourceDependencies;

export type ResourceSyncResult = {
  status: 'created' | 'updated' | 'checked' | 'checked_missing';
  id: string;
  name: string;
  extra: string;
};

async function postFormCandidateResponse<T>(
  config: AppConfig,
  path: string,
  form: Record<string, string>,
  dependencies?: ResourceDependencies,
): Promise<HttpResponse<T>> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  return gateway.postFormRaw<T>(path, form);
}

export async function postFormCandidates<T>(
  config: AppConfig,
  apiPath: string,
  candidates: Record<string, string>[],
  operation: string,
  dependencies?: ResourceDependencies,
): Promise<T> {
  const errors: string[] = [];

  for (const form of candidates) {
    const response = await postFormCandidateResponse<T>(config, apiPath, form, dependencies);
    if (response.ok) {
      return ensureData(response.data, `${operation} invalid JSON in ${apiPath}`, 'LIFERAY_RESOURCE_ERROR');
    }
    errors.push(`status=${response.status} body=${response.body}`);
  }

  throw LiferayErrors.resourceError(`${operation} failed on ${apiPath} (${errors.join(' | ')})`);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Typed representation of a Liferay localized map.
 * Use makeLocalizedMap to build instances and localizedMap to serialize at the JSONWS border.
 */
export type LocalizedMap = {
  ca_ES: string;
  es_ES: string;
  en_US: string;
};

/**
 * Creates a typed LocalizedMap with the default portal locales (ca_ES, es_ES, en_US).
 * Serialize with localizedMap() only at the JSONWS form border.
 */
export function makeLocalizedMap(text: string): LocalizedMap {
  return {ca_ES: text, es_ES: text, en_US: text};
}

/** Serializes a LocalizedMap to a JSON string for JSONWS form payloads. */
export function serializeLocalizedMap(map: LocalizedMap): string {
  return JSON.stringify(map);
}

/** Backward-compatible wrapper: builds and immediately serializes a localized map. */
export function localizedMap(text: string): string {
  return serializeLocalizedMap(makeLocalizedMap(text));
}

export function normalizeSyncStatus(checkOnly: boolean): 'checked' | 'updated' {
  return checkOnly ? 'checked' : 'updated';
}

export function ensureString(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim();
  if (normalized === '') {
    throw LiferayErrors.resourceError(`${label} is empty`);
  }
  return normalized;
}
