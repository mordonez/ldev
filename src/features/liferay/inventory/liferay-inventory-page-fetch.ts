import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {toBooleanOrFalse} from '../../../core/utils/coerce.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResolvedSite} from '../portal/site-resolution.js';
import {buildLayoutDetails, buildPageUrl, fetchLayoutsByParent} from '../page-layout/liferay-layout-shared.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {buildJournalArticleAdminUrls, buildLayoutAdminUrls} from '../page-layout/liferay-page-admin-urls.js';
import {
  collectPageElements,
  type ContentStructureSummary,
  type JournalArticleSummary,
  type PageFragmentEntry,
} from './liferay-inventory-page-assemble.js';
import {
  buildDisplayPageEvidence,
  buildRegularPageEvidence,
  type PageEvidence,
} from './liferay-inventory-page-evidence.js';
import type {
  LiferayInventoryPageResult,
  PagePortletSummary,
  ResolvedRegularLayoutPage,
} from './liferay-inventory-page.js';
import {
  fetchHeadlessSitePageElement,
  fetchHeadlessSitePageMetadata,
  type HeadlessSitePagePayload,
} from '../page-layout/liferay-site-page-shared.js';
import {buildDisplayPageFriendlyUrl, buildDisplayPageUrl} from './liferay-inventory-display-page-url.js';
import {resolveDisplayPageArticle, resolveStructuredContentData} from './liferay-inventory-page-fetch-article.js';
import {
  resolveClassNameId,
  findLayoutByFriendlyUrl,
  findLayoutByPlidRecursive,
} from './liferay-inventory-page-fetch-layout.js';
import {
  enrichFragmentEntryExportPaths,
  enrichFragmentEntrySummaries,
  tryFetchFragmentEntryLinks,
} from './liferay-inventory-page-fetch-fragments.js';
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

const CLASS_NAME_LAYOUT = 'com.liferay.portal.kernel.model.Layout';
const CLASS_NAME_JOURNAL_ARTICLE = 'com.liferay.journal.model.JournalArticle';

