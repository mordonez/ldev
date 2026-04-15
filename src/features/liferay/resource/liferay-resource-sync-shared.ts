import {createHash} from 'node:crypto';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient, type HttpResponse} from '../../../core/http/client.js';
import {buildAuthOptions, ensureData, expectJsonSuccess} from '../liferay-http-shared.js';
import {fetchAccessToken} from '../inventory/liferay-inventory-shared.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type ResourceSyncDependencies = ResourceDependencies;

export type ResourceSyncResult = {
  status: 'created' | 'updated' | 'checked' | 'checked_missing';
  id: string;
  name: string;
  extra: string;
};

export async function authedPostForm<T>(
  config: AppConfig,
  path: string,
  form: Record<string, string>,
  dependencies?: ResourceDependencies,
): Promise<HttpResponse<T>> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);

  return apiClient.postForm<T>(config.liferay.url, path, form, buildAuthOptions(config, accessToken));
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
    const response = await authedPostForm<T>(config, apiPath, form, dependencies);
    if (response.ok) {
      return ensureData(response.data, `${operation} invalid JSON in ${apiPath}`, 'LIFERAY_RESOURCE_ERROR');
    }
    errors.push(`status=${response.status} body=${response.body}`);
  }

  throw new CliError(`${operation} failed on ${apiPath} (${errors.join(' | ')})`, {
    code: 'LIFERAY_RESOURCE_ERROR',
  });
}

export async function authedPostMultipart<T>(
  config: AppConfig,
  path: string,
  form: FormData,
  dependencies?: ResourceDependencies,
): Promise<HttpResponse<T>> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);

  return apiClient.postMultipart<T>(config.liferay.url, path, form, buildAuthOptions(config, accessToken));
}

export async function authedGetJson<T>(
  config: AppConfig,
  path: string,
  label: string,
  dependencies?: ResourceDependencies,
): Promise<T> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const response = await apiClient.get<T>(config.liferay.url, path, buildAuthOptions(config, accessToken));
  const success = await expectJsonSuccess(response, label, 'LIFERAY_RESOURCE_ERROR');
  return (success.data ?? null) as T;
}

export async function authedPutJson<T>(
  config: AppConfig,
  path: string,
  payload: unknown,
  label: string,
  dependencies?: ResourceDependencies,
): Promise<T> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const response = await apiClient.putJson<T>(config.liferay.url, path, payload, buildAuthOptions(config, accessToken));
  const success = await expectJsonSuccess(response, label, 'LIFERAY_RESOURCE_ERROR');
  return (success.data ?? null) as T;
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
    throw new CliError(`${label} is empty`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }
  return normalized;
}
