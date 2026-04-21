import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {toBooleanOrFalse} from '../../../core/utils/coerce.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResolvedSite} from './liferay-inventory-shared.js';
import {
  buildLayoutDetails,
  buildPageUrl,
  fetchLayoutsByParent,
  type Layout,
} from '../page-layout/liferay-layout-shared.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {buildJournalArticleAdminUrls, buildLayoutAdminUrls} from '../page-layout/liferay-page-admin-urls.js';
import {
  collectPageElements,
  type ContentStructureSummary,
  type JournalArticleSummary,
  type PageFragmentEntry,
} from './liferay-inventory-page-assemble.js';
import {KNOWN_LOCALES} from './liferay-inventory-page-url.js';
import type {
  LiferayInventoryPageResult,
  PagePortletSummary,
  ResolvedRegularLayoutPage,
} from './liferay-inventory-page.js';
import type {HeadlessSitePagePayload} from '../page-layout/liferay-site-page-shared.js';
import {classNameIdLookupCache} from '../lookup-cache.js';
import {resolveDisplayPageArticle, resolveStructuredContentData} from './liferay-inventory-page-fetch-article.js';
import {safeGatewayGet} from './liferay-inventory-page-fetch-http.js';
import {fetchComponentPageData} from './liferay-inventory-page-fetch-components.js';
import {enrichFragmentEntryExportPaths} from './liferay-inventory-page-fetch-fragments.js';
import {
  buildJournalArticleSummary,
  collectLayoutContentStructures,
  collectLayoutJournalArticles,
} from './liferay-inventory-page-fetch-journal.js';
import {
  buildConfigurationRawLayout,
  buildConfigurationRawSitePage,
  buildRegularPageConfigurationTabs,
  parseTypeSettingsMap,
} from './liferay-inventory-page-fetch-config.js';

type LayoutMatch = {layout: Layout; locale: string | null};

const CLASS_NAME_LAYOUT = 'com.liferay.portal.kernel.model.Layout';
const CLASS_NAME_JOURNAL_ARTICLE = 'com.liferay.journal.model.JournalArticle';

export async function fetchSiteRootInventory(
  gateway: LiferayGateway,
  site: ResolvedSite,
  privateLayout: boolean,
): Promise<LiferayInventoryPageResult> {
  const layouts = await fetchLayoutsByParent(gateway, site.id, privateLayout, 0);

  return {
    contractVersion: '2',
    pageType: 'siteRoot',
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    groupId: site.id,
    url: buildPageUrl(site.friendlyUrlPath, '/', privateLayout),
    pages: layouts.map((layout) => ({
      layoutId: layout.layoutId ?? -1,
      friendlyUrl: layout.friendlyURL ?? '',
      name: layout.nameCurrentValue ?? '',
      type: layout.type ?? '',
    })),
  };
}

export async function fetchDisplayPageInventory(
  config: AppConfig,
  gateway: LiferayGateway,
  apiClient: HttpApiClient,
  site: ResolvedSite,
  urlTitle: string,
): Promise<LiferayInventoryPageResult> {
  const {article, jsonwsArticle, articleRef} = await resolveDisplayPageArticle(gateway, site.id, urlTitle);

  const structuredContent = await resolveStructuredContentData(gateway, site.id, article, jsonwsArticle);

  // Enrich article object with structuredContent data
  if (structuredContent && structuredContent.contentStructureId) {
    article.contentStructureId = structuredContent.contentStructureId;
  }

  const journalArticle = await buildJournalArticleSummary(gateway, config, apiClient, articleRef, {
    article: jsonwsArticle,
    structuredContent,
    fallbackSite: site,
    fallbackTitle: article.title,
    fallbackContentStructureId: article.contentStructureId,
    includeHeadlessInventoryFields: true,
  });
  const contentStructures = await collectLayoutContentStructures(gateway, config, apiClient, [journalArticle]);
  const articleClassPK = Number(article.id ?? jsonwsArticle?.resourcePrimKey ?? jsonwsArticle?.id ?? -1);
  const articleClassNameId = await resolveClassNameId(config, gateway, CLASS_NAME_JOURNAL_ARTICLE);
  const articleAdminUrls =
    articleRef.articleId && articleClassPK > 0
      ? buildJournalArticleAdminUrls(
          config.liferay.url,
          site.friendlyUrlPath,
          site.id,
          articleRef.articleId,
          articleClassPK,
          articleClassNameId,
        )
      : undefined;

  return {
    contractVersion: '2',
    pageType: 'displayPage',
    pageSubtype: 'journalArticle',
    contentItemType: 'WebContent',
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    groupId: site.id,
    url: buildPageUrl(site.friendlyUrlPath, `/w/${urlTitle}`, false),
    friendlyUrl: `/w/${urlTitle}`,
    article: {
      id: article.id ?? -1,
      key: article.key ?? '',
      title: article.title ?? '',
      friendlyUrlPath: article.friendlyUrlPath ?? urlTitle,
      contentStructureId: Number(article.contentStructureId ?? -1),
    },
    ...(articleAdminUrls ? {adminUrls: articleAdminUrls} : {}),
    journalArticles: [journalArticle],
    contentStructures,
  };
}

