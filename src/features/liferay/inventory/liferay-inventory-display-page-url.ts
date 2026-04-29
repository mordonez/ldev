import {buildPageUrl} from '../page-layout/liferay-layout-shared.js';

export function extractDisplayPageUrlTitle(friendlyUrl: string): string | null {
  const candidate = friendlyUrl.startsWith('/') ? friendlyUrl.slice(1) : friendlyUrl;
  if (!candidate.startsWith('w/') || candidate.length <= 2) {
    return null;
  }

  return decodeDisplayPageUrlTitle(candidate.slice(2));
}

export function buildDisplayPageFriendlyUrl(urlTitleOrPath: string | undefined): string | null {
  const normalizedUrlTitle = normalizeDisplayPageUrlTitle(urlTitleOrPath);
  if (!normalizedUrlTitle) {
    return null;
  }

  return `/w/${normalizedUrlTitle}`;
}

export function buildDisplayPageUrl(siteFriendlyUrl: string, friendlyUrlPath: string | undefined): string | null {
  const friendlyUrl = buildDisplayPageFriendlyUrl(friendlyUrlPath);
  if (!friendlyUrl) {
    return null;
  }

  return buildPageUrl(siteFriendlyUrl, friendlyUrl, false);
}

function normalizeDisplayPageUrlTitle(urlTitleOrPath: string | undefined): string | null {
  const urlTitle = String(urlTitleOrPath ?? '')
    .trim()
    .replace(/^\/+/, '');

  return urlTitle || null;
}

function decodeDisplayPageUrlTitle(urlTitle: string): string {
  try {
    return decodeURIComponent(urlTitle);
  } catch {
    return urlTitle;
  }
}
