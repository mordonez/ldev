import {CliError} from '../../../core/errors.js';
import {normalizeFriendlyUrl} from '../portal/site-resolution.js';
import {whereUsedResourceTypes} from './liferay-inventory-evidence-contract.js';
import type {WhereUsedQuery, WhereUsedResourceType} from './liferay-inventory-where-used-match.js';

export const whereUsedSiteOrderValues = ['site', 'name', 'content'] as const;
export type WhereUsedSiteOrder = (typeof whereUsedSiteOrderValues)[number];

export type ValidatedWhereUsedScopeOptions = {
  siteOrder: WhereUsedSiteOrder;
  siteLimit?: number;
  excludedSites: string[];
  plan: boolean;
};

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
    throw new CliError('Provide at least one --key value to look up.', {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
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
