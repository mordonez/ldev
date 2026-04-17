import {CliError} from '../../../core/errors.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {LiferayErrors} from '../errors/index.js';

/**
 * Resolved site payload from Liferay API.
 */
export type ResolvedSite = {
  id: number;
  friendlyUrlPath: string;
  name: string;
};

/**
 * Raw response from site lookup endpoints.
 */
export type SiteLookupPayload = {
  id?: number;
  friendlyUrlPath?: string;
  name?: string | Record<string, string>;
};

/**
 * Paginated response wrapper from Liferay Headless APIs.
 */
export type HeadlessPage<T> = {
  items?: T[];
  lastPage?: number;
};

/**
 * Hooks for observability during site resolution.
 */
export type SiteResolutionHooks = {
  /**
   * Called when a resolution step succeeds.
   * Useful for logging which strategy worked.
   */
  onStepSuccess?: (stepName: string, site: string) => void;
  /**
   * Called when a resolution step fails.
   */
  onStepFailure?: (stepName: string, error: Error) => void;
};

/**
 * Single step in the site resolution pipeline.
 * Returns resolved site if successful, null if this step doesn't match, throws on error.
 */
export type SiteResolutionStep = (site: string) => Promise<ResolvedSite | null>;

/**
 * Declarative pipeline for site resolution with fallback chain.
 *
 * Executes steps in order:
 * 1. By ID (headless-admin-site)
 * 2. By friendly URL (headless-admin-site)
 * 3. By friendly URL (headless-admin-user - for company groups)
 * 4. Paginated search (headless-admin-site)
 * 5. JSONWS fallback
 *
 * Each step is independent and testable.
 */
export class SiteResolutionPipeline {
  private steps: Array<{name: string; step: SiteResolutionStep}> = [];

  constructor(private hooks?: SiteResolutionHooks) {}

  /**
   * Add a resolution step to the pipeline.
   */
  addStep(name: string, step: SiteResolutionStep): this {
    this.steps.push({name, step});
    return this;
  }