export async function fetchRegularPageInventory(
  config: AppConfig,
  gateway: LiferayGateway,
  apiClient: HttpApiClient,
  site: ResolvedSite,
  friendlyUrl: string,
  privateLayout: boolean,
  localeHint?: string,
): Promise<LiferayInventoryPageResult> {
  const match = await findLayoutByFriendlyUrl(gateway, site.id, friendlyUrl, privateLayout, localeHint);
  if (!match) {
    throw LiferayErrors.inventoryError(
      `Layout not found for friendlyUrl=${friendlyUrl} in site=${site.friendlyUrlPath}.`,
    );
  }
  const {layout, locale: matchedLocale} = match;

  const layoutDetails = buildLayoutDetails(layout.typeSettings ?? '');
  let configurationTabs = buildRegularPageConfigurationTabs(layout, layoutDetails, privateLayout);
  const portlets = collectPortletPagePortlets(layout.typeSettings ?? '', layoutDetails.layoutTemplateId);
  const canonicalFriendlyUrl = layout.friendlyURL ?? friendlyUrl;
  const pageUrl = buildPageUrl(site.friendlyUrlPath, canonicalFriendlyUrl, privateLayout);
  const componentInspectionSupported = String(layout.type ?? '').toLowerCase() === 'content';
  const layoutClassNameId = await resolveClassNameId(config, gateway, CLASS_NAME_LAYOUT);
  let pageMetadata: HeadlessSitePagePayload | null = null;
  let fragmentEntryLinks: PageFragmentEntry[] = [];
  let widgets: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}> = [];
  let journalArticles: JournalArticleSummary[] = [];
  let contentStructures: ContentStructureSummary[] = [];

  if (componentInspectionSupported) {
    const {
      pageElement,
      pageMetadata: fetchedMetadata,
      rawFragmentLinks,
    } = await fetchComponentPageData(gateway, site.id, canonicalFriendlyUrl, layout.plid ?? -1);
    pageMetadata = fetchedMetadata;
    configurationTabs = buildRegularPageConfigurationTabs(layout, layoutDetails, privateLayout, pageMetadata);
    fragmentEntryLinks = collectPageElements(pageElement, rawFragmentLinks, matchedLocale);
    enrichRegularPageFragmentSummaries(fragmentEntryLinks);
    await enrichFragmentEntryExportPaths(config, gateway, site.friendlyUrlPath, fragmentEntryLinks, apiClient);
    widgets = fragmentEntryLinks
      .filter((entry) => entry.type === 'widget' && entry.widgetName)
      .map((entry) => ({
        widgetName: entry.widgetName!,
        ...(entry.portletId ? {portletId: entry.portletId} : {}),
        ...(entry.configuration ? {configuration: entry.configuration} : {}),
      }));
    journalArticles = await collectLayoutJournalArticles(gateway, config, apiClient, site.id, rawFragmentLinks);
    contentStructures = await collectLayoutContentStructures(gateway, config, apiClient, journalArticles);
  }

  function buildRegularPageSummary(
    layoutDetails: {layoutTemplateId?: string; targetUrl?: string},
    fragmentEntryLinks?: PageFragmentEntry[],
    widgets?: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}>,
  ): {
    layoutTemplateId?: string;
    targetUrl?: string;
    fragmentCount: number;
    widgetCount: number;
  } {
    return {
      ...(layoutDetails.layoutTemplateId ? {layoutTemplateId: layoutDetails.layoutTemplateId} : {}),
      ...(layoutDetails.targetUrl ? {targetUrl: layoutDetails.targetUrl} : {}),
      fragmentCount: fragmentEntryLinks?.filter((entry) => entry.type === 'fragment').length ?? 0,
      widgetCount: widgets?.length ?? fragmentEntryLinks?.filter((entry) => entry.type === 'widget').length ?? 0,
    };
  }

  function enrichRegularPageFragmentSummaries(entries: PageFragmentEntry[]): void {
    for (const entry of entries) {
      if (entry.type !== 'fragment' || !entry.fragmentKey) {
        continue;
      }
      const editableFields = new Map((entry.editableFields ?? []).map((field) => [field.id, field.value]));
      const fields = [...editableFields.entries()]
        .map(([id, value]) => ({id: id.trim(), value: String(value).trim()}))
        .filter((field) => field.id !== '' && field.value !== '');
      const field = (id: string): string => String(editableFields.get(id) ?? '').trim();
      const firstFieldValue = (patterns: RegExp[]): string | undefined => {
        for (const pattern of patterns) {
          const match = fields.find((candidate) => pattern.test(candidate.id));
          if (match) {
            return match.value;
          }
        }
        return undefined;
      };
      const listFieldValues = (patterns: RegExp[]): string[] =>
        fields
          .filter((candidate) => patterns.some((pattern) => pattern.test(candidate.id)))
          .sort((left, right) => left.id.localeCompare(right.id, undefined, {numeric: true}))
          .map((candidate) => candidate.value)
          .filter(Boolean);
      const stripHtml = (value: string): string =>
        value
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const truncate = (value: string, maxLength: number): string =>
        value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;

      const title = firstFieldValue([/^title$/i, /(?:^|[._-])(title|heading|header|label|name)(?:[._-]|$)/i]);

      let cardCount: number | undefined;

      const heroSource =
        (firstFieldValue([
          /^summary$/i,
          /^description$/i,
          /(?:^|[._-])(intro|intro-paragraph|paragraph|text|body|content|summary|description)(?:[._-]|$)/i,
        ]) ??
          field('paragraph')) ||
        field('text');
      const heroText = truncate(stripHtml(heroSource), 160) || undefined;

      const navigationItems =
        listFieldValues([/^(?:item|link|menu)-\d+$/i, /(?:^|[._-])(item|link|menu)-\d+(?:[._-]|$)/i]).length > 0
          ? listFieldValues([/^(?:item|link|menu)-\d+$/i, /(?:^|[._-])(item|link|menu)-\d+(?:[._-]|$)/i])
          : undefined;

      const totalLinks = Number(entry.configuration?.totalLinks ?? Number.NaN);
      if (Number.isFinite(totalLinks) && totalLinks > 0) {
        cardCount = totalLinks;
      } else {
        const cardLikeFields = fields.filter((candidate) =>
          /(?:^|[._-])(card|item|link)-\d+(?:[._-]|$)/i.test(candidate.id),
        );
        if (cardLikeFields.length > 0) {
          cardCount = cardLikeFields.length;
        }
      }

      const summaryParts = [title ? `title=${title}` : '', heroText ? `heroText=${heroText}` : '']
        .filter(Boolean)
        .concat(navigationItems && navigationItems.length > 0 ? [`navigationItems=${navigationItems.join(' | ')}`] : [])
        .concat(typeof cardCount === 'number' ? [`cardCount=${cardCount}`] : []);

      if (title) {
        entry.title = title;
      }
      if (heroText) {
        entry.heroText = heroText;
      }
      if (navigationItems && navigationItems.length > 0) {
        entry.navigationItems = navigationItems;
      }
      if (typeof cardCount === 'number') {
        entry.cardCount = cardCount;
      }
      if (summaryParts.length > 0) {
        entry.contentSummary = summaryParts.join(' · ');
      }
    }
  }

  return {
    contractVersion: '2',
    pageType: 'regularPage',
    pageSubtype: layout.type ?? '',
    pageUiType: resolveRegularPageUiType(layout.type),
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    groupId: site.id,
    url: pageUrl,
    friendlyUrl: canonicalFriendlyUrl,
    ...(matchedLocale ? {matchedLocale, requestedFriendlyUrl: friendlyUrl} : {}),
    pageName: layout.nameCurrentValue ?? '',
    privateLayout,
    pageSummary: buildRegularPageSummary(layoutDetails, fragmentEntryLinks, widgets),
    layout: {
      layoutId: Number(layout.layoutId ?? -1),
      plid: Number(layout.plid ?? -1),
      friendlyUrl: canonicalFriendlyUrl,
      type: layout.type ?? '',
      hidden: toBooleanOrFalse(layout.hidden),
    },
    adminUrls: buildLayoutAdminUrls(
      config.liferay.url,
      site.friendlyUrlPath,
      site.id,
      layout.plid ?? -1,
      pageUrl,
      layoutClassNameId,
      privateLayout,
    ),
    layoutDetails,
    configurationTabs,
    componentInspectionSupported,
    portlets,
    fragmentEntryLinks,
    widgets,
    journalArticles,
    contentStructures,
    configurationRaw: {
      layout: buildConfigurationRawLayout(layout),
      typeSettings: parseTypeSettingsMap(layout.typeSettings ?? ''),
      ...(pageMetadata ? {sitePageMetadata: buildConfigurationRawSitePage(pageMetadata)} : {}),
    },
  };
}

