import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {mapConcurrent} from '../../../core/concurrency.js';
import {
  whereUsedResultSchema,
  whereUsedPlanResultSchema,
  type WhereUsedQuery,
  type WhereUsedResult,
  type WhereUsedRunResult,
  type WhereUsedPageMatch,
} from '../../../core/contracts/inventory.schema.js';
import {runContentStats, type ContentStatsSite} from '../content/liferay-content-stats.js';
import {extractPageEvidence} from './liferay-inventory-page-evidence.js';
import {resolveInventoryPageRequest, runLiferayInventoryPage} from './liferay-inventory-page.js';
import {createInventoryGateway} from './liferay-inventory-shared.js';
import {runLiferayInventorySitesIncludingGlobal, type LiferayInventorySite} from './liferay-inventory-sites.js';
import {
  resolveWhereUsedQuery,
  validateWhereUsedQuery,
  validateWhereUsedScopeOptions,
  selectWhereUsedSites,
  type ValidatedWhereUsedScopeOptions,
  type WhereUsedSiteSelectionInput,
  type WhereUsedSiteSelection,
} from './liferay-inventory-where-used-query.js';
import {
  matchEvidenceAgainstResource,
  buildPageMatch,
  collectWhereUsedPageCandidates,
  isSkippableWhereUsedCandidateError,
  extractErrorMessage,
} from './liferay-inventory-where-used-scan.js';

export {formatLiferayInventoryWhereUsed} from './liferay-inventory-where-used-format.js';
export type {WhereUsedResourceType} from '../../../core/contracts/inventory.schema.js';
export type {
  WhereUsedResult,
  WhereUsedPlanResult,
  WhereUsedRunResult,
} from '../../../core/contracts/inventory.schema.js';

export type WhereUsedOptions = {
  type: string;
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

type WhereUsedSiteResult = {
  siteFriendlyUrl: string;
  siteName: string;
  groupId: number;
  scannedPages: number;
  failedPages: number;
  matchedPages: WhereUsedPageMatch[];
  errors?: Array<{fullUrl: string; reason: string}>;
};

export async function runLiferayInventoryWhereUsed(
  config: AppConfig,
  options: WhereUsedOptions,
  dependencies?: WhereUsedDependencies,
): Promise<WhereUsedRunResult> {
  const baseQuery = validateWhereUsedQuery(options as Parameters<typeof validateWhereUsedQuery>[0]);
  const scopeOptions = validateWhereUsedScopeOptions(options);
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(config, apiClient, {
    apiClient,
    tokenClient: dependencies?.tokenClient,
  });
  const sharedDependencies = {apiClient, tokenClient: dependencies?.tokenClient, gateway};
  const query = await resolveWhereUsedQuery(config, baseQuery, options, sharedDependencies);
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
    return whereUsedPlanResultSchema.parse({
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
    });
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

  return whereUsedResultSchema.parse({
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
  });
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
      if (isSkippableWhereUsedCandidateError(candidate, error)) return null;
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

  if (errors.length > 0) result.errors = errors;
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
      {limit: sites.length, excludeSites: scopeOptions.excludedSites, sortBy: 'content'},
      dependencies,
    );

    if (contentStats.mode === 'sites') {
      contentStatsSites = contentStats.sites;
      contentStatsSkippedSites = contentStats.skippedSites;
    }
  }

  const input: WhereUsedSiteSelectionInput = {
    sites,
    ...(siteOptions && siteOptions.length > 0 ? {explicitSites: siteOptions} : {}),
    siteOrder: scopeOptions.siteOrder,
    ...(scopeOptions.siteLimit !== undefined ? {siteLimit: scopeOptions.siteLimit} : {}),
    excludedSites: scopeOptions.excludedSites,
    ...(contentStatsSites ? {contentStatsSites} : {}),
    ...(contentStatsSkippedSites ? {contentStatsSkippedSites} : {}),
  };

  return selectWhereUsedSites(input);
}