export async function fetchSiteRootInventory(
  gateway: LiferayGateway,
  site: ResolvedSite,
  privateLayout: boolean,
): Promise<LiferayInventoryPageResult> {
  const layouts = await fetchLayoutsByParent(gateway, site.id, privateLayout, 0);

  return {
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
    pageType: 'displayPage',
    pageSubtype: 'journalArticle',
    contentItemType: 'WebContent',
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    groupId: site.id,
    url:
      buildDisplayPageUrl(site.friendlyUrlPath, urlTitle) ??
      buildPageUrl(site.friendlyUrlPath, `/w/${urlTitle}`, false),
    friendlyUrl: buildDisplayPageFriendlyUrl(urlTitle) ?? `/w/${urlTitle}`,
    article: {
      id: article.id ?? -1,
      key: article.key ?? '',
      title: article.title ?? '',
      friendlyUrlPath: article.friendlyUrlPath ?? urlTitle,
      contentStructureId: Number(article.contentStructureId ?? -1),
    },
    ...(articleAdminUrls ? {adminUrls: articleAdminUrls} : {}),
    evidence: buildDisplayPageEvidence({
      article: {key: article.key ?? '', contentStructureId: Number(article.contentStructureId ?? -1)},
      journalArticles: [journalArticle],
      contentStructures,
    }),
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
  let inheritedEvidence: PageEvidence[] = [];

  if (componentInspectionSupported) {
    const pageElement = await fetchHeadlessSitePageElement(gateway, site.id, canonicalFriendlyUrl);
    pageMetadata = await fetchHeadlessSitePageMetadata(gateway, site.id, canonicalFriendlyUrl);
    const rawFragmentLinks = await tryFetchFragmentEntryLinks(gateway, site.id, layout.plid ?? -1);
    configurationTabs = buildRegularPageConfigurationTabs(layout, layoutDetails, privateLayout, pageMetadata);
    fragmentEntryLinks = collectPageElements(pageElement, rawFragmentLinks, matchedLocale);
    enrichFragmentEntrySummaries(fragmentEntryLinks);
    await enrichFragmentEntryExportPaths(config, gateway, site.friendlyUrlPath, fragmentEntryLinks, apiClient);
    widgets = fragmentEntryLinks
      .filter((entry) => entry.type === 'widget' && entry.widgetName)
      .map((entry) => ({
        widgetName: entry.widgetName!,
        ...(entry.portletId ? {portletId: entry.portletId} : {}),
        ...(entry.configuration ? {configuration: entry.configuration} : {}),
      }));
    journalArticles = await collectLayoutJournalArticles(
      gateway,
      config,
      apiClient,
      site.id,
      pageElement,
      rawFragmentLinks,
    );
    contentStructures = await collectLayoutContentStructures(gateway, config, apiClient, journalArticles);
    inheritedEvidence = await collectMasterLayoutEvidence(
      config,
      gateway,
      apiClient,
      site.id,
      site.friendlyUrlPath,
      privateLayout,
      Number(layout.masterLayoutPlid ?? 0),
      matchedLocale ?? undefined,
    );
  }

  if (['content', 'portlet'].includes(String(layout.type ?? '').toLowerCase())) {
    const renderedJournalArticles = await collectRenderedJournalContentArticles(
      config,
      gateway,
      apiClient,
      site.id,
      pageUrl,
    );

    if (renderedJournalArticles.length > 0) {
      journalArticles = mergeJournalArticles(journalArticles, renderedJournalArticles);
      contentStructures = await collectLayoutContentStructures(gateway, config, apiClient, journalArticles);
    }
  }

  return {
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
    pageSummary: buildRegularPageSummary(layoutDetails, fragmentEntryLinks, widgets, portlets),
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
    evidence: [
      ...buildRegularPageEvidence({fragmentEntryLinks, portlets, journalArticles, contentStructures}),
      ...inheritedEvidence,
    ],
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

async function collectMasterLayoutEvidence(
  config: AppConfig,
  gateway: LiferayGateway,
  apiClient: HttpApiClient,
  siteId: number,
  siteFriendlyUrl: string,
  privateLayout: boolean,
  masterLayoutPlid: number,
  localeHint?: string,
): Promise<PageEvidence[]> {
  if (masterLayoutPlid <= 0) {
    return [];
  }

  const masterLayout = await findLayoutByPlidRecursive(gateway, siteId, privateLayout, 0, masterLayoutPlid);
  if (!masterLayout) {
    return [];
  }

  const masterFriendlyUrl = String(masterLayout.friendlyURL ?? '').trim();
  if (masterFriendlyUrl === '') {
    return [];
  }

  const pageElement = await fetchHeadlessSitePageElement(gateway, siteId, masterFriendlyUrl);
  const rawFragmentLinks = await tryFetchFragmentEntryLinks(gateway, siteId, Number(masterLayout.plid ?? -1));
  const masterFragmentEntryLinks = collectPageElements(pageElement, rawFragmentLinks, localeHint ?? null);
  const masterJournalArticles = await collectLayoutJournalArticles(
    gateway,
    config,
    apiClient,
    siteId,
    pageElement,
    rawFragmentLinks,
  );
  const masterContentStructures = await collectLayoutContentStructures(
    gateway,
    config,
    apiClient,
    masterJournalArticles,
  );

  await enrichFragmentEntryExportPaths(config, gateway, siteFriendlyUrl, masterFragmentEntryLinks, apiClient);

  return buildRegularPageEvidence({
    fragmentEntryLinks: masterFragmentEntryLinks,
    journalArticles: masterJournalArticles,
    contentStructures: masterContentStructures,
  });
}

async function collectRenderedJournalContentArticles(
  config: AppConfig,
  gateway: LiferayGateway,
  apiClient: HttpApiClient,
  siteId: number,
  pageUrl: string,
): Promise<JournalArticleSummary[]> {
  const html = await fetchRenderedPageHtml(config, apiClient, pageUrl);
  if (html === '') {
    return [];
  }

  const refs = extractRenderedJournalArticleRefs(html);
  const results: JournalArticleSummary[] = [];

  for (const ref of refs) {
    results.push({
      ...(await buildJournalArticleSummary(
        gateway,
        config,
        apiClient,
        {articleId: ref.articleId, groupId: siteId},
        {
          fallbackTitle: ref.title ?? ref.articleId,
          includeHeadlessInventoryFields: true,
        },
      )),
      discoverySource: 'renderedHtmlJournalContent',
    });
  }

  return results;
}

async function fetchRenderedPageHtml(config: AppConfig, apiClient: HttpApiClient, pageUrl: string): Promise<string> {
  try {
    const response = await apiClient.get<string>(config.liferay.url, pageUrl, {
      headers: {Accept: 'text/html,application/xhtml+xml'},
      timeoutSeconds: config.liferay.timeoutSeconds,
    });
    return response.ok ? response.body : '';
  } catch {
    return '';
  }
}

function extractRenderedJournalArticleRefs(html: string): Array<{articleId: string; title?: string}> {
  const refs = new Map<string, {articleId: string; title?: string}>();
  const tagPattern = /<div\b[^>]*class=["'][^"']*\bjournal-content-article\b[^"']*["'][^>]*>/gi;

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    const articleId = extractHtmlAttribute(tag, 'data-analytics-asset-id')?.trim();
    if (!articleId) {
      continue;
    }

    const title = extractHtmlAttribute(tag, 'data-analytics-asset-title');
    refs.set(articleId, {
      articleId,
      ...(title ? {title: decodeRenderedHtmlEntities(title)} : {}),
    });
  }

  return [...refs.values()];
}

function extractHtmlAttribute(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`${attribute}=["']([^"']*)["']`, 'i');
  const match = tag.match(pattern);
  return match?.[1];
}

function decodeRenderedHtmlEntities(value: string): string {
  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&uacute;': 'ú',
  };

  return value
    .replace(/&(nbsp|amp|lt|gt|quot|#39|uacute);/g, (entity) => entityMap[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeJournalArticles(
  existing: JournalArticleSummary[],
  discovered: JournalArticleSummary[],
): JournalArticleSummary[] {
  const merged = new Map<string, JournalArticleSummary>();

  for (const article of existing) {
    merged.set(buildJournalArticleIdentity(article), article);
  }

  for (const article of discovered) {
    const key = buildJournalArticleIdentity(article);
    if (!merged.has(key)) {
      merged.set(key, article);
    }
  }

  return [...merged.values()];
}

function buildJournalArticleIdentity(article: JournalArticleSummary): string {
  return `${article.groupId ?? -1}:${article.articleId}`;
}

function buildRegularPageSummary(
  layoutDetails: {layoutTemplateId?: string; targetUrl?: string},
  fragmentEntryLinks?: PageFragmentEntry[],
  widgets?: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}>,
  portlets?: PagePortletSummary[],
): {layoutTemplateId?: string; targetUrl?: string; fragmentCount: number; widgetCount: number} {
  const headlessWidgetCount = widgets?.length ?? 0;
  const fragmentWidgetCount = fragmentEntryLinks?.filter((entry) => entry.type === 'widget').length ?? 0;
  const classicPortletCount = portlets?.length ?? 0;

  return {
    ...(layoutDetails.layoutTemplateId ? {layoutTemplateId: layoutDetails.layoutTemplateId} : {}),
    ...(layoutDetails.targetUrl ? {targetUrl: layoutDetails.targetUrl} : {}),
    fragmentCount: fragmentEntryLinks?.filter((entry) => entry.type === 'fragment').length ?? 0,
    widgetCount: Math.max(headlessWidgetCount, fragmentWidgetCount, classicPortletCount),
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
