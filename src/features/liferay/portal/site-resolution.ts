import type {AppConfig} from '../../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type HttpApiClient} from '../../../core/http/client.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {LookupCache} from '../lookup-cache.js';
import {LiferayErrors} from '../errors/index.js';
import {
  SiteResolutionPipeline,
  createByIdStep,
  createByFriendlyUrlHeadlessSiteStep,
  createByFriendlyUrlHeadlessUserStep,
  createPaginatedSearchStep,
  createJsonwsFallbackStep,
  type ResolvedSite,
  type SiteLookupPayload,
} from './site-resolver.js';

export type {ResolvedSite};

export type SiteResolutionDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
  gateway?: LiferayGateway;
  accessToken?: string;
  forceRefresh?: boolean;
};

export type GroupInfo = {
  friendlyUrl: string;
  name: string;
  parentGroupId: number;
  companyId?: number;
};

export type SiteChainEntry = {
  siteId: number;
  siteFriendlyUrl: string;
  siteName: string;
};

// Site resolution is expensive (multi-step pipeline); 5-min TTL avoids repeated lookups.
export const resolvedSiteCache = new LookupCache<ResolvedSite>();

export function normalizeFriendlyUrl(value: string): string {
  if (value.trim() === '') {
    return '';
  }

  return value.startsWith('/') ? value : `/${value}`;
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

function normalizeResolvedSite(payload: SiteLookupPayload | null, site: string): ResolvedSite {
  const id = payload?.id ?? -1;
  if (id <= 0) {
    throw LiferayErrors.siteNotFound(site);
  }

  return {
    id,
    friendlyUrlPath: normalizeFriendlyUrl(payload?.friendlyUrlPath ?? ''),
    name: normalizeLocalizedName(payload?.name),
  };
}

function createSiteResolutionGateway(
  config: AppConfig,
  apiClient: HttpApiClient,
  dependencies?: SiteResolutionDependencies,
): LiferayGateway {
  if (dependencies?.gateway) {
    return dependencies.gateway;
  }

  if (dependencies?.accessToken) {
    const fixedTokenClient: OAuthTokenClient = {
      fetchClientCredentialsToken: () =>
        Promise.resolve({accessToken: dependencies.accessToken!, tokenType: 'Bearer' as const, expiresIn: 3600}),
    };

    return createLiferayGateway(config, apiClient, fixedTokenClient);
  }

  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  return createLiferayGateway(config, apiClient, tokenClient);
}

export async function resolveSite(
  config: AppConfig,
  site: string,
  dependencies?: SiteResolutionDependencies,
): Promise<ResolvedSite> {
  const cacheKey = [config.liferay.url, config.liferay.oauth2ClientId, config.liferay.scopeAliases, site].join('|');
  const cached = resolvedSiteCache.get(cacheKey, dependencies?.forceRefresh);
  if (cached) return cached;

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createSiteResolutionGateway(config, apiClient, dependencies);

  const pipeline = new SiteResolutionPipeline();

  pipeline
    .addStep('by-id', createByIdStep(gateway, normalizeResolvedSite))
    .addStep('by-friendly-url-headless-site', createByFriendlyUrlHeadlessSiteStep(gateway, normalizeResolvedSite))
    .addStep('by-friendly-url-headless-user', createByFriendlyUrlHeadlessUserStep(gateway, normalizeResolvedSite))
    .addStep(
      'paginated-search',
      createPaginatedSearchStep(gateway, normalizeResolvedSite, normalizeFriendlyUrl, normalizeLocalizedName),
    )
    .addStep(
      'jsonws-fallback',
      createJsonwsFallbackStep(gateway, normalizeResolvedSite, normalizeFriendlyUrl, normalizeLocalizedName),
    );

  const result = await pipeline.execute(site);
  resolvedSiteCache.set(cacheKey, result);
  return result;
}

/**
 * Enriches a resolved site with its Liferay companyId.
 * Requires an extra JSONWS call — only call this when companyId is actually needed
 * (e.g., resource sync strategies that walk the parent group hierarchy).
 */
export async function enrichWithCompanyId(
  site: ResolvedSite,
  config: AppConfig,
  dependencies?: SiteResolutionDependencies,
): Promise<ResolvedSite & {companyId: number}> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createSiteResolutionGateway(config, apiClient, dependencies);
  const companyId = await resolveCompanyId(gateway, site.id);

  if (companyId <= 0) {
    throw LiferayErrors.resourceError(`site sin companyId valido: ${site.friendlyUrlPath}`);
  }

  return {...site, companyId};
}