function resolveRegularPageUiType(layoutType: string | undefined): string {
  const normalized = String(layoutType ?? '')
    .trim()
    .toLowerCase();
  switch (normalized) {
    case 'full_page_application':
    case 'full-page-application':
    case 'fullpageapplication':
      return 'Full Page Application';
    case 'content':
      return 'Content Page';
    case 'link_to_layout':
    case 'link-to-layout':
      return 'Link to a Page of This Site';
    case 'url':
      return 'Link to URL';
    case 'node':
      return 'Page Set';
    case 'portlet':
      return 'Widget Page';
    case 'panel':
      return 'Panel';
    case 'embedded':
      return 'Embedded';
    default:
      return normalized === '' ? 'Page' : 'Page';
  }
}

function collectPortletPagePortlets(typeSettings: string, layoutTemplateId?: string): PagePortletSummary[] {
  const result: PagePortletSummary[] = [];
  for (const line of typeSettings.split(/\r?\n/)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const columnId = line.slice(0, separatorIndex).trim();
    if (!/^column-[\w-]+$/.test(columnId) || columnId.endsWith('-customizable')) {
      continue;
    }
    const portletIds = line
      .slice(separatorIndex + 1)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    for (const [index, portletId] of portletIds.entries()) {
      result.push({
        columnId,
        position: index,
        portletId,
        portletName: extractPortletName(portletId),
        ...extractPortletInstance(portletId),
        configuration: {
          columnId,
          position: String(index),
          ...(layoutTemplateId ? {layoutTemplateId} : {}),
        },
      });
    }
  }
  return result;
}

