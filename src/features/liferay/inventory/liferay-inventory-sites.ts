import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import {createOAuthTokenClient} from '../../../core/http/auth.js';
import {LiferayErrors} from '../errors/index.js';
import {fetchPagedItems, normalizeFriendlyUrl, normalizeLocalizedName} from './liferay-inventory-shared.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {getOperationPolicy} from './capabilities.js';
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
  dependencies?: {apiClient?: HttpApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventorySite[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const pageSize = options?.pageSize ?? 200;
  const policy = getOperationPolicy('inventory.listSites');
  const gateway = createLiferayGateway(config, apiClient, tokenClient);

  let lastError: unknown;
  let sawEmptyHeadlessResponse = false;

  for (const surface of policy.surfaces) {
    if (surface === 'headless-admin-site') {
      try {
        const items = await fetchPagedItems<HeadlessSite>(config, '/o/headless-admin-site/v1.0/sites', pageSize, {
          apiClient,
          tokenClient,
        });
        if (items.length > 0) {
          return items.map(normalizeSite);
        }
        sawEmptyHeadlessResponse = true;
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    if (surface === 'jsonws') {
      try {
        const items = await fetchSitesViaJsonws(gateway);
        if (items.length > 0) {
          return items.map(normalizeSite);
        }
      } catch {
        // JSONWS unavailable; preserve lastError from headless
      }
    }
  }

  if (sawEmptyHeadlessResponse) {
    return [];
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw LiferayErrors.inventoryError('Could not list sites.');
}

export async function runLiferayInventorySitesIncludingGlobal(
  config: AppConfig,
  options?: {pageSize?: number},
  dependencies?: {apiClient?: HttpApiClient; tokenClient?: OAuthTokenClient},
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

async function fetchSitesViaJsonws(gateway: LiferayGateway): Promise<HeadlessSite[]> {
  type JsonwsCompany = {companyId?: number};
  type JsonwsGroupSearchResult = {
    groupId?: number;
    friendlyURL?: string;
    friendlyUrl?: string;
    nameCurrentValue?: string;
    name?: string;
    site?: boolean;
  };

  let companies: JsonwsCompany[];
  try {
    companies = await gateway.getJson<JsonwsCompany[]>('/api/jsonws/company/get-companies', 'list-jsonws-companies');
  } catch {
    return [];
  }

  if (!Array.isArray(companies)) {
    return [];
  }

  const sites: HeadlessSite[] = [];

  for (const company of companies) {
    const companyId = company.companyId ?? 0;
    if (companyId <= 0) {
      continue;
    }

    let total: number;
    try {
      const totalStr = await gateway.getJson<string>(
        `/api/jsonws/group/search-count?companyId=${companyId}&name=&description=&params=%7B%7D`,
        'count-jsonws-groups',
      );
      total = Number.parseInt(totalStr, 10);
    } catch {
      continue;
    }

    if (!Number.isFinite(total) || total <= 0) {
      continue;
    }

    for (let start = 0; start < total; start += 100) {
      const end = start + 100;
      let groups: JsonwsGroupSearchResult[];

      try {
        groups = await gateway.getJson<JsonwsGroupSearchResult[]>(
          '/api/jsonws/group/search' +
            `?companyId=${companyId}` +
            '&name=' +
            '&description=' +
            '&params=%7B%7D' +
            `&start=${start}` +
            `&end=${end}`,
          'search-jsonws-groups',
        );
      } catch {
        continue;
      }

      if (!Array.isArray(groups)) {
        continue;
      }

      for (const item of groups) {
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
