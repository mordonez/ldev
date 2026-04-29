import type {LiferayGateway} from '../liferay-gateway.js';
import {
  fetchHeadlessSitePageElement,
  fetchHeadlessSitePageMetadata,
  type HeadlessPageElementPayload,
  type HeadlessSitePagePayload,
} from '../page-layout/liferay-site-page-shared.js';

export async function fetchComponentPageData(
  gateway: LiferayGateway,
  siteId: number,
  canonicalFriendlyUrl: string,
): Promise<{
  pageElement: HeadlessPageElementPayload | null;
  pageMetadata: HeadlessSitePagePayload | null;
}> {
  const pageElement = await fetchHeadlessSitePageElement(gateway, siteId, canonicalFriendlyUrl);
  const pageMetadata = await fetchHeadlessSitePageMetadata(gateway, siteId, canonicalFriendlyUrl);

  return {pageElement, pageMetadata};
}
