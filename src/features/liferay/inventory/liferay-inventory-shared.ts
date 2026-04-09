import {CliError} from '../../../core/errors.js';
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
  accessToken?: string;
  forceRefresh?: boolean;
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

const accessTokenCache = new Map<string, string>();

export async function fetchAccessToken(config: AppConfig, dependencies?: InventoryDependencies): Promise<string> {
  if (dependencies?.accessToken) {
    return dependencies.accessToken;
  }

  const cacheKey = [
    config.liferay.url,
    config.liferay.oauth2ClientId,
    config.liferay.oauth2ClientSecret,
    config.liferay.scopeAliases,
  ].join('|');
  const cached = accessTokenCache.get(cacheKey);
  if (cached && !dependencies?.forceRefresh) {
    return cached;
  }

  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const token = await tokenClient.fetchClientCredentialsToken(config.liferay);
  accessTokenCache.set(cacheKey, token.accessToken);
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
      `/o/headless-admin-site/v1.0/sites/${site}`,
    );

    if (byIdResponse.ok) {
      return normalizeResolvedSite(byIdResponse.data, site);
    }
  }

  const normalized = site.startsWith('/') ? site.slice(1) : site;
  const exactFriendlyUrlRequested = site.trim().startsWith('/');
  const byFriendlyUrlResponse = await authedGet<SiteLookupPayload>(
    config,
    apiClient,
    accessToken,
    `/o/headless-admin-site/v1.0/sites/by-friendly-url-path/${encodeURIComponent(normalized)}`,
  );

  if (byFriendlyUrlResponse.ok) {
    return normalizeResolvedSite(byFriendlyUrlResponse.data, site);
  }

  // headless-admin-site does not expose company groups (e.g. /global, site=false in Liferay).
  // Fall back to headless-admin-user which does return them.
  const byFriendlyUrlUserResponse = await authedGet<SiteLookupPayload>(
    config,
    apiClient,
    accessToken,
    `/o/headless-admin-user/v1.0/sites/by-friendly-url-path/${encodeURIComponent(normalized)}`,
  );

  if (byFriendlyUrlUserResponse.ok) {
    return normalizeResolvedSite(byFriendlyUrlUserResponse.data, site);
  }

  const cleanInput = normalized.toLowerCase();
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const pageResponse = await authedGet<HeadlessPage<SiteLookupPayload>>(
      config,
      apiClient,
      accessToken,
      `/o/headless-admin-site/v1.0/sites?pageSize=100&page=${page}`,
    );

    if (pageResponse.status === 403 || pageResponse.status === 404) {
      break;
    }

    const response = await expectJsonSuccess(pageResponse, `list sites page=${page}`);

    const payload = response.data ?? {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      const friendlyUrlPath = normalizeFriendlyUrl(item.friendlyUrlPath ?? '');
      const normalizedFriendlyUrl = friendlyUrlPath.startsWith('/') ? friendlyUrlPath.slice(1) : friendlyUrlPath;
      const name = normalizeLocalizedName(item.name).toLowerCase();

      if (
        normalizedFriendlyUrl === cleanInput ||
        (!exactFriendlyUrlRequested && (normalizedFriendlyUrl.includes(cleanInput) || name.includes(cleanInput)))
      ) {
        return normalizeResolvedSite(item, site);
      }
    }

    lastPage = payload.lastPage ?? 1;
    page += 1;
  }

  const jsonwsFallback = await resolveSiteViaJsonws(config, apiClient, accessToken, site);

  if (jsonwsFallback) {
    return jsonwsFallback;
  }

  throw new CliError(`Could not resolve site "${site}".`, {code: 'LIFERAY_SITE_NOT_FOUND'});
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
        `403 Forbidden on ${basePath} (check the bootstrap OAuth2 scopes for Data Engine/Headless Delivery).`,
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
    throw new CliError(`Site not found: ${site}.`, {code: 'LIFERAY_SITE_NOT_FOUND'});
  }

  return {
    id,
    friendlyUrlPath: normalizeFriendlyUrl(payload?.friendlyUrlPath ?? ''),
    name: normalizeLocalizedName(payload?.name),
  };
}

type JsonwsCompany = {
  companyId?: number;
};

type JsonwsGroup = {
  groupId?: number;
  friendlyURL?: string;
  friendlyUrl?: string;
  nameCurrentValue?: string;
  name?: string;
  site?: boolean;
};

async function resolveSiteViaJsonws(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  site: string,
): Promise<ResolvedSite | null> {
  const companiesResponse = await authedGet<JsonwsCompany[]>(
    config,
    apiClient,
    accessToken,
    '/api/jsonws/company/get-companies',
  );

  if (!companiesResponse.ok || !Array.isArray(companiesResponse.data)) {
    return null;
  }

  const cleanInput = (site.startsWith('/') ? site.slice(1) : site).toLowerCase();
  const exactFriendlyUrlRequested = site.trim().startsWith('/');

  for (const company of companiesResponse.data) {
    const companyId = company.companyId ?? 0;
    if (companyId <= 0) {
      continue;
    }

    const countResponse = await apiClient.get<string>(
      config.liferay.url,
      `/api/jsonws/group/search-count?companyId=${companyId}&name=&description=&params=%7B%7D`,
      {
        timeoutSeconds: config.liferay.timeoutSeconds,
        headers: {Authorization: `Bearer ${accessToken}`},
      },
    );

    if (!countResponse.ok) {
      continue;
    }

    const total = Number.parseInt(countResponse.body.trim().replace(/^"(.*)"$/, '$1'), 10);
    if (!Number.isFinite(total) || total <= 0) {
      continue;
    }

    for (let start = 0; start < total; start += 100) {
      const end = start + 100;
      const response = await authedGet<JsonwsGroup[]>(
        config,
        apiClient,
        accessToken,
        '/api/jsonws/group/search' +
          `?companyId=${companyId}` +
          '&name=' +
          '&description=' +
          '&params=%7B%7D' +
          `&start=${start}` +
          `&end=${end}`,
      );

      if (!response.ok || !Array.isArray(response.data)) {
        continue;
      }

      for (const item of response.data) {
        if (!item.site) {
          continue;
        }

        const friendlyUrlPath = normalizeFriendlyUrl(item.friendlyURL ?? item.friendlyUrl ?? '');
        const normalizedFriendlyUrl = friendlyUrlPath.startsWith('/') ? friendlyUrlPath.slice(1) : friendlyUrlPath;
        const name = normalizeLocalizedName(item.nameCurrentValue ?? item.name).toLowerCase();

        if (
          normalizedFriendlyUrl === cleanInput ||
          (!exactFriendlyUrlRequested && (normalizedFriendlyUrl.includes(cleanInput) || name.includes(cleanInput)))
        ) {
          return {
            id: item.groupId ?? -1,
            friendlyUrlPath,
            name: normalizeLocalizedName(item.nameCurrentValue ?? item.name),
          };
        }
      }
    }
  }

  return null;
}
