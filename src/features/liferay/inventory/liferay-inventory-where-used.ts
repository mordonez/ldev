import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {mapConcurrent} from '../../../core/concurrency.js';
import {CliError, isCliError} from '../../../core/errors.js';
import {resolveInventoryPageRequest, runLiferayInventoryPage} from './liferay-inventory-page.js';
import {runLiferayInventoryPages, type LiferayInventoryPagesNode} from './liferay-inventory-pages.js';
import {runLiferayInventorySitesIncludingGlobal, type LiferayInventorySite} from './liferay-inventory-sites.js';
import {
  matchPageAgainstResource,
  type WhereUsedQuery,
  type WhereUsedResourceType,
} from './liferay-inventory-where-used-match.js';
import {buildPageMatch, flattenPages, type WhereUsedPageMatch} from './liferay-inventory-where-used-pages.js';

export {matchPageAgainstResource} from './liferay-inventory-where-used-match.js';
export {formatLiferayInventoryWhereUsed} from './liferay-inventory-where-used-format.js';
export type {
  WhereUsedMatch,
  WhereUsedMatchKind,
  WhereUsedQuery,
  WhereUsedResourceType,
} from './liferay-inventory-where-used-match.js';
export type {WhereUsedPageMatch} from './liferay-inventory-where-used-pages.js';

export type WhereUsedOptions = {
  type: WhereUsedResourceType;
  keys: string[];
  site?: string;
  includePrivate?: boolean;
  maxDepth?: number;
  concurrency?: number;
  pageSize?: number;
};

export type WhereUsedDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type WhereUsedSiteResult = {
  siteFriendlyUrl: string;
  siteName: string;
  groupId: number;
  scannedPages: number;
  failedPages: number;
  matchedPages: WhereUsedPageMatch[];
  errors?: Array<{fullUrl: string; reason: string}>;
};

export type WhereUsedResult = {
  inventoryType: 'whereUsed';
  query: WhereUsedQuery;
  scope: {
    sites: string[];
    includePrivate: boolean;
    concurrency: number;
    maxDepth: number;
  };
  summary: {
    totalSites: number;
    totalScannedPages: number;
    totalMatchedPages: number;
    totalMatches: number;
    totalFailedPages: number;
  };
  sites: WhereUsedSiteResult[];
};

const VALID_RESOURCE_TYPES: WhereUsedResourceType[] = ['fragment', 'widget', 'portlet', 'structure', 'template', 'adt'];

