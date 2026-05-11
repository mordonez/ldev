import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {CliError} from '../../../core/errors.js';
import {matchesAdtRow, matchesDdmTemplate} from '../liferay-identifiers.js';
import {buildSiteChain} from '../portal/site-resolution.js';
import {listDdmTemplates, resolveResourceSite, type DdmTemplatePayload} from '../portal/template-queries.js';
import {runLiferayResourceListAdts, type LiferayResourceAdtRow} from '../resource/liferay-resource-list-adts.js';
import {
  runLiferayResourceListFragments,
  type LiferayResourceFragmentRow,
} from '../resource/liferay-resource-list-fragments.js';
import {runLiferayInventoryTemplates} from './liferay-inventory-templates.js';
import {runLiferayInventorySitesIncludingGlobal} from './liferay-inventory-sites.js';
import type {WhereUsedQuery} from './liferay-inventory-where-used-match.js';

type WhereUsedResolverOptions = {
  sites?: string[];
  widgetType?: string;
  className?: string;
};

type WhereUsedResolverDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

type WhereUsedAdtReference = {
  displayStyle: string;
  templateKey: string;
};

type WhereUsedAdtRowReference = Pick<LiferayResourceAdtRow, 'templateId' | 'templateKey' | 'displayName' | 'adtName'>;
type WhereUsedFragmentRowReference = Pick<LiferayResourceFragmentRow, 'fragmentKey' | 'fragmentName'>;
type WhereUsedTemplateRowReference = Pick<
  DdmTemplatePayload,
  'templateId' | 'templateKey' | 'externalReferenceCode' | 'nameCurrentValue' | 'name'
>;
type WhereUsedSearchSite = {siteId: number; siteFriendlyUrl: string; siteName: string};

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

    return {
      type: query.type,
      keys: Array.from(new Set(resolvedKeys)),
    };
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
  if (displayStyle !== '') {
    keys.add(displayStyle);
  }

  const templateKey = adt.templateKey.trim();
  if (templateKey !== '') {
    keys.add(templateKey.startsWith('ddmTemplate_') ? templateKey : `ddmTemplate_${templateKey}`);
  }

  return [...keys];
}

export function collectWhereUsedAdtKeys(rows: WhereUsedAdtRowReference[], identifier: string): string[] {
  const keys = new Set<string>();

  for (const row of rows) {
    if (!matchesAdtRow(row, identifier)) {
      continue;
    }

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

    if (fragmentKey !== '') {
      keys.add(fragmentKey);
    }
  }

  return keys.size > 0 ? [...keys] : [identifier];
}

export function collectWhereUsedTemplateKeys(rows: WhereUsedTemplateRowReference[], identifier: string): string[] {
  const keys = new Set<string>();

  for (const row of rows) {
    if (!matchesDdmTemplate(row, identifier)) {
      continue;
    }

    const templateKey = String(row.templateKey ?? '').trim();
    if (templateKey !== '') {
      keys.add(templateKey);
    }
  }

  return keys.size > 0 ? [...keys] : [identifier];
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

function resolveKeysFromCatalog<T>(
  query: WhereUsedQuery,
  rows: T[],
  resolveKeys: (rows: T[], key: string) => string[],
): WhereUsedQuery {
  const resolvedKeys = query.keys.flatMap((key) => resolveKeys(rows, key));
  return {type: query.type, keys: Array.from(new Set(resolvedKeys))};
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
      {
        site: site.siteFriendlyUrl,
        widgetType: options.widgetType,
        className: options.className,
      },
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
