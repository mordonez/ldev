import {CliError} from '../../../cli/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type HttpResponse, type LiferayApiClient} from '../../../core/http/client.js';

export type ResolvedSite = {
  id: number;
  friendlyUrlPath: string;
  name: string;
};

type InventoryDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

type HeadlessPage<T> = {
  items?: T[];
  lastPage?: number;
};

type SiteLookupPayload = {
  id?: number;
  friendlyUrlPath?: string;
  name?: string | Record<string, string>;
};

export async function fetchAccessToken(config: AppConfig, dependencies?: InventoryDependencies): Promise<string> {
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const token = await tokenClient.fetchClientCredentialsToken(config.liferay);
  return token.accessToken;
}

export async function resolveSite(
  config: AppConfig,
  site: string,
  dependencies?: InventoryDependencies,
): Promise<ResolvedSite> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);

  if (/^\d+$/.test(site)) {
    const byIdResponse = await authedGet<SiteLookupPayload>(
      config,
      apiClient,
      accessToken,
      `/o/headless-admin-user/v1.0/sites/${site}`,
    );

    if (byIdResponse.ok) {
      return normalizeResolvedSite(byIdResponse.data, site);
    }
  }

  const normalized = site.startsWith('/') ? site.slice(1) : site;
  const byFriendlyUrlResponse = await authedGet<SiteLookupPayload>(
    config,
    apiClient,
    accessToken,
    `/o/headless-admin-user/v1.0/sites/by-friendly-url-path/${encodeURIComponent(normalized)}`,
  );

  if (byFriendlyUrlResponse.ok) {
    return normalizeResolvedSite(byFriendlyUrlResponse.data, site);
  }

  const cleanInput = normalized.toLowerCase();
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const response = await expectJsonSuccess<HeadlessPage<SiteLookupPayload>>(
      await authedGet(config, apiClient, accessToken, `/o/headless-admin-user/v1.0/sites?pageSize=100&page=${page}`),
      `list sites page=${page}`,
    );

    const payload = response.data ?? {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      const friendlyUrlPath = normalizeFriendlyUrl(item.friendlyUrlPath ?? '');
      const normalizedFriendlyUrl = friendlyUrlPath.startsWith('/') ? friendlyUrlPath.slice(1) : friendlyUrlPath;
      const name = normalizeLocalizedName(item.name).toLowerCase();

      if (
        normalizedFriendlyUrl === cleanInput ||
        normalizedFriendlyUrl.includes(cleanInput) ||
        name.includes(cleanInput)
      ) {
        return normalizeResolvedSite(item, site);
      }
    }

    lastPage = payload.lastPage ?? 1;
    page += 1;
  }

  throw new CliError(`No se pudo resolver el site "${site}".`, {code: 'LIFERAY_SITE_NOT_FOUND'});
}

export async function fetchPagedItems<T>(
  config: AppConfig,
  basePath: string,
  pageSize: number,
  dependencies?: InventoryDependencies,
): Promise<T[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const items: T[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const separator = basePath.includes('?') ? '&' : '?';
    const response = await authedGet<HeadlessPage<T>>(
      config,
      apiClient,
      accessToken,
      `${basePath}${separator}page=${page}&pageSize=${pageSize}`,
    );

    if (response.status === 403) {
      throw new CliError(
        `403 Forbidden en ${basePath} (revisa scopes OAuth2 del bootstrap para Data Engine/Headless Delivery).`,
        {code: 'LIFERAY_INVENTORY_ERROR'},
      );
    }

    const success = await expectJsonSuccess(response, `paged request ${basePath}`);
    const payload = success.data ?? {};
    if (Array.isArray(payload.items)) {
      items.push(...payload.items);
    }
    lastPage = payload.lastPage ?? 1;
    page += 1;
  }

  return items;
}

export async function authedGet<T>(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  path: string,
): Promise<HttpResponse<T>> {
  return apiClient.get<T>(config.liferay.url, path, {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function expectJsonSuccess<T>(response: HttpResponse<T>, label: string): Promise<HttpResponse<T>> {
  if (response.ok) {
    return response;
  }

  throw new CliError(`${label} failed with status=${response.status}.`, {code: 'LIFERAY_INVENTORY_ERROR'});
}

export function normalizeLocalizedName(value: string | Record<string, string> | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const first = Object.values(value).find((item) => item.trim() !== '');
  return first ?? '';
}

export function normalizeFriendlyUrl(value: string): string {
  if (value.trim() === '') {
    return '';
  }

  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeResolvedSite(payload: SiteLookupPayload | null, site: string): ResolvedSite {
  const id = payload?.id ?? -1;
  if (id <= 0) {
    throw new CliError(`Site no encontrado: ${site}.`, {code: 'LIFERAY_SITE_NOT_FOUND'});
  }

  return {
    id,
    friendlyUrlPath: normalizeFriendlyUrl(payload?.friendlyUrlPath ?? ''),
    name: normalizeLocalizedName(payload?.name),
  };
}