export function validateWhereUsedQuery(options: Pick<WhereUsedOptions, 'type' | 'keys'>): WhereUsedQuery {
  if (!VALID_RESOURCE_TYPES.includes(options.type)) {
    throw new CliError(`--type must be one of: ${VALID_RESOURCE_TYPES.join(', ')}.`, {code: 'LIFERAY_INVENTORY_ERROR'});
  }

  const cleanedKeys = options.keys
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter((key) => key.length > 0);

  if (cleanedKeys.length === 0) {
    throw new CliError('Provide at least one --key value to look up.', {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  return {type: options.type, keys: Array.from(new Set(cleanedKeys))};
}

export async function runLiferayInventoryWhereUsed(
  config: AppConfig,
  options: WhereUsedOptions,
  dependencies?: WhereUsedDependencies,
): Promise<WhereUsedResult> {
  const query = validateWhereUsedQuery(options);
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const sharedDependencies = {apiClient, tokenClient: dependencies?.tokenClient};
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const maxDepth = Math.max(0, options.maxDepth ?? 12);
  const includePrivate = Boolean(options.includePrivate);

  const targetSites = await resolveTargetSites(config, options.site, options.pageSize, sharedDependencies);
  const layoutScopes: boolean[] = includePrivate ? [false, true] : [false];

  const siteResults: WhereUsedSiteResult[] = [];
  for (const site of targetSites) {
    siteResults.push(await scanSite(config, site, query, {layoutScopes, concurrency, maxDepth, sharedDependencies}));
  }

  return {
    inventoryType: 'whereUsed',
    query,
    scope: {
      sites: targetSites.map((site) => site.siteFriendlyUrl),
      includePrivate,
      concurrency,
      maxDepth,
    },
    summary: summarize(siteResults),
    sites: siteResults,
  };
}

type ScanContext = {
  layoutScopes: boolean[];
  concurrency: number;
  maxDepth: number;
  sharedDependencies: WhereUsedDependencies;
};

async function scanSite(
  config: AppConfig,
  site: LiferayInventorySite,
  query: WhereUsedQuery,
  context: ScanContext,
): Promise<WhereUsedSiteResult> {
  const result: WhereUsedSiteResult = {
    siteFriendlyUrl: site.siteFriendlyUrl,
    siteName: site.name,
    groupId: site.groupId,
    scannedPages: 0,
    failedPages: 0,
    matchedPages: [],
  };
  const errors: Array<{fullUrl: string; reason: string}> = [];

  for (const privateLayout of context.layoutScopes) {
    let pages: LiferayInventoryPagesNode[];
    try {
      const pagesResult = await runLiferayInventoryPages(
        config,
        {site: site.siteFriendlyUrl, privateLayout, maxDepth: context.maxDepth},
        context.sharedDependencies,
      );
      pages = pagesResult.pages;
    } catch (error) {
      if (isSkippableSiteScanError(error)) continue;
      throw error;
    }

    const flatPages = flattenPages(pages, privateLayout);
    result.scannedPages += flatPages.length;

    const pageResults = await mapConcurrent(flatPages, context.concurrency, async (entry) => {
      try {
        const page = await runLiferayInventoryPage(
          config,
          resolveInventoryPageRequest({url: entry.fullUrl}),
          context.sharedDependencies,
        );
        const matches = matchPageAgainstResource(page, query);
        if (matches.length === 0) return null;
        return buildPageMatch(page, entry, matches);
      } catch (error) {
        errors.push({fullUrl: entry.fullUrl, reason: extractErrorMessage(error)});
        return 'failed' as const;
      }
    });

    for (const item of pageResults) {
      if (item === null) continue;
      if (item === 'failed') {
        result.failedPages += 1;
        continue;
      }
      result.matchedPages.push(item);
    }
  }

  if (errors.length > 0) {
    result.errors = errors;
  }
  return result;
}

function summarize(siteResults: WhereUsedSiteResult[]): WhereUsedResult['summary'] {
  return {
    totalSites: siteResults.length,
    totalScannedPages: siteResults.reduce((acc, site) => acc + site.scannedPages, 0),
    totalMatchedPages: siteResults.reduce((acc, site) => acc + site.matchedPages.length, 0),
    totalMatches: siteResults.reduce(
      (acc, site) => acc + site.matchedPages.reduce((sum, page) => sum + page.matches.length, 0),
      0,
    ),
    totalFailedPages: siteResults.reduce((acc, site) => acc + site.failedPages, 0),
  };
}

async function resolveTargetSites(
  config: AppConfig,
  siteOption: string | undefined,
  pageSize: number | undefined,
  dependencies: WhereUsedDependencies,
): Promise<LiferayInventorySite[]> {
  if (siteOption) {
    const sites = await runLiferayInventorySitesIncludingGlobal(config, {pageSize: pageSize ?? 200}, dependencies);
    const target = sites.find(
      (site) =>
        site.siteFriendlyUrl === siteOption ||
        site.siteFriendlyUrl === `/${siteOption}` ||
        String(site.groupId) === siteOption,
    );
    if (target) return [target];

    return [
      {
        groupId: -1,
        siteFriendlyUrl: siteOption.startsWith('/') ? siteOption : `/${siteOption}`,
        name: siteOption,
        pagesCommand: `inventory pages --site ${siteOption}`,
      },
    ];
  }

  return runLiferayInventorySitesIncludingGlobal(config, {pageSize: pageSize ?? 200}, dependencies);
}

function isSkippableSiteScanError(error: unknown): boolean {
  if (!isCliError(error)) return false;
  if (error.code !== 'LIFERAY_INVENTORY_ERROR' && error.code !== 'LIFERAY_GATEWAY_ERROR') {
    return false;
  }
  return error.message.includes('status=403') || error.message.includes('status=404');
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof CliError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
