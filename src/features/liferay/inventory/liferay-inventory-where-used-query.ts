import {CliError} from '../../../core/errors.js';
import {whereUsedResourceTypes} from '../../../core/contracts/inventory.schema.js';
import type {WhereUsedQuery, WhereUsedResourceType} from '../../../core/contracts/inventory.schema.js';
import type {ContentStatsSite} from '../content/liferay-content-stats.js';
import {normalizeFriendlyUrl} from '../portal/site-resolution.js';
import {buildPagesCommand, type LiferayInventorySite} from './liferay-inventory-sites.js';

// ── Validation types ──────────────────────────────────────────────────────────

export const whereUsedSiteOrderValues = ['site', 'name', 'content'] as const;

export type WhereUsedSiteOrder = (typeof whereUsedSiteOrderValues)[number];

export type ValidatedWhereUsedScopeOptions = {
  siteOrder: WhereUsedSiteOrder;
  siteLimit?: number;
  excludedSites: string[];
  plan: boolean;
};

// ── Site selection types ──────────────────────────────────────────────────────

export type WhereUsedPlanSite = {
  rank: number;
  siteFriendlyUrl: string;
  siteName: string;
  groupId: number;
  structuredContents?: number;
  selectionReason: 'explicitSite' | 'siteOrder' | 'contentOrder';
};

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

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_RESOURCE_TYPES: WhereUsedResourceType[] = [...whereUsedResourceTypes];
const VALID_SITE_ORDERS: WhereUsedSiteOrder[] = [...whereUsedSiteOrderValues];

export function validateWhereUsedQuery(options: {type: WhereUsedResourceType; keys: string[]}): WhereUsedQuery {
  if (!VALID_RESOURCE_TYPES.includes(options.type)) {
    throw new CliError(`--type must be one of: ${VALID_RESOURCE_TYPES.join(', ')}.`, {code: 'LIFERAY_INVENTORY_ERROR'});
  }

  const cleanedKeys = options.keys
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter((key) => key.length > 0);

  if (cleanedKeys.length === 0) {
    throw new CliError('Provide at least one --key value to look up.', {code: 'LIFERAY_INVENTORY_ERROR'});
  }

  return {type: options.type, keys: Array.from(new Set(cleanedKeys))};
}

export function validateWhereUsedScopeOptions(options: {
  siteOrder?: string;
  siteLimit?: number;
  excludeSites?: string[];
  plan?: boolean;
}): ValidatedWhereUsedScopeOptions {
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

// ── Site selection ────────────────────────────────────────────────────────────

export function selectWhereUsedSites(input: WhereUsedSiteSelectionInput): WhereUsedSiteSelection {
  if (input.explicitSites && input.explicitSites.length > 0) {
    const explicitSites = input.explicitSites.map((site) => site.trim()).filter((site) => site !== '');
    const selectedSites = explicitSites.map(
      (explicitSite) =>
        input.sites.find(
          (site) =>
            site.siteFriendlyUrl === explicitSite ||
            site.siteFriendlyUrl === `/${explicitSite}` ||
            String(site.groupId) === explicitSite,
        ) ?? {
          groupId: -1,
          siteFriendlyUrl: explicitSite.startsWith('/') ? explicitSite : `/${explicitSite}`,
          name: explicitSite,
          pagesCommand: buildPagesCommand(explicitSite),
        },
    );

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
      if (leftCount !== undefined && rightCount !== undefined && leftCount !== rightCount)
        return rightCount - leftCount;
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
