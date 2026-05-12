import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {CliError} from '../../../core/errors.js';
import {whereUsedResourceTypes} from '../../../core/contracts/inventory.schema.js';
import type {WhereUsedQuery, WhereUsedResourceType} from '../../../core/contracts/inventory.schema.js';
import type {ContentStatsSite} from '../content/liferay-content-stats.js';
import {matchesAdtRow, matchesDdmTemplate} from '../liferay-identifiers.js';
import {buildSiteChain, normalizeFriendlyUrl} from '../portal/site-resolution.js';
import {listDdmTemplates, resolveResourceSite, type DdmTemplatePayload} from '../portal/template-queries.js';
import {runLiferayResourceListAdts, type LiferayResourceAdtRow} from '../resource/liferay-resource-list-adts.js';
import {
  runLiferayResourceListFragments,
  type LiferayResourceFragmentRow,
} from '../resource/liferay-resource-list-fragments.js';
import {runLiferayInventoryTemplates} from './liferay-inventory-templates.js';
import {
  buildPagesCommand,
  runLiferayInventorySitesIncludingGlobal,
  type LiferayInventorySite,
} from './liferay-inventory-sites.js';

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

// ── Resolver types ────────────────────────────────────────────────────────────

type WhereUsedResolverOptions = {sites?: string[]; widgetType?: string; className?: string};
type WhereUsedResolverDependencies = {apiClient?: HttpApiClient; tokenClient?: OAuthTokenClient};
type WhereUsedAdtReference = {displayStyle: string; templateKey: string};
type WhereUsedAdtRowReference = Pick<LiferayResourceAdtRow, 'templateId' | 'templateKey' | 'displayName' | 'adtName'>;
type WhereUsedFragmentRowReference = Pick<LiferayResourceFragmentRow, 'fragmentKey' | 'fragmentName'>;
type WhereUsedTemplateRowReference = Pick<
  DdmTemplatePayload,
  'templateId' | 'templateKey' | 'externalReferenceCode' | 'nameCurrentValue' | 'name'
>;
type WhereUsedSearchSite = {siteId: number; siteFriendlyUrl: string; siteName: string};

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

// ── Query resolution ──────────────────────────────────────────────────────────

export async function resolveWhereUsedQuery(
  config: AppConfig,
  query: WhereUsedQuery,
  options: WhereUsedResolverOptions,
  dependencies: WhereUsedResolverDependencies,
): Promise<WhereUsedQuery> {
  if (query.type === 'adt') {
    const resolvedKeys: string[] = [];
    for (const key of query.keys) {
      const rows = await collectWhereUsedAdtRows(config, key, options, dependencies);
      resolvedKeys.push(...collectWhereUsedAdtKeys(rows, key));
    }
    return {type: query.type, keys: Array.from(new Set(resolvedKeys))};
  }

  if (query.type === 'fragment') {
    const rows = await collectWhereUsedFragmentRows(config, options, dependencies);
    return resolveKeysFromCatalog(query, rows, collectWhereUsedFragmentKeys);
  }

  if (query.type === 'template') {
    const rows = await collectWhereUsedTemplateRows(config, options, dependencies);
    return resolveKeysFromCatalog(query, rows, collectWhereUsedTemplateKeys);
  }

  return query;
}

export function buildWhereUsedAdtKeys(adt: WhereUsedAdtReference): string[] {
  const keys = new Set<string>();
  const displayStyle = adt.displayStyle.trim();
  if (displayStyle !== '') keys.add(displayStyle);
  const templateKey = adt.templateKey.trim();
  if (templateKey !== '') keys.add(templateKey.startsWith('ddmTemplate_') ? templateKey : `ddmTemplate_${templateKey}`);
  return [...keys];
}

export function collectWhereUsedAdtKeys(rows: WhereUsedAdtRowReference[], identifier: string): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (!matchesAdtRow(row, identifier)) continue;
    for (const key of buildWhereUsedAdtKeys({
      displayStyle: `ddmTemplate_${String(row.templateId).trim()}`,
      templateKey: row.templateKey,
    })) {
      keys.add(key);
    }
  }
  if (keys.size === 0) {
    throw new CliError(`ADT not found: ${identifier}`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }
  return [...keys];
}

export function collectWhereUsedFragmentKeys(rows: WhereUsedFragmentRowReference[], identifier: string): string[] {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const keys = new Set<string>();
  for (const row of rows) {
    const fragmentKey = row.fragmentKey.trim();
    const fragmentName = row.fragmentName.trim();
    if (fragmentKey.toLowerCase() !== normalizedIdentifier && fragmentName.toLowerCase() !== normalizedIdentifier) {
      continue;
    }
    if (fragmentKey !== '') keys.add(fragmentKey);
  }
  return keys.size > 0 ? [...keys] : [identifier];
}

