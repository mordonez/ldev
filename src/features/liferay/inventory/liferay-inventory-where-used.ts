import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {mapConcurrent} from '../../../core/concurrency.js';
import {CliError} from '../../../core/errors.js';
import {runContentStats, type ContentStatsSite} from '../content/liferay-content-stats.js';
import {normalizeFriendlyUrl} from '../portal/site-resolution.js';
import {whereUsedResourceTypes} from './liferay-inventory-evidence-contract.js';
import {extractPageEvidence} from './liferay-inventory-page-evidence.js';
import {resolveInventoryPageRequest, runLiferayInventoryPage} from './liferay-inventory-page.js';
import {createInventoryGateway} from './liferay-inventory-shared.js';
import {runLiferayInventorySitesIncludingGlobal, type LiferayInventorySite} from './liferay-inventory-sites.js';
import {resolveWhereUsedQuery as resolveWhereUsedPortalResourceQuery} from './liferay-inventory-where-used-query-resolver.js';
import {
  matchEvidenceAgainstResource,
  type WhereUsedQuery,
  type WhereUsedResourceType,
} from './liferay-inventory-where-used-match.js';
import {validateWhereUsedPlanResult, validateWhereUsedResult} from './liferay-inventory-where-used-schema.js';
import {buildPageMatch, type WhereUsedPageMatch} from './liferay-inventory-where-used-pages.js';
import {collectWhereUsedPageCandidates} from './liferay-inventory-where-used-page-candidates.js';

export {matchEvidenceAgainstResource, matchPageAgainstResource} from './liferay-inventory-where-used-match.js';
export {formatLiferayInventoryWhereUsed} from './liferay-inventory-where-used-format.js';
export {validateWhereUsedPlanResult, validateWhereUsedResult} from './liferay-inventory-where-used-schema.js';
export {
  buildWhereUsedAdtKeys,
  collectWhereUsedAdtKeys,
  collectWhereUsedFragmentKeys,
  collectWhereUsedTemplateKeys,
} from './liferay-inventory-where-used-query-resolver.js';
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
  sites?: string[];
  excludeSites?: string[];
  widgetType?: string;
  className?: string;
  includePrivate?: boolean;
  siteLimit?: number;
  siteOrder?: string;
  plan?: boolean;
  maxDepth?: number;
  concurrency?: number;
  pageSize?: number;
};

export type WhereUsedDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export const whereUsedSiteOrderValues = ['site', 'name', 'content'] as const;
export type WhereUsedSiteOrder = (typeof whereUsedSiteOrderValues)[number];

export type ValidatedWhereUsedScopeOptions = {
  siteOrder: WhereUsedSiteOrder;
  siteLimit?: number;
  excludedSites: string[];
  plan: boolean;
};

export type WhereUsedCandidateLike = {
  fullUrl: string;
  origin?: 'layout' | 'headlessStructuredContent' | 'jsonwsJournal';
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
    siteOrder: WhereUsedSiteOrder;
    siteLimit?: number;
    excludedSites: string[];
    plan: false;
  };
  summary: {
    totalSites: number;
    totalScannedPages: number;
    totalMatchedPages: number;
    totalMatches: number;
    totalFailedPages: number;
  };
  sites: WhereUsedSiteResult[];
  skippedSites?: Array<{siteFriendlyUrl: string; groupId: number; reason: string}>;
};

export type WhereUsedPlanSite = {
  rank: number;
  siteFriendlyUrl: string;
  siteName: string;
  groupId: number;
  structuredContents?: number;
  selectionReason: 'explicitSite' | 'siteOrder' | 'contentOrder';
};

export type WhereUsedPlanResult = {
  inventoryType: 'whereUsedPlan';
  query: WhereUsedQuery;
  scope: {
    sites: string[];
    includePrivate: boolean;
    concurrency: number;
    maxDepth: number;
    siteOrder: WhereUsedSiteOrder;
    siteLimit?: number;
    excludedSites: string[];
    plan: true;
  };
  summary: {
    totalSites: number;
    selectedSites: number;
    excludedSites: number;
    skippedSites: number;
  };
  sites: WhereUsedPlanSite[];
  skippedSites?: Array<{siteFriendlyUrl: string; groupId: number; reason: string}>;
};

