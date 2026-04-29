import {buildDisplayPageUrl as buildDisplayPageUrlInternal} from './liferay-inventory-display-page-url.js';

export function buildPortalAbsoluteUrl(baseUrl: string | undefined, pathOrUrl: string): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  try {
    return new URL(pathOrUrl, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function buildDisplayPageUrl(siteFriendlyUrl: string, friendlyUrlPath: string | undefined): string | null {
  return buildDisplayPageUrlInternal(siteFriendlyUrl, friendlyUrlPath);
}