export function collectWhereUsedTemplateKeys(rows: WhereUsedTemplateRowReference[], identifier: string): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (!matchesDdmTemplate(row, identifier)) continue;
    const templateKey = String(row.templateKey ?? '').trim();
    if (templateKey !== '') keys.add(templateKey);
  }
  return keys.size > 0 ? [...keys] : [identifier];
}

// ── Private helpers ───────────────────────────────────────────────────────────

function resolveKeysFromCatalog<T>(
  query: WhereUsedQuery,
  rows: T[],
  resolveKeys: (rows: T[], key: string) => string[],
): WhereUsedQuery {
  const resolvedKeys = query.keys.flatMap((key) => resolveKeys(rows, key));
  return {type: query.type, keys: Array.from(new Set(resolvedKeys))};
}

async function resolveSearchSites(
  config: AppConfig,
  options: Pick<WhereUsedResolverOptions, 'sites'>,
  dependencies: WhereUsedResolverDependencies,
): Promise<WhereUsedSearchSite[]> {
  if (options.sites?.length) {
    return collectExplicitWhereUsedSites(config, options.sites, dependencies);
  }
  return (await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies)).map((site) => ({
    siteId: site.groupId,
    siteFriendlyUrl: site.siteFriendlyUrl,
    siteName: site.name,
  }));
}

async function collectWhereUsedAdtRows(
  config: AppConfig,
  identifier: string,
  options: Pick<WhereUsedResolverOptions, 'sites' | 'widgetType' | 'className'>,
  dependencies: WhereUsedResolverDependencies,
): Promise<LiferayResourceAdtRow[]> {
  const searchSites = await resolveSearchSites(config, options, dependencies);
  const rows: LiferayResourceAdtRow[] = [];
  for (const site of searchSites) {
    const siteRows = await runLiferayResourceListAdts(
      config,
      {site: site.siteFriendlyUrl, widgetType: options.widgetType, className: options.className},
      dependencies,
    );
    rows.push(...siteRows.filter((row) => matchesAdtRow(row, identifier)));
  }
  return rows;
}

async function collectWhereUsedFragmentRows(
  config: AppConfig,
  options: Pick<WhereUsedResolverOptions, 'sites'>,
  dependencies: WhereUsedResolverDependencies,
): Promise<LiferayResourceFragmentRow[]> {
  const searchSites = await resolveSearchSites(config, options, dependencies);
  const rows: LiferayResourceFragmentRow[] = [];
  for (const site of searchSites) {
    rows.push(...(await runLiferayResourceListFragments(config, {site: site.siteFriendlyUrl}, dependencies)));
  }
  return rows;
}

async function collectWhereUsedTemplateRows(
  config: AppConfig,
  options: Pick<WhereUsedResolverOptions, 'sites'>,
  dependencies: WhereUsedResolverDependencies,
): Promise<WhereUsedTemplateRowReference[]> {
  const searchSites = await resolveSearchSites(config, options, dependencies);
  const rows: WhereUsedTemplateRowReference[] = [];
  for (const site of searchSites) {
    const resolvedSite = await resolveResourceSite(config, site.siteFriendlyUrl, dependencies);
    const ddmRows = await listDdmTemplates(config, resolvedSite, dependencies, {
      includeCompanyFallback: site.siteFriendlyUrl === '/global',
    });
    if (ddmRows.length > 0) {
      rows.push(...ddmRows);
      continue;
    }
    const inventoryRows = await runLiferayInventoryTemplates(
      config,
      {site: resolvedSite.friendlyUrlPath},
      dependencies,
    );
    rows.push(
      ...inventoryRows.map((row) => ({
        templateId: row.id,
        templateKey: row.externalReferenceCode || row.id,
        externalReferenceCode: row.externalReferenceCode,
        nameCurrentValue: row.name,
        name: row.name,
      })),
    );
  }
  return rows;
}

async function collectExplicitWhereUsedSites(
  config: AppConfig,
  sites: string[],
  dependencies: WhereUsedResolverDependencies,
): Promise<WhereUsedSearchSite[]> {
  const uniqueSites = new Map<string, WhereUsedSearchSite>();
  for (const site of sites) {
    const siteChain = await buildSiteChain(config, site, dependencies);
    for (const entry of siteChain) {
      if (!uniqueSites.has(entry.siteFriendlyUrl)) {
        uniqueSites.set(entry.siteFriendlyUrl, entry);
      }
    }
  }
  return [...uniqueSites.values()];
}