  /**
   * Execute the pipeline in order.
   * Returns first successful resolution, or throws if all steps return null.
   * Error handling contract:
   * - Steps return null to continue (miss)
   * - Steps throw 404/403 to continue (miss)
   * - Steps throw other errors to propagate (unexpected)
   */
  async execute(site: string): Promise<ResolvedSite> {
    for (const {name, step} of this.steps) {
      try {
        const result = await step(site);
        if (result) {
          this.hooks?.onStepSuccess?.(name, site);
          return result;
        }
      } catch (error) {
        // Treat 404/403 as miss (continue to next step)
        if (isMiss(error)) {
          this.hooks?.onStepFailure?.(name, error instanceof Error ? error : new Error(String(error)));
          continue;
        }
        // Unexpected error: propagate immediately
        this.hooks?.onStepFailure?.(name, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }

    throw LiferayErrors.siteNotFound(site);
  }
}

/**
 * Create a step that resolves by numeric ID (headless-admin-site).
 * Only attempts if site looks like a number.
 * Uses LiferayGateway for HTTP transport with automatic token and error handling.
 */
export function createByIdStep(
  gateway: LiferayGateway,
  normalizeResolvedSite: (payload: SiteLookupPayload | null, original: string) => ResolvedSite,
): SiteResolutionStep {
  return async (site: string): Promise<ResolvedSite | null> => {
    if (!/^\d+$/.test(site)) {
      return null;
    }

    try {
      const data = await gateway.getJson<SiteLookupPayload>(
        `/o/headless-admin-site/v1.0/sites/${site}`,
        'resolve-site-by-id',
      );
      return normalizeResolvedSite(data, site);
    } catch (error) {
      if (isGatewayMiss(error)) {
        return null;
      }
      throw error;
    }
  };
}

/**
 * Create a step that resolves by friendly URL (headless-admin-site).
 * Uses LiferayGateway for HTTP transport with automatic token and error handling.
 */
export function createByFriendlyUrlHeadlessSiteStep(
  gateway: LiferayGateway,
  normalizeResolvedSite: (payload: SiteLookupPayload | null, original: string) => ResolvedSite,
): SiteResolutionStep {
  return async (site: string): Promise<ResolvedSite | null> => {
    const normalized = site.startsWith('/') ? site.slice(1) : site;

    try {
      const data = await gateway.getJson<SiteLookupPayload>(
        `/o/headless-admin-site/v1.0/sites/by-friendly-url-path/${encodeURIComponent(normalized)}`,
        'resolve-site-by-friendly-url-site',
      );
      return normalizeResolvedSite(data, site);
    } catch (error) {
      if (isGatewayMiss(error)) {
        return null;
      }
      throw error;
    }
  };
}

/**
 * Create a step that resolves by friendly URL (headless-admin-user).
 * This endpoint exposes company groups (e.g., /global) that headless-admin-site doesn't.
 * Uses LiferayGateway for HTTP transport with automatic token and error handling.
 */
export function createByFriendlyUrlHeadlessUserStep(
  gateway: LiferayGateway,
  normalizeResolvedSite: (payload: SiteLookupPayload | null, original: string) => ResolvedSite,
): SiteResolutionStep {
  return async (site: string): Promise<ResolvedSite | null> => {
    const normalized = site.startsWith('/') ? site.slice(1) : site;

    try {
      const data = await gateway.getJson<SiteLookupPayload>(
        `/o/headless-admin-user/v1.0/sites/by-friendly-url-path/${encodeURIComponent(normalized)}`,
        'resolve-site-by-friendly-url-user',
      );
      return normalizeResolvedSite(data, site);
    } catch (error) {
      if (isGatewayMiss(error)) {
        return null;
      }
      throw error;
    }
  };
}

/**
 * Create a step that resolves via paginated search (headless-admin-site).
 * Searches all sites for matching friendly URL or name.
 * Uses LiferayGateway for HTTP transport with automatic token and error handling.
 */
export function createPaginatedSearchStep(
  gateway: LiferayGateway,
  normalizeResolvedSite: (payload: SiteLookupPayload | null, original: string) => ResolvedSite,
  normalizeFriendlyUrl: (url: string) => string,
  normalizeLocalizedName: (name: string | Record<string, string> | undefined) => string,
): SiteResolutionStep {
  return async (site: string): Promise<ResolvedSite | null> => {
    const normalized = site.startsWith('/') ? site.slice(1) : site;
    const exactFriendlyUrlRequested = site.trim().startsWith('/');
    const cleanInput = normalized.toLowerCase();
    let page = 1;
    let lastPage = 1;

    try {
      while (page <= lastPage) {
        const pageData = await gateway.getJson<HeadlessPage<SiteLookupPayload>>(
          `/o/headless-admin-site/v1.0/sites?pageSize=100&page=${page}`,
          `list-sites-page-${page}`,
        );

        const items = Array.isArray(pageData?.items) ? pageData.items : [];

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

        lastPage = pageData?.lastPage ?? 1;
        page += 1;
      }
    } catch (error) {
      if (isGatewayMiss(error)) {
        return null;
      }
      throw error;
    }

    return null;
  };
}

/**
 * Create a step that falls back to JSONWS API.
 * Uses LiferayGateway for HTTP transport with automatic token and error handling.
 */
export function createJsonwsFallbackStep(
  gateway: LiferayGateway,
  normalizeResolvedSite: (payload: SiteLookupPayload | null, original: string) => ResolvedSite,
  normalizeFriendlyUrl: (url: string) => string,
  normalizeLocalizedName: (name: string | Record<string, string> | undefined) => string,
): SiteResolutionStep {
  return async (site: string): Promise<ResolvedSite | null> => {
    try {
      const result = await resolveSiteViaJsonws(
        gateway,
        site,
        normalizeResolvedSite,
        normalizeFriendlyUrl,
        normalizeLocalizedName,
      );
      return result;
    } catch (error) {
      if (isGatewayMiss(error)) {
        return null;
      }
      throw error;
    }
  };
}

/**
 * Resolve site via JSONWS fallback API.
 * Internal helper extracted to support both old code and pipeline.
 * Uses LiferayGateway for HTTP transport with automatic token and error handling.
 */
async function resolveSiteViaJsonws(
  gateway: LiferayGateway,
  site: string,
  normalizeResolvedSite: (payload: SiteLookupPayload | null, original: string) => ResolvedSite,
  normalizeFriendlyUrl: (url: string) => string,
  normalizeLocalizedName: (name: string | Record<string, string> | undefined) => string,
): Promise<ResolvedSite | null> {
  type JsonwsCompany = {companyId?: number};
  type JsonwsGroup = {
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
  } catch (error) {
    if (isGatewayMiss(error)) {
      return null;
    }
    throw error;
  }

  if (!Array.isArray(companies)) {
    return null;
  }

  const cleanInput = (site.startsWith('/') ? site.slice(1) : site).toLowerCase();
  const exactFriendlyUrlRequested = site.trim().startsWith('/');

  for (const company of companies) {
    const companyId = company.companyId ?? 0;
    if (companyId <= 0) {
      continue;
    }

    let totalStr: string;
    try {
      totalStr = await gateway.getJson<string>(
        `/api/jsonws/group/search-count?companyId=${companyId}&name=&description=&params=%7B%7D`,
        'count-jsonws-groups',
      );
    } catch (error) {
      if (isGatewayMiss(error)) {
        continue;
      }
      throw error;
    }

    const total = Number.parseInt(totalStr, 10);
    if (!Number.isFinite(total) || total <= 0) {
      continue;
    }

    for (let start = 0; start < total; start += 100) {
      const end = start + 100;
      let groups: JsonwsGroup[];
      try {
        groups = await gateway.getJson<JsonwsGroup[]>(
          '/api/jsonws/group/search' +
            `?companyId=${companyId}` +
            '&name=' +
            '&description=' +
            '&params=%7B%7D' +
            `&start=${start}` +
            `&end=${end}`,
          'search-jsonws-groups',
        );
      } catch (error) {
        if (isGatewayMiss(error)) {
          continue;
        }
        throw error;
      }

      if (!Array.isArray(groups)) {
        continue;
      }

      for (const item of groups) {
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
          return normalizeResolvedSite(
            {
              id: item.groupId,
              friendlyUrlPath,
              name: normalizeLocalizedName(item.nameCurrentValue ?? item.name),
            },
            site,
          );
        }
      }
    }
  }

  return null;
}

function isMiss(error: unknown): boolean {
  return (
    error instanceof CliError &&
    error.code === 'LIFERAY_GATEWAY_ERROR' &&
    (error.message.includes('status=403') || error.message.includes('status=404'))
  );
}

function isGatewayMiss(error: unknown): boolean {
  return isMiss(error);
}
