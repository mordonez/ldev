import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type HttpResponse, type HttpApiClient} from '../../../core/http/client.js';
import {expectJsonSuccess as expectJsonSuccessShared} from '../liferay-http-shared.js';
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
  type HeadlessPage,
} from './liferay-site-resolver.js';

// Re-export for backward compatibility
export type {ResolvedSite};

type InventoryDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
  gateway?: LiferayGateway;
  accessToken?: string;
  forceRefresh?: boolean;
};

// Tokens are valid for ~1 h; cache matches that lifetime to avoid redundant OAuth requests.
const accessTokenCache = new LookupCache<string>({ttlMs: 3_600_000});
// Site resolution is expensive (multi-step pipeline); 5-min TTL avoids repeated lookups.
export const resolvedSiteCache = new LookupCache<ResolvedSite>();

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
  const cached = accessTokenCache.get(cacheKey, dependencies?.forceRefresh);
  if (cached) {
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
  const cacheKey = [config.liferay.url, config.liferay.oauth2ClientId, config.liferay.scopeAliases, site].join('|');
  const cached = resolvedSiteCache.get(cacheKey, dependencies?.forceRefresh);
  if (cached) return cached;

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(config, apiClient, dependencies);

  // Build and execute resolution pipeline
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

export async function fetchPagedItems<T>(
  config: AppConfig,
  basePath: string,
  pageSize: number,
  dependencies?: InventoryDependencies,
): Promise<T[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(config, apiClient, dependencies);

  const items: T[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const separator = basePath.includes('?') ? '&' : '?';

    try {
      const pageData = await gateway.getJson<HeadlessPage<T>>(
        `${basePath}${separator}page=${page}&pageSize=${pageSize}`,
        `paged request ${basePath}`,
      );

      const payload = pageData ?? {};
      if (Array.isArray(payload.items)) {
        items.push(...payload.items);
      }
      lastPage = payload.lastPage ?? 1;
      page += 1;
    } catch (error) {
      // Handle gateway errors: convert to inventory-specific error code
      if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR') {
        // Check for 403 (permission) errors and provide scoped guidance
        if (error.message.includes('status=403')) {
          throw LiferayErrors.inventoryError(
            `403 Forbidden on ${basePath} (check the bootstrap OAuth2 scopes for Data Engine/Headless Delivery).`,
          );
        }
        throw LiferayErrors.inventoryError(error.message);
      }
      throw error;
    }
  }

  return items;
}

export async function expectJsonSuccess<T>(response: HttpResponse<T>, label: string): Promise<HttpResponse<T>> {
  return expectJsonSuccessShared(response, label, 'LIFERAY_INVENTORY_ERROR');
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
    throw LiferayErrors.siteNotFound(site);
  }

  return {
    id,
    friendlyUrlPath: normalizeFriendlyUrl(payload?.friendlyUrlPath ?? ''),
    name: normalizeLocalizedName(payload?.name),
  };
}

export function createInventoryGateway(
  config: AppConfig,
  apiClient: HttpApiClient,
  dependencies?: InventoryDependencies,
) {
  if (dependencies?.gateway) {
    return dependencies.gateway;
  }

  if (dependencies?.accessToken) {
    const fixedTokenClient: OAuthTokenClient = {
      fetchClientCredentialsToken: async () => ({
        accessToken: dependencies.accessToken!,
        tokenType: 'Bearer',
        expiresIn: 3600,
      }),
    };

    return createLiferayGateway(config, apiClient, fixedTokenClient);
  }

  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  return createLiferayGateway(config, apiClient, tokenClient);
}
