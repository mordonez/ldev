import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {fetchLayoutsByParent, type Layout} from '../page-layout/liferay-layout-shared.js';
import {classNameIdLookupCache} from '../lookup-cache.js';
import {safeGatewayGet} from './liferay-inventory-shared.js';
import {KNOWN_LOCALES} from './liferay-inventory-page-url.js';

export type LayoutMatch = {layout: Layout; locale: string | null};

export async function resolveClassNameId(
  config: AppConfig,
  gateway: LiferayGateway,
  className: string,
): Promise<number> {
  const cacheKey = `${config.liferay.url}|${className}`;
  const cached = classNameIdLookupCache.get(cacheKey);
  if (cached && cached > 0) {
    return cached;
  }

  const response = await safeGatewayGet<Record<string, unknown>>(
    gateway,
    `/api/jsonws/classname/fetch-class-name?value=${encodeURIComponent(className)}`,
    'fetch-class-name',
  );
  const resolved = Number(response.data?.classNameId ?? -1);
  if (!response.ok || resolved <= 0) {
    throw LiferayErrors.inventoryError(
      `Unable to resolve classNameId for ${className}. Verify JSONWS access to /api/jsonws/classname/fetch-class-name and portal credentials/permissions.`,
    );
  }

  classNameIdLookupCache.set(cacheKey, resolved);
  return resolved;
}

export async function findLayoutByFriendlyUrl(
  gateway: LiferayGateway,
  groupId: number,
  friendlyUrl: string,
  privateLayout: boolean,
  localeHint?: string,
): Promise<LayoutMatch | null> {
  // 1. Try exact match via recursive tree search (canonical URL, fast)
  const canonical = await findLayoutByFriendlyUrlRecursive(gateway, groupId, friendlyUrl, privateLayout, 0);
  if (canonical) {
    return {layout: canonical, locale: null};
  }

  // 2. If a locale hint is available (from URL prefix like /es/web/...), use targeted JSONWS lookup
  if (localeHint) {
    const localeCandidates = [localeHint, ...KNOWN_LOCALES.filter((candidate) => candidate !== localeHint)];
    for (const candidateLocale of localeCandidates) {
      const match = await findLayoutByLocaleFriendlyUrl(gateway, groupId, friendlyUrl, privateLayout, candidateLocale);
      if (match) {
        return match;
      }
    }
  }

  // 3. Last resort for localized friendly URLs without a locale prefix.
  // Try common locales and map the localized URL back to the canonical layout.
  for (const candidateLocale of KNOWN_LOCALES) {
    const match = await findLayoutByLocaleFriendlyUrl(gateway, groupId, friendlyUrl, privateLayout, candidateLocale);
    if (match) {
      return match;
    }
  }

  return null;
}

async function findLayoutByLocaleFriendlyUrl(
  gateway: LiferayGateway,
  groupId: number,
  friendlyUrl: string,
  privateLayout: boolean,
  languageId: string,
): Promise<LayoutMatch | null> {
  if (privateLayout) {
    return null;
  }

  const plid = await findLocalizedPagePlid(gateway, groupId, friendlyUrl, languageId);
  if (plid <= 0) {
    return null;
  }
  const layout = await findLayoutByPlidRecursive(gateway, groupId, privateLayout, 0, plid);
  return layout ? {layout, locale: languageId} : null;
}

async function findLocalizedPagePlid(
  gateway: LiferayGateway,
  groupId: number,
  friendlyUrl: string,
  languageId: string,
): Promise<number> {
  let page = 1;
  let lastPage = 1;
  const acceptLanguage = languageId.replace('_', '-');

  while (page <= lastPage) {
    const response = await safeGatewayGet<{
      items?: Array<{id?: number; friendlyUrlPath?: string}>;
      lastPage?: number;
    }>(
      gateway,
      `/o/headless-delivery/v1.0/sites/${groupId}/site-pages?page=${page}&pageSize=100`,
      `list-site-pages-${page}`,
      {headers: {'Accept-Language': acceptLanguage}},
    );

    if (!response.ok || !response.data) {
      return -1;
    }

    const items = Array.isArray(response.data.items) ? response.data.items : [];
    const match = items.find((item) => String(item.friendlyUrlPath ?? '').trim() === friendlyUrl);
    if (match?.id) {
      return Number(match.id);
    }

    lastPage = Number(response.data.lastPage ?? 1) || 1;
    page += 1;
  }

  return -1;
}

async function findLayoutByFriendlyUrlRecursive(
  gateway: LiferayGateway,
  groupId: number,
  friendlyUrl: string,
  privateLayout: boolean,
  parentLayoutId: number,
): Promise<Layout | null> {
  const layouts = await fetchLayoutsByParent(gateway, groupId, privateLayout, parentLayoutId);

  for (const layout of layouts) {
    if ((layout.friendlyURL ?? '') === friendlyUrl) {
      return layout;
    }
  }

  for (const layout of layouts) {
    const child = await findLayoutByFriendlyUrlRecursive(
      gateway,
      groupId,
      friendlyUrl,
      privateLayout,
      layout.layoutId ?? 0,
    );
    if (child) {
      return child;
    }
  }

  return null;
}

export async function findLayoutByPlidRecursive(
  gateway: LiferayGateway,
  groupId: number,
  privateLayout: boolean,
  parentLayoutId: number,
  plid: number,
): Promise<Layout | null> {
  const layouts = await fetchLayoutsByParent(gateway, groupId, privateLayout, parentLayoutId);

  for (const layout of layouts) {
    if (Number(layout.plid ?? -1) === plid) {
      return layout;
    }
  }

  for (const layout of layouts) {
    const child = await findLayoutByPlidRecursive(gateway, groupId, privateLayout, Number(layout.layoutId ?? 0), plid);
    if (child) {
      return child;
    }
  }

  return null;
}
