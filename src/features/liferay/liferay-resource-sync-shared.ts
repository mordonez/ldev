import {createHash} from 'node:crypto';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import type {LiferayApiClient} from '../../core/http/client.js';
import {createLiferayApiClient, type HttpResponse} from '../../core/http/client.js';
import {expectJsonSuccess, fetchAccessToken} from './liferay-inventory-shared.js';

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

  return apiClient.postForm<T>(config.liferay.url, path, form, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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

  return apiClient.postMultipart<T>(config.liferay.url, path, form, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function authedGetJson<T>(
  config: AppConfig,
  path: string,
  label: string,
  dependencies?: ResourceDependencies,
): Promise<T> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const response = await apiClient.get<T>(config.liferay.url, path, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const success = await expectJsonSuccess(response, label);
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
  const response = await apiClient.putJson<T>(config.liferay.url, path, payload, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const success = await expectJsonSuccess(response, label);
  return (success.data ?? null) as T;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function localizedMap(text: string): string {
  return JSON.stringify({
    ca_ES: text,
    es_ES: text,
    en_US: text,
  });
}

export function normalizeSyncStatus(checkOnly: boolean): 'checked' | 'updated' {
  return checkOnly ? 'checked' : 'updated';
}

export function ensureString(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim();
  if (normalized === '') {
    throw new CliError(`${label} vacio`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }
  return normalized;
}