/**
 * Builds the full site chain from a starting site up through its parent groups,
 * always appending /global at the end when accessible.
 * Used for artifact fallback lookups across the site hierarchy.
 */
export async function buildSiteChain(
  config: AppConfig,
  startSite: string,
  dependencies?: SiteResolutionDependencies,
): Promise<SiteChainEntry[]> {
  const chain: SiteChainEntry[] = [];
  const visited = new Set<number>();

  const firstSite = await resolveSite(config, startSite, dependencies);
  chain.push({siteId: firstSite.id, siteFriendlyUrl: firstSite.friendlyUrlPath, siteName: firstSite.name});
  visited.add(firstSite.id);

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createSiteResolutionGateway(config, apiClient, dependencies);

  let currentGroupInfo = await fetchGroupInfo(gateway, firstSite.id);

  while (currentGroupInfo && currentGroupInfo.parentGroupId > 0 && !visited.has(currentGroupInfo.parentGroupId)) {
    const parentId = currentGroupInfo.parentGroupId;
    const parentGroupInfo = await fetchGroupInfo(gateway, parentId);
    if (!parentGroupInfo) {
      break;
    }

    visited.add(parentId);
    chain.push({
      siteId: parentId,
      siteFriendlyUrl: parentGroupInfo.friendlyUrl,
      siteName: parentGroupInfo.name,
    });
    currentGroupInfo = parentGroupInfo;
  }

  try {
    const globalSite = await resolveSite(config, '/global', dependencies);
    if (!visited.has(globalSite.id)) {
      chain.push({siteId: globalSite.id, siteFriendlyUrl: globalSite.friendlyUrlPath, siteName: globalSite.name});
    }
  } catch {
    // /global is not available on every permission set.
  }

  return chain;
}

export async function fetchGroupInfo(gateway: LiferayGateway, groupId: number): Promise<GroupInfo | null> {
  const response = await gateway.getRaw<{
    friendlyURL?: string;
    friendlyUrl?: string;
    nameCurrentValue?: string;
    name?: string;
    parentGroupId?: number;
    companyId?: number;
  }>(`/api/jsonws/group/get-group?groupId=${groupId}`);

  if (!response.ok || !response.data) {
    return null;
  }

  const data = response.data;
  const rawFriendlyUrl = data.friendlyURL ?? data.friendlyUrl ?? '';
  if (!rawFriendlyUrl) {
    return null;
  }

  return {
    friendlyUrl: rawFriendlyUrl.startsWith('/') ? rawFriendlyUrl : `/${rawFriendlyUrl}`,
    name: data.nameCurrentValue ?? data.name ?? '',
    parentGroupId: data.parentGroupId ?? -1,
    companyId: data.companyId,
  };
}

async function resolveCompanyId(gateway: LiferayGateway, siteId: number): Promise<number> {
  type GroupPayload = {companyId?: number};

  const groupResponse = await gateway.getRaw<GroupPayload>(`/api/jsonws/group/get-group?groupId=${siteId}`);

  if (groupResponse.ok) {
    const companyId = groupResponse.data?.companyId ?? -1;
    if (companyId > 0) {
      return companyId;
    }
  }

  const companiesResponse = await gateway.getRaw<Array<{companyId?: number}>>('/api/jsonws/company/get-companies');

  if (!companiesResponse.ok || !Array.isArray(companiesResponse.data) || companiesResponse.data.length === 0) {
    return -1;
  }

  return companiesResponse.data[0]?.companyId ?? -1;
}
