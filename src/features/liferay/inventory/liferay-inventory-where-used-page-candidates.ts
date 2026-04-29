import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {isCliError} from '../../../core/errors.js';
import {runLiferayInventoryPages, type LiferayInventoryPagesNode} from './liferay-inventory-pages.js';
import type {LiferayInventorySite} from './liferay-inventory-sites.js';
import {collectDisplayPageCandidates} from './liferay-inventory-where-used-display-pages.js';
import type {WhereUsedQuery} from './liferay-inventory-where-used-match.js';
import {flattenPages, type FlatPage} from './liferay-inventory-where-used-pages.js';

export type WhereUsedPageCandidateOrigin = 'layout' | 'headlessStructuredContent' | 'jsonwsJournal';

export type WhereUsedPageCandidate = FlatPage & {
  origin: WhereUsedPageCandidateOrigin;
};

type WhereUsedPageSource = {
  collect: (
    config: AppConfig,
    site: LiferayInventorySite,
    query: WhereUsedQuery,
    context: WhereUsedPageCandidateContext,
  ) => Promise<WhereUsedPageCandidate[]>;
};

export type WhereUsedPageCandidateContext = {
  layoutScopes: boolean[];
  maxDepth: number;
  concurrency: number;
  pageSize: number;
  dependencies: {
    apiClient?: HttpApiClient;
    tokenClient?: OAuthTokenClient;
  };
};

const WHERE_USED_PAGE_SOURCES: WhereUsedPageSource[] = [
  {collect: collectLayoutPageCandidates},
  {collect: collectStructuredContentDisplayPageCandidates},
];

export async function collectWhereUsedPageCandidates(
  config: AppConfig,
  site: LiferayInventorySite,
  query: WhereUsedQuery,
  context: WhereUsedPageCandidateContext,
): Promise<WhereUsedPageCandidate[]> {
  const candidates: WhereUsedPageCandidate[] = [];

  for (const source of WHERE_USED_PAGE_SOURCES) {
    const sourceCandidates = await source.collect(config, site, query, context);
    candidates.push(...sourceCandidates);
  }

  return dedupePageCandidates(candidates);
}

async function collectLayoutPageCandidates(
  config: AppConfig,
  site: LiferayInventorySite,
  _query: WhereUsedQuery,
  context: WhereUsedPageCandidateContext,
): Promise<WhereUsedPageCandidate[]> {
  const candidates: WhereUsedPageCandidate[] = [];

  for (const privateLayout of context.layoutScopes) {
    let pages: LiferayInventoryPagesNode[];
    try {
      const pagesResult = await runLiferayInventoryPages(
        config,
        {site: site.siteFriendlyUrl, privateLayout, maxDepth: context.maxDepth},
        context.dependencies,
      );
      pages = pagesResult.pages;
    } catch (error) {
      if (isSkippablePageSourceError(error)) continue;
      throw error;
    }

    candidates.push(...flattenPages(pages, privateLayout).map((page) => ({...page, origin: 'layout' as const})));
  }

  return candidates;
}

async function collectStructuredContentDisplayPageCandidates(
  config: AppConfig,
  site: LiferayInventorySite,
  query: WhereUsedQuery,
  context: WhereUsedPageCandidateContext,
): Promise<WhereUsedPageCandidate[]> {
  if (query.type !== 'structure' && query.type !== 'template') {
    return [];
  }

  const displayPages = await collectDisplayPageCandidates(config, site, {
    concurrency: context.concurrency,
    pageSize: context.pageSize,
    dependencies: context.dependencies,
  });

  return displayPages.map((candidate) => ({
    fullUrl: candidate.fullUrl,
    friendlyUrl: candidate.fullUrl,
    name: candidate.fullUrl,
    layoutId: -1,
    plid: -1,
    hidden: false,
    privateLayout: false,
    origin: candidate.origin,
  }));
}

function dedupePageCandidates(candidates: WhereUsedPageCandidate[]): WhereUsedPageCandidate[] {
  const unique = new Map<string, WhereUsedPageCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.privateLayout ? 'private' : 'public'}:${candidate.fullUrl}`;
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }

  return [...unique.values()];
}

function isSkippablePageSourceError(error: unknown): boolean {
  if (!isCliError(error)) return false;
  if (error.code !== 'LIFERAY_INVENTORY_ERROR' && error.code !== 'LIFERAY_GATEWAY_ERROR') {
    return false;
  }
  return error.message.includes('status=403') || error.message.includes('status=404');
}
