import {CliError} from '../../../core/errors.js';

export type InventoryPageRoute = 'siteRoot' | 'displayPage' | 'regularPage';

export type InventoryPageRequest = {
  siteSlug: string;
  friendlyUrl: string;
  privateLayout: boolean;
  route: InventoryPageRoute;
  displayPageUrlTitle: string | null;
  localeHint?: string;
};

export function resolveInventoryPageRequest(options: {
  url?: string;
  site?: string;
  friendlyUrl?: string;
  privateLayout?: boolean;
}): InventoryPageRequest {
  const sanitizedUrl = sanitizeInventoryUrl(options.url);

  if (sanitizedUrl) {
    // Handle locale-prefixed URLs: /{locale}/web/{site}/{page} or /{locale}/group/{site}/{page}
    const localeMatch = sanitizedUrl.match(/^\/([a-z]{2}(?:_[A-Z]{2})?)(\/(?:web|group)\/.*)$/);
    if (localeMatch) {
      const localePrefix = localeMatch[1];
      const rest = localeMatch[2];
      const localeHint = normalizeLocale(localePrefix);
      if (rest.startsWith('/web/')) {
        return {...buildUrlRequest(rest, '/web/', false), localeHint};
      }
      if (rest.startsWith('/group/')) {
        return {...buildUrlRequest(rest, '/group/', true), localeHint};
      }
    }

    if (sanitizedUrl.startsWith('/web/')) {
      return buildUrlRequest(sanitizedUrl, '/web/', false);
    }

    if (sanitizedUrl.startsWith('/group/')) {
      return buildUrlRequest(sanitizedUrl, '/group/', true);
    }

    return buildRequest('global', ensureLeadingSlash(sanitizedUrl), false);
  }

  if (options.site && options.friendlyUrl) {
    return buildRequest(
      options.site.startsWith('/') ? options.site.slice(1) : options.site,
      ensureLeadingSlash(sanitizeInventoryUrl(options.friendlyUrl) ?? options.friendlyUrl),
      options.privateLayout ?? false,
    );
  }

  throw new CliError('Provide --url or both --site and --friendly-url.', {
    code: 'LIFERAY_INVENTORY_ERROR',
  });
}

function buildRequest(siteSlug: string, friendlyUrl: string, privateLayout: boolean): InventoryPageRequest {
  if (friendlyUrl === '/') {
    return {
      siteSlug,
      friendlyUrl,
      privateLayout,
      route: 'siteRoot',
      displayPageUrlTitle: null,
    };
  }

  const displayPageUrlTitle = extractDisplayPageUrlTitle(friendlyUrl);
  if (displayPageUrlTitle) {
    return {
      siteSlug,
      friendlyUrl,
      privateLayout,
      route: 'displayPage',
      displayPageUrlTitle,
    };
  }

  return {
    siteSlug,
    friendlyUrl,
    privateLayout,
    route: 'regularPage',
    displayPageUrlTitle: null,
  };
}

function buildUrlRequest(url: string, prefix: '/web/' | '/group/', privateLayout: boolean): InventoryPageRequest {
  const nextSlash = url.indexOf('/', prefix.length);
  const siteSlug = url.slice(prefix.length, nextSlash > 0 ? nextSlash : url.length);
  const friendlyUrl = nextSlash > 0 ? url.slice(nextSlash) : '/';
  return buildRequest(siteSlug, ensureLeadingSlash(friendlyUrl), privateLayout);
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

function extractDisplayPageUrlTitle(friendlyUrl: string): string | null {
  const candidate = friendlyUrl.startsWith('/') ? friendlyUrl.slice(1) : friendlyUrl;
  if (!candidate.startsWith('w/')) {
    return null;
  }
  return candidate.slice(2);
}