function extractPortletName(portletId: string): string {
  return portletId.split('_INSTANCE_')[0] ?? portletId;
}

function extractPortletInstance(portletId: string): {instanceId?: string} {
  const instanceId = portletId.split('_INSTANCE_')[1]?.trim();
  return instanceId ? {instanceId} : {};
}

export async function resolveRegularLayoutPageData(
  config: AppConfig,
  gateway: LiferayGateway,
  apiClient: HttpApiClient,
  site: ResolvedSite,
  friendlyUrl: string,
  privateLayout: boolean,
): Promise<ResolvedRegularLayoutPage> {
  const match = await findLayoutByFriendlyUrl(gateway, site.id, friendlyUrl, privateLayout);
  if (!match) {
    throw LiferayErrors.inventoryError(
      `Layout not found for friendlyUrl=${friendlyUrl} in site=${site.friendlyUrlPath}.`,
    );
  }
  const {layout} = match;

  const layoutDetails = buildLayoutDetails(layout.typeSettings ?? '');
  const canonicalFriendlyUrl = layout.friendlyURL ?? friendlyUrl;
  const pageUrl = buildPageUrl(site.friendlyUrlPath, canonicalFriendlyUrl, privateLayout);
  const layoutClassNameId = await resolveClassNameId(config, gateway, CLASS_NAME_LAYOUT);

  return {
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    groupId: site.id,
    url: pageUrl,
    friendlyUrl: canonicalFriendlyUrl,
    pageName: layout.nameCurrentValue ?? '',
    privateLayout,
    layoutType: layout.type ?? '',
    layoutId: layout.layoutId ?? -1,
    plid: layout.plid ?? -1,
    hidden: layout.hidden ?? false,
    layoutDetails,
    adminUrls: buildLayoutAdminUrls(
      config.liferay.url,
      site.friendlyUrlPath,
      site.id,
      layout.plid ?? -1,
      pageUrl,
      layoutClassNameId,
      privateLayout,
    ),
  };
}

async function resolveClassNameId(config: AppConfig, gateway: LiferayGateway, className: string): Promise<number> {
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

async function findLayoutByFriendlyUrl(
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

async function findLayoutByPlidRecursive(
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
