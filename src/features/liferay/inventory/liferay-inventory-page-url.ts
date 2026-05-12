import {LiferayErrors} from '../errors/index.js';
import {extractDisplayPageUrlTitle} from './liferay-inventory-display-page-url.js';

export type InventoryPageOptions = {
  url?: string;
  site?: string;
  friendlyUrl?: string;
  privateLayout?: boolean;
};

export type InventoryPageRequest =
  | {kind: 'portalHome'}
  | {kind: 'publicSiteRoot'; site: string; resolveHomeRedirect: boolean}
  | {kind: 'privateSiteRoot'; site: string; resolveHomeRedirect: boolean}
  | {kind: 'webContentDisplayPage'; site: string; friendlyUrl: string; urlTitle: string}
  | {kind: 'publicRegularPage'; site: string; friendlyUrl: string; localeHint?: string}
  | {kind: 'privateRegularPage'; site: string; friendlyUrl: string; localeHint?: string};

export function resolveInventoryPageRequest(options: InventoryPageOptions): InventoryPageRequest {
  const sanitizedUrl = sanitizeInventoryUrl(options.url);

  if (sanitizedUrl) {
    // Handle locale-prefixed URLs: /{locale}/web/{site}/{page} or /{locale}/group/{site}/{page}
    const localeMatch = sanitizedUrl.match(/^\/([a-z]{2}(?:_[A-Z]{2})?)(\/(?:web|group)\/.*)$/);
    if (localeMatch) {
      const localePrefix = localeMatch[1];
      const rest = localeMatch[2];
      const localeHint = normalizeLocale(localePrefix);
      if (rest.startsWith('/web/')) {
        return addLocaleHint(buildUrlRequest(rest, '/web/', false), localeHint);
      }
      if (rest.startsWith('/group/')) {
        return addLocaleHint(buildUrlRequest(rest, '/group/', true), localeHint);
      }
    }

    if (sanitizedUrl.startsWith('/web/')) {
      return buildUrlRequest(sanitizedUrl, '/web/', false);
    }

    if (sanitizedUrl.startsWith('/group/')) {
      return buildUrlRequest(sanitizedUrl, '/group/', true);
    }

    return buildRequest('', ensureLeadingSlash(sanitizedUrl), false, true);
  }

  if (options.site && options.friendlyUrl) {
    return buildRequest(
      options.site.startsWith('/') ? options.site.slice(1) : options.site,
      ensureLeadingSlash(sanitizeInventoryUrl(options.friendlyUrl) ?? options.friendlyUrl),
      options.privateLayout ?? false,
      false,
    );
  }

  throw LiferayErrors.inventoryError('Provide --url or both --site and --friendly-url.');
}

function buildRequest(
  siteSlug: string,
  friendlyUrl: string,
  privateLayout: boolean,
  resolveHomeRedirect: boolean,
): InventoryPageRequest {
  if (friendlyUrl === '/') {
    return siteSlug === ''
      ? {kind: 'portalHome'}
      : {kind: privateLayout ? 'privateSiteRoot' : 'publicSiteRoot', site: siteSlug, resolveHomeRedirect};
  }

  const displayPageUrlTitle = extractDisplayPageUrlTitle(friendlyUrl);
  if (displayPageUrlTitle) {
    if (!siteSlug) {
      throw LiferayErrors.inventoryError(
        'Display pages (paths starting with /w/) require a site. Use /web/{site}/w/{urlTitle} or --site with --friendly-url.',
      );
    }
    return {
      kind: 'webContentDisplayPage',
      site: siteSlug,
      friendlyUrl,
      urlTitle: displayPageUrlTitle,
    };
  }

  return {
    kind: privateLayout ? 'privateRegularPage' : 'publicRegularPage',
    site: siteSlug,
    friendlyUrl,
  };
}

function buildUrlRequest(url: string, prefix: '/web/' | '/group/', privateLayout: boolean): InventoryPageRequest {
  const nextSlash = url.indexOf('/', prefix.length);
  const siteSlug = url.slice(prefix.length, nextSlash > 0 ? nextSlash : url.length);
  const friendlyUrl = nextSlash > 0 ? url.slice(nextSlash) : '/';
  return buildRequest(siteSlug, ensureLeadingSlash(friendlyUrl), privateLayout, true);
}

function addLocaleHint(request: InventoryPageRequest, localeHint: string): InventoryPageRequest {
  return isRegularPageRequest(request) ? {...request, localeHint} : request;
}

export function isSiteRootRequest(
  request: InventoryPageRequest,
): request is Extract<InventoryPageRequest, {kind: 'publicSiteRoot' | 'privateSiteRoot'}> {
  return request.kind === 'publicSiteRoot' || request.kind === 'privateSiteRoot';
}

export function isRegularPageRequest(
  request: InventoryPageRequest,
): request is Extract<InventoryPageRequest, {kind: 'publicRegularPage' | 'privateRegularPage'}> {
  return request.kind === 'publicRegularPage' || request.kind === 'privateRegularPage';
}

export function privateLayoutForInventoryPageRequest(
  request: Exclude<InventoryPageRequest, {kind: 'portalHome' | 'webContentDisplayPage'}>,
): boolean {
  return request.kind === 'privateSiteRoot' || request.kind === 'privateRegularPage';
}

function sanitizeInventoryUrl(rawUrl?: string): string | null {
  if (!rawUrl) {
    return null;
  }

  let sanitized = rawUrl.trim();
  if (sanitized === '') {
    return null;
  }

  try {
    const uri = new URL(sanitized);
    sanitized = uri.pathname;
  } catch {
    // Keep non-absolute values as they are.
  }

  const fragmentIndex = sanitized.indexOf('#');
  if (fragmentIndex >= 0) {
    sanitized = sanitized.slice(0, fragmentIndex);
  }
  const queryIndex = sanitized.indexOf('?');
  if (queryIndex >= 0) {
    sanitized = sanitized.slice(0, queryIndex);
  }

  return sanitized;
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

// Map 2-letter language codes to Liferay languageId (best-effort, common locales)
const LOCALE_MAP: Record<string, string> = {
  es: 'es_ES',
  ca: 'ca_ES',
  en: 'en_US',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  pt: 'pt_PT',
  nl: 'nl_NL',
  eu: 'eu_ES',
  gl: 'gl_ES',
};

export const KNOWN_LOCALES = Array.from(new Set(Object.values(LOCALE_MAP)));

function normalizeLocale(locale: string): string {
  if (locale.includes('_')) {
    return locale; // already full locale like es_ES
  }
  return LOCALE_MAP[locale] ?? locale;
}
