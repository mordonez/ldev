import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {LiferayApiClient} from '../../core/liferay/client.js';
import {createLiferayApiClient} from '../../core/liferay/client.js';
import type {OAuthTokenClient} from '../../core/liferay/auth.js';
import {authedGet, fetchAccessToken, normalizeFriendlyUrl} from './liferay-inventory-shared.js';
import {resolveResourceSite} from './liferay-resource-shared.js';

export type LiferayInventorySite = {
  groupId: number;
  siteFriendlyUrl: string;
  name: string;
  pagesCommand: string;
};

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

export async function runLiferayInventorySites(
  config: AppConfig,
  options?: {pageSize?: number},
  dependencies?: {apiClient?: LiferayApiClient; tokenClient?: OAuthTokenClient},
): Promise<LiferayInventorySite[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const pageSize = options?.pageSize ?? 200;

  const companiesResponse = await authedGet<JsonwsCompany[]>(
    config,
    apiClient,
    accessToken,
    '/api/jsonws/company/get-companies',
  );

  if (!companiesResponse.ok || !Array.isArray(companiesResponse.data)) {
    throw new CliError(`company/get-companies failed with status=${companiesResponse.status}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const sites: LiferayInventorySite[] = [];
  for (const company of companiesResponse.data) {
    const companyId = company.companyId ?? 0;
    if (companyId <= 0) {
      continue;
    }

    const total = await fetchSearchCount(config, apiClient, accessToken, companyId);
    for (let start = 0; start < total; start += pageSize) {
      const end = start + pageSize;
      const path =
        '/api/jsonws/group/search' +
        `?companyId=${companyId}` +
        '&name=' +
        '&description=' +
        '&params=%7B%7D' +
        `&start=${start}` +
        `&end=${end}`;

      const response = await authedGet<JsonwsGroup[]>(config, apiClient, accessToken, path);

      if (!response.ok || !Array.isArray(response.data)) {
        throw new CliError(`group/search failed with status=${response.status}.`, {
          code: 'LIFERAY_INVENTORY_ERROR',
        });
      }

      for (const row of response.data) {
        if (!row.site) {
          continue;
        }
        sites.push(normalizeSite(row));
      }
    }
  }

  return sites;
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
    return 'Sin datos de sites';
  }

  const lines = sites.map(
    (site) => `- id=${site.groupId} site=${site.siteFriendlyUrl} name=${site.name} pages=${site.pagesCommand}`,
  );
  lines.push(`total=${sites.length}`);
  return lines.join('\n');
}

async function fetchSearchCount(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  companyId: number,
): Promise<number> {
  const response = await apiClient.get<string>(
    config.liferay.url,
    `/api/jsonws/group/search-count?companyId=${companyId}&name=&description=&params=%7B%7D`,
    {
      timeoutSeconds: config.liferay.timeoutSeconds,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new CliError(`group/search-count failed with status=${response.status}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const rawValue = response.body.trim().replace(/^"(.*)"$/, '$1');
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliError(`group/search-count returned an invalid payload: ${response.body}`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  return parsed;
}

function normalizeSite(row: JsonwsGroup): LiferayInventorySite {
  const groupId = row.groupId ?? -1;
  const siteFriendlyUrl = normalizeFriendlyUrl(row.friendlyURL ?? row.friendlyUrl ?? '');
  const name = row.nameCurrentValue ?? row.name ?? '';

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
