import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {mapConcurrent} from '../../../core/concurrency.js';
import {CliError} from '../../../core/errors.js';
import {runLiferayResourceGetAdt} from '../resource/liferay-resource-get-adt.js';
import {whereUsedResourceTypes} from './liferay-inventory-evidence-contract.js';
import {extractPageEvidence} from './liferay-inventory-page-evidence.js';
import {resolveInventoryPageRequest, runLiferayInventoryPage} from './liferay-inventory-page.js';
import {createInventoryGateway} from './liferay-inventory-shared.js';
import {runLiferayInventorySitesIncludingGlobal, type LiferayInventorySite} from './liferay-inventory-sites.js';
import {
  matchEvidenceAgainstResource,
  type WhereUsedQuery,
  type WhereUsedResourceType,
} from './liferay-inventory-where-used-match.js';
import {validateWhereUsedResult} from './liferay-inventory-where-used-schema.js';
import {buildPageMatch, type WhereUsedPageMatch} from './liferay-inventory-where-used-pages.js';
import {collectWhereUsedPageCandidates} from './liferay-inventory-where-used-page-candidates.js';

export {matchEvidenceAgainstResource, matchPageAgainstResource} from './liferay-inventory-where-used-match.js';
export {formatLiferayInventoryWhereUsed} from './liferay-inventory-where-used-format.js';
export {validateWhereUsedResult} from './liferay-inventory-where-used-schema.js';
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
  widgetType?: string;
  className?: string;
  includePrivate?: boolean;
  maxDepth?: number;
  concurrency?: number;
  pageSize?: number;
};

export type WhereUsedDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
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

const VALID_RESOURCE_TYPES: WhereUsedResourceType[] = [...whereUsedResourceTypes];

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
  const baseQuery = validateWhereUsedQuery(options);
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

  const targetSites = await resolveTargetSites(config, options.site, options.pageSize, sharedDependencies);
  const layoutScopes: boolean[] = includePrivate ? [false, true] : [false];

  const siteResults: WhereUsedSiteResult[] = [];
  for (const site of targetSites) {
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
      sites: targetSites.map((site) => site.siteFriendlyUrl),
      includePrivate,
      concurrency,
      maxDepth,
    },
    summary: summarize(siteResults),
    sites: siteResults,
  }) as WhereUsedResult;
}

async function resolveWhereUsedQuery(
  config: AppConfig,
  query: WhereUsedQuery,
  options: WhereUsedOptions,
  dependencies: WhereUsedDependencies,
): Promise<WhereUsedQuery> {
  if (query.type !== 'adt') {
    return query;
  }

  const resolvedKeys: string[] = [];

  for (const key of query.keys) {
    const adt = await runLiferayResourceGetAdt(
      config,
      {
        site: options.site,
        key,
        widgetType: options.widgetType,
        className: options.className,
      },
      dependencies,
    );
    resolvedKeys.push(adt.displayStyle);
  }

  return {
    type: query.type,
    keys: Array.from(new Set(resolvedKeys)),
  };
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
