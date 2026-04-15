import {trimLeadingSlash} from '../../../core/utils/text.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {asRecord} from './liferay-inventory-page-assemble.js';
import {safeGatewayGet} from './liferay-inventory-page-fetch-http.js';
import {tryFetchFragmentEntryLinks} from './liferay-inventory-page-fetch-fragments.js';

async function fetchSitePageElement(
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
): Promise<Record<string, unknown> | null> {
  const slug = trimLeadingSlash(friendlyUrl);
  const response = await safeGatewayGet<Record<string, unknown>>(
    gateway,
    `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${encodeURIComponent(slug)}?fields=pageDefinition`,
    'fetch-site-page-element',
  );
  if (!response.ok) {
    return null;
  }
  return asRecord(asRecord(response.data).pageDefinition).pageElement as Record<string, unknown> | null;
}

async function tryFetchSitePageMetadata(
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
): Promise<Record<string, unknown> | null> {
  try {
    const slug = trimLeadingSlash(friendlyUrl);
    const response = await safeGatewayGet<Record<string, unknown>>(
      gateway,
      `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${encodeURIComponent(slug)}?nestedFields=taxonomyCategoryBriefs`,
      'fetch-site-page-metadata',
    );
    if (!response.ok || !response.data) {
      return null;
    }
    return asRecord(response.data);
  } catch {
    return null;
  }
}

export async function fetchComponentPageData(
  gateway: LiferayGateway,
  siteId: number,
  canonicalFriendlyUrl: string,
  plid: number,
): Promise<{
  pageElement: Record<string, unknown> | null;
  pageMetadata: Record<string, unknown> | null;
  rawFragmentLinks: Array<Record<string, unknown>>;
}> {
  const pageElement = await fetchSitePageElement(gateway, siteId, canonicalFriendlyUrl);
  const pageMetadata = await tryFetchSitePageMetadata(gateway, siteId, canonicalFriendlyUrl);
  const rawFragmentLinks = await tryFetchFragmentEntryLinks(gateway, siteId, plid);

  return {pageElement, pageMetadata, rawFragmentLinks};
}
