import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import {
  authedGet,
  fetchAccessToken,
  fetchPagedItems,
  normalizeFriendlyUrl,
  normalizeLocalizedName,
} from './liferay-inventory-shared.js';
import {resolveResourceSite} from '../resource/liferay-resource-shared.js';

export type LiferayInventorySite = {
  groupId: number;
  siteFriendlyUrl: string;
  name: string;
  pagesCommand: string;
};

type HeadlessSite = {
  id?: number;
  friendlyUrlPath?: string;
  nameCurrentValue?: string;
  name?: string | Record<string, string>;
};

export async function runLiferayInventorySites(
  config: AppConfig,
  options?: {pageSize?: number},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventorySite[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient;
  const pageSize = options?.pageSize ?? 200;

  let items: HeadlessSite[];
  try {
    items = await fetchPagedItems<HeadlessSite>(config, '/o/headless-admin-site/v1.0/sites', pageSize, {
      apiClient,
      tokenClient,
    });
  } catch (error) {
    items = await fetchSitesViaJsonws(config, apiClient, tokenClient);
    if (items.length === 0) {
      throw error;
    }
  }

  return items.map(normalizeSite);
}

export async function runLiferayInventorySitesIncludingGlobal(
  config: AppConfig,
  options?: {pageSize?: number},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventorySite[]> {
  const sites = await runLiferayInventorySites(config, options, dependencies);
  const byFriendlyUrl = new Map<string, LiferayInventorySite>();

  for (const site of sites) {
    byFriendlyUrl.set(site.siteFriendlyUrl, site);
  }

  if (!byFriendlyUrl.has('/global')) {
    const globalSite = await resolveResourceSite(config, '/global', dependencies);
    byFriendlyUrl.set('/global', {
      groupId: globalSite.id,
      siteFriendlyUrl: globalSite.friendlyUrlPath,
      name: globalSite.name,
      pagesCommand: buildPagesCommand(globalSite.friendlyUrlPath),
    });
  }

  return [...byFriendlyUrl.values()].sort((left, right) => left.siteFriendlyUrl.localeCompare(right.siteFriendlyUrl));
}

export function formatLiferayInventorySites(sites: LiferayInventorySite[]): string {
  if (sites.length === 0) {
    return 'No site data';
  }

  const lines = sites.map(
    (site) => `- id=${site.groupId} site=${site.siteFriendlyUrl} name=${site.name} pages=${site.pagesCommand}`,
  );
  lines.push(`total=${sites.length}`);
  return lines.join('\n');
}

function normalizeSite(row: HeadlessSite): LiferayInventorySite {
  const groupId = row.id ?? -1;
  const siteFriendlyUrl = normalizeFriendlyUrl(row.friendlyUrlPath ?? '');
  const name = row.nameCurrentValue ?? normalizeLocalizedName(row.name);

  return {
    groupId,
    siteFriendlyUrl,
    name,
    pagesCommand: buildPagesCommand(siteFriendlyUrl),
  };
}

function buildPagesCommand(siteFriendlyUrl: string): string {
  return `inventory pages --site ${siteFriendlyUrl}`;
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

async function fetchSitesViaJsonws(
  config: AppConfig,
  apiClient: LiferayApiClient,
  tokenClient?: OAuthTokenClient,
): Promise<HeadlessSite[]> {
  const accessToken = await fetchAccessToken(config, {apiClient, tokenClient});
  const companiesResponse = await authedGet<JsonwsCompany[]>(
    config,
    apiClient,
    accessToken,
    '/api/jsonws/company/get-companies',
  );

  if (!companiesResponse.ok || !Array.isArray(companiesResponse.data)) {
    return [];
  }

  const sites: HeadlessSite[] = [];

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

        sites.push({
          id: item.groupId,
          friendlyUrlPath: item.friendlyURL ?? item.friendlyUrl,
          name: item.nameCurrentValue ?? item.name,
        });
      }
    }
  }

  return sites;
}