export type WhereUsedRunResult = WhereUsedResult | WhereUsedPlanResult;

export type WhereUsedSiteSelectionInput = {
  sites: LiferayInventorySite[];
  explicitSites?: string[];
  siteOrder: WhereUsedSiteOrder;
  siteLimit?: number;
  excludedSites: string[];
  contentStatsSites?: ContentStatsSite[];
  contentStatsSkippedSites?: Array<{groupId: number; siteFriendlyUrl: string; reason: string}>;
};

export type WhereUsedSiteSelection = {
  selectedSites: LiferayInventorySite[];
  planSites: WhereUsedPlanSite[];
  totalSites: number;
  excludedCount: number;
  skippedSites: Array<{siteFriendlyUrl: string; groupId: number; reason: string}>;
};

const VALID_RESOURCE_TYPES: WhereUsedResourceType[] = [...whereUsedResourceTypes];
const VALID_SITE_ORDERS: WhereUsedSiteOrder[] = [...whereUsedSiteOrderValues];

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

export function validateWhereUsedScopeOptions(
  options: Pick<WhereUsedOptions, 'siteOrder' | 'siteLimit' | 'excludeSites' | 'plan'>,
): ValidatedWhereUsedScopeOptions {
  const siteOrder = (options.siteOrder ?? 'site').trim() as WhereUsedSiteOrder;
  if (!VALID_SITE_ORDERS.includes(siteOrder)) {
    throw new CliError(`--site-order must be one of: ${VALID_SITE_ORDERS.join(', ')}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const siteLimit = options.siteLimit;
  if (siteLimit !== undefined && (!Number.isInteger(siteLimit) || siteLimit <= 0)) {
    throw new CliError('--site-limit must be a positive integer.', {code: 'LIFERAY_INVENTORY_ERROR'});
  }

  const excludedSites = Array.from(
    new Set(
      (options.excludeSites ?? []).map((site) => normalizeFriendlyUrl(site.trim())).filter((site) => site.length > 0),
    ),
  );

  return {
    siteOrder,
    ...(siteLimit !== undefined ? {siteLimit} : {}),
    excludedSites,
    plan: Boolean(options.plan),
  };
}

export async function runLiferayInventoryWhereUsed(
  config: AppConfig,
  options: WhereUsedOptions,
  dependencies?: WhereUsedDependencies,
): Promise<WhereUsedRunResult> {
  const baseQuery = validateWhereUsedQuery(options);
  const scopeOptions = validateWhereUsedScopeOptions(options);
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(config, apiClient, {
    apiClient,
    tokenClient: dependencies?.tokenClient,
  });
  const sharedDependencies = {apiClient, tokenClient: dependencies?.tokenClient, gateway};
  const query = await resolveWhereUsedPortalResourceQuery(config, baseQuery, options, sharedDependencies);
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const maxDepth = Math.max(0, options.maxDepth ?? 12);
  const includePrivate = Boolean(options.includePrivate);

  const resolvedScope = await resolveTargetSites(
    config,
    options.sites,
    options.pageSize,
    scopeOptions,
    sharedDependencies,
  );
  const layoutScopes: boolean[] = includePrivate ? [false, true] : [false];

  if (scopeOptions.plan) {
    return validateWhereUsedPlanResult({
      inventoryType: 'whereUsedPlan',
      query,
      scope: {
        sites: resolvedScope.selectedSites.map((site) => site.siteFriendlyUrl),
        includePrivate,
        concurrency,
        maxDepth,
        siteOrder: scopeOptions.siteOrder,
        ...(scopeOptions.siteLimit !== undefined ? {siteLimit: scopeOptions.siteLimit} : {}),
        excludedSites: scopeOptions.excludedSites,
        plan: true,
      },
      summary: {
        totalSites: resolvedScope.totalSites,
        selectedSites: resolvedScope.selectedSites.length,
        excludedSites: resolvedScope.excludedCount,
        skippedSites: resolvedScope.skippedSites.length,
      },
      sites: resolvedScope.planSites,
      ...(resolvedScope.skippedSites.length > 0 ? {skippedSites: resolvedScope.skippedSites} : {}),
    }) as WhereUsedPlanResult;
  }

  const siteResults: WhereUsedSiteResult[] = [];
  for (const site of resolvedScope.selectedSites) {
    siteResults.push(
      await scanSite(config, site, query, {
        layoutScopes,
        concurrency,
        maxDepth,
        pageSize: options.pageSize ?? 200,
        sharedDependencies,
      }),
    );
  }

  return validateWhereUsedResult({
    inventoryType: 'whereUsed',
    query,
    scope: {
      sites: resolvedScope.selectedSites.map((site) => site.siteFriendlyUrl),
      includePrivate,
      concurrency,
      maxDepth,
      siteOrder: scopeOptions.siteOrder,
      ...(scopeOptions.siteLimit !== undefined ? {siteLimit: scopeOptions.siteLimit} : {}),
      excludedSites: scopeOptions.excludedSites,
      plan: false,
    },
    summary: summarize(siteResults),
    sites: siteResults,
    ...(resolvedScope.skippedSites.length > 0 ? {skippedSites: resolvedScope.skippedSites} : {}),
  }) as WhereUsedResult;
}

type ScanContext = {
  layoutScopes: boolean[];
  concurrency: number;
  maxDepth: number;
  pageSize: number;
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
    groupId: Number(site.groupId),
    scannedPages: 0,
    failedPages: 0,
    matchedPages: [],
  };
  const errors: Array<{fullUrl: string; reason: string}> = [];
  const candidates = await collectWhereUsedPageCandidates(config, site, query, {
    layoutScopes: context.layoutScopes,
    concurrency: context.concurrency,
    maxDepth: context.maxDepth,
    pageSize: context.pageSize,
    dependencies: context.sharedDependencies,
  });
  result.scannedPages = candidates.length;

  const pageResults = await mapConcurrent(candidates, context.concurrency, async (candidate) => {
    try {
      const page = await runLiferayInventoryPage(
        config,
        resolveInventoryPageRequest({url: candidate.fullUrl}),
        context.sharedDependencies,
      );
      const matches = matchEvidenceAgainstResource(extractPageEvidence(page), query);
      if (matches.length === 0) return null;
      return buildPageMatch(page, candidate, matches, config.liferay.url);
    } catch (error) {
      if (isSkippableWhereUsedCandidateError(candidate, error)) {
        return null;
      }
      errors.push({fullUrl: candidate.fullUrl, reason: extractErrorMessage(error)});
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
  siteOptions: string[] | undefined,
  pageSize: number | undefined,
  scopeOptions: ValidatedWhereUsedScopeOptions,
  dependencies: WhereUsedDependencies,
): Promise<WhereUsedSiteSelection> {
  const sites = await runLiferayInventorySitesIncludingGlobal(config, {pageSize: pageSize ?? 200}, dependencies);

  let contentStatsSites: ContentStatsSite[] | undefined;
  let contentStatsSkippedSites: Array<{groupId: number; siteFriendlyUrl: string; reason: string}> | undefined;

  if ((!siteOptions || siteOptions.length === 0) && scopeOptions.siteOrder === 'content' && sites.length > 0) {
    const contentStats = await runContentStats(
      config,
      {
        limit: sites.length,
        excludeSites: scopeOptions.excludedSites,
        sortBy: 'content',
      },
      dependencies,
    );

    if (contentStats.mode === 'sites') {
      contentStatsSites = contentStats.sites;
      contentStatsSkippedSites = contentStats.skippedSites;
    }
  }

  return selectWhereUsedSites({
    sites,
    ...(siteOptions && siteOptions.length > 0 ? {explicitSites: siteOptions} : {}),
    siteOrder: scopeOptions.siteOrder,
    ...(scopeOptions.siteLimit !== undefined ? {siteLimit: scopeOptions.siteLimit} : {}),
    excludedSites: scopeOptions.excludedSites,
    ...(contentStatsSites ? {contentStatsSites} : {}),
    ...(contentStatsSkippedSites ? {contentStatsSkippedSites} : {}),
  });
}

export function selectWhereUsedSites(input: WhereUsedSiteSelectionInput): WhereUsedSiteSelection {
  if (input.explicitSites && input.explicitSites.length > 0) {
    const explicitSites = input.explicitSites.map((site) => site.trim()).filter((site) => site !== '');
    const selectedSites = explicitSites.map((explicitSite) => {
      return (
        input.sites.find(
          (site) =>
            site.siteFriendlyUrl === explicitSite ||
            site.siteFriendlyUrl === `/${explicitSite}` ||
            String(site.groupId) === explicitSite,
        ) ?? {
          groupId: -1,
          siteFriendlyUrl: explicitSite.startsWith('/') ? explicitSite : `/${explicitSite}`,
          name: explicitSite,
          pagesCommand: `inventory pages --site ${explicitSite}`,
        }
      );
    });

    const uniqueSelectedSites = selectedSites.filter(
      (site, index, allSites) =>
        allSites.findIndex((candidate) => candidate.siteFriendlyUrl === site.siteFriendlyUrl) === index,
    );

    return {
      selectedSites: uniqueSelectedSites,
      planSites: uniqueSelectedSites.map((site, index) => ({
        rank: index + 1,
        siteFriendlyUrl: site.siteFriendlyUrl,
        siteName: site.name,
        groupId: site.groupId,
        selectionReason: 'explicitSite',
      })),
      totalSites: input.sites.length,
      excludedCount: 0,
      skippedSites: input.contentStatsSkippedSites ?? [],
    };
  }

  const excludedSites = new Set(input.excludedSites);
  const filteredSites = input.sites.filter((site) => !excludedSites.has(site.siteFriendlyUrl));
  const structuredContentsBySite = new Map(
    (input.contentStatsSites ?? []).map((site) => [site.siteFriendlyUrl, site.structuredContents]),
  );

  const orderedSites = filteredSites.slice().sort((left, right) => {
    if (input.siteOrder === 'content') {
      const leftCount = structuredContentsBySite.get(left.siteFriendlyUrl);
      const rightCount = structuredContentsBySite.get(right.siteFriendlyUrl);

      if (leftCount !== undefined && rightCount !== undefined && leftCount !== rightCount) {
        return rightCount - leftCount;
      }
      if (leftCount !== undefined && rightCount === undefined) return -1;
      if (leftCount === undefined && rightCount !== undefined) return 1;
      return left.siteFriendlyUrl.localeCompare(right.siteFriendlyUrl);
    }

    if (input.siteOrder === 'name') {
      const byName = left.name.localeCompare(right.name);
      return byName !== 0 ? byName : left.siteFriendlyUrl.localeCompare(right.siteFriendlyUrl);
    }

    return left.siteFriendlyUrl.localeCompare(right.siteFriendlyUrl);
  });

  const limitedSites = input.siteLimit !== undefined ? orderedSites.slice(0, input.siteLimit) : orderedSites;

  return {
    selectedSites: limitedSites,
    planSites: limitedSites.map((site, index) => ({
      rank: index + 1,
      siteFriendlyUrl: site.siteFriendlyUrl,
      siteName: site.name,
      groupId: site.groupId,
      ...(structuredContentsBySite.has(site.siteFriendlyUrl)
        ? {structuredContents: structuredContentsBySite.get(site.siteFriendlyUrl)}
        : {}),
      selectionReason: input.siteOrder === 'content' ? 'contentOrder' : 'siteOrder',
    })),
    totalSites: input.sites.length,
    excludedCount: input.sites.length - filteredSites.length,
    skippedSites: input.contentStatsSkippedSites ?? [],
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof CliError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isSkippableWhereUsedCandidateError(candidate: WhereUsedCandidateLike, error: unknown): boolean {
  if (candidate.origin !== 'jsonwsJournal') {
    return false;
  }

  const message = extractErrorMessage(error);
  return message.includes('No structured content found with friendlyUrlPath=');
}
