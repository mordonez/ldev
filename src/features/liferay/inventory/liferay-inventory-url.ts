import {buildPageUrl} from '../page-layout/liferay-layout-shared.js';

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
  const urlTitle = String(friendlyUrlPath ?? '')
    .trim()
    .replace(/^\/+/, '');
  if (!urlTitle) {
    return null;
  }
  return buildPageUrl(siteFriendlyUrl, `/w/${urlTitle}`, false);
}
