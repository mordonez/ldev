/* eslint-disable max-lines -- inventory orchestration intentionally consolidated during active refactor */
import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import path from 'node:path';
import fs from 'fs-extra';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {firstNonEmptyString, firstPositiveNumber, toBoolean, toBooleanOrFalse} from '../../../core/utils/coerce.js';
import {trimLeadingSlash} from '../../../core/utils/text.js';
import {authedGet, type ResolvedSite} from './liferay-inventory-shared.js';
import {
  buildLayoutDetails,
  buildPageUrl,
  fetchLayoutsByParent,
  type Layout,
} from '../page-layout/liferay-layout-shared.js';
import {buildJournalArticleAdminUrls, buildLayoutAdminUrls} from '../page-layout/liferay-page-admin-urls.js';
import {
  asRecord,
  assignOptionalFiniteNumber,
  assignOptionalString,
  assignOptionalNumber,
  assignOptionalBoolean,
  collectPageElements,
  hasJsonWsException,
  summarizeContentFields,
  firstString,
  type ContentStructureSummary,
  type JournalArticleSummary,
  type PageFragmentEntry,
  type StructuredContent,
} from './liferay-inventory-page-assemble.js';
import {KNOWN_LOCALES} from './liferay-inventory-page-url.js';
import type {
  LiferayInventoryPageResult,
  PagePortletSummary,
  ResolvedRegularLayoutPage,
} from './liferay-inventory-page.js';
import {resolveSiteToken, resolveFragmentsBaseDir, resolveArtifactSiteDir} from '../resource/liferay-resource-paths.js';
import {
  buildResourceSiteChain,
  fetchGroupInfo,
  listDdmTemplates,
  resolveResourceSite,
} from '../resource/liferay-resource-shared.js';
import {matchesDdmTemplate} from '../liferay-identifiers.js';
import {classNameIdLookupCache} from '../lookup-cache.js';

type LayoutMatch = {layout: Layout; locale: string | null};
type ArticleRef = {articleId: string; groupId: number; ddmTemplateKey?: string};

const CLASS_NAME_LAYOUT = 'com.liferay.portal.kernel.model.Layout';
const CLASS_NAME_JOURNAL_ARTICLE = 'com.liferay.journal.model.JournalArticle';

export async function fetchSiteRootInventory(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  site: ResolvedSite,
  privateLayout: boolean,
): Promise<LiferayInventoryPageResult> {
  const layouts = await fetchLayoutsByParent(config, apiClient, accessToken, site.id, privateLayout, 0);

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

/**
 * Resolve display page article with fallback chain:
 * 1. Try headless-delivery structured content by friendlyUrlPath
 * 2. Fall back to JSONWS get-article-by-url-title
 * Returns: { article, jsonwsArticle, articleRef }
 */
async function resolveDisplayPageArticle(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  urlTitle: string,
): Promise<{article: StructuredContent; jsonwsArticle: Record<string, unknown> | null; articleRef: ArticleRef}> {
  const filter = encodeURIComponent(`friendlyUrlPath eq '${urlTitle}'`);
  const response = await authedGet<{items?: StructuredContent[]}>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/sites/${siteId}/structured-contents?filter=${filter}&pageSize=1`,
  );
  let article: StructuredContent | undefined = response.ok ? response.data?.items?.[0] : undefined;
  let jsonwsArticle = await fetchJournalArticleByUrlTitle(config, apiClient, accessToken, siteId, urlTitle);

  // Fallback: try JSONWS when headless delivery returns nothing
  if (!article && jsonwsArticle) {
    article = {
      id: Number(jsonwsArticle.resourcePrimKey ?? jsonwsArticle.id ?? -1) || undefined,
      key: String(jsonwsArticle.articleId ?? ''),
      title: String(jsonwsArticle.titleCurrentValue ?? jsonwsArticle.title ?? ''),
      friendlyUrlPath: urlTitle,
      contentStructureId: Number(jsonwsArticle.contentStructureId ?? -1) || undefined,
    };
  }

  if (!article) {
    throw new CliError(
      `No structured content found with friendlyUrlPath=${urlTitle}. Verify the article URL title and site visibility, or confirm JSONWS/headless permissions for this OAuth client.`,
      {code: 'LIFERAY_INVENTORY_ERROR'},
    );
  }

  const articleRef: ArticleRef = {
    articleId: String(article.key ?? jsonwsArticle?.articleId ?? ''),
    groupId: siteId,
    ...(firstString(jsonwsArticle?.ddmTemplateKey) ? {ddmTemplateKey: firstString(jsonwsArticle?.ddmTemplateKey)} : {}),
  };

  // Fetch JSONWS article if we don't have it yet
  if (!jsonwsArticle && articleRef.articleId) {
    jsonwsArticle = await fetchLatestJournalArticle(config, apiClient, accessToken, siteId, articleRef.articleId);
  }

  return {article, jsonwsArticle, articleRef};
}

/**
 * Resolve structured content data with fallback chain:
 * 1. Try by UUID (preferred, more complete)
 * 2. Fall back to by ID
 */
async function resolveStructuredContentData(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  article: StructuredContent,
  jsonwsArticle: Record<string, unknown> | null,
): Promise<StructuredContent | null> {
  let structuredContent: StructuredContent | null = null;
  const uuid = firstString(jsonwsArticle?.uuid);

  if (uuid) {
    structuredContent = await fetchStructuredContentByUuid(config, apiClient, accessToken, siteId, uuid);
  }

  // Fallback to fetch by ID if UUID didn't work
  if (!structuredContent) {
    const structuredContentId = article.id && article.id > 0 ? article.id : -1;
    if (structuredContentId > 0) {
      structuredContent = await fetchStructuredContentById(config, apiClient, accessToken, structuredContentId);
    }
  }

  return structuredContent;
}

export async function fetchDisplayPageInventory(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  site: ResolvedSite,
  urlTitle: string,
): Promise<LiferayInventoryPageResult> {
  const {article, jsonwsArticle, articleRef} = await resolveDisplayPageArticle(
    config,
    apiClient,
    accessToken,
    site.id,
    urlTitle,
  );

  const structuredContent = await resolveStructuredContentData(
    config,
    apiClient,
    accessToken,
    site.id,
    article,
    jsonwsArticle,
  );

  // Enrich article object with structuredContent data
  if (structuredContent && structuredContent.contentStructureId) {
    article.contentStructureId = structuredContent.contentStructureId;
  }

  const journalArticle = await buildJournalArticleSummary(config, apiClient, accessToken, articleRef, {
    article: jsonwsArticle,
    structuredContent,
    fallbackSite: site,
    fallbackTitle: article.title,
    fallbackContentStructureId: article.contentStructureId,
    includeHeadlessInventoryFields: true,
  });
  const contentStructures = await collectLayoutContentStructures(config, apiClient, accessToken, [journalArticle]);
  const articleClassPK = Number(article.id ?? jsonwsArticle?.resourcePrimKey ?? jsonwsArticle?.id ?? -1);
  const articleClassNameId = await resolveClassNameId(config, apiClient, accessToken, CLASS_NAME_JOURNAL_ARTICLE);
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
  apiClient: LiferayApiClient,
  accessToken: string,
  site: ResolvedSite,
  friendlyUrl: string,
  privateLayout: boolean,
  localeHint?: string,
): Promise<LiferayInventoryPageResult> {
  const match = await findLayoutByFriendlyUrl(
    config,
    apiClient,
    accessToken,
    site.id,
    friendlyUrl,
    privateLayout,
    localeHint,
  );
  if (!match) {
    throw new CliError(`Layout not found for friendlyUrl=${friendlyUrl} in site=${site.friendlyUrlPath}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }
  const {layout, locale: matchedLocale} = match;

  const layoutDetails = buildLayoutDetails(layout.typeSettings ?? '');
  let configurationTabs = buildRegularPageConfigurationTabs(layout, layoutDetails, privateLayout);
  const portlets = collectPortletPagePortlets(layout.typeSettings ?? '', layoutDetails.layoutTemplateId);
  const canonicalFriendlyUrl = layout.friendlyURL ?? friendlyUrl;
  const pageUrl = buildPageUrl(site.friendlyUrlPath, canonicalFriendlyUrl, privateLayout);
  const componentInspectionSupported = String(layout.type ?? '').toLowerCase() === 'content';
  const layoutClassNameId = await resolveClassNameId(config, apiClient, accessToken, CLASS_NAME_LAYOUT);
  let pageMetadata: Record<string, unknown> | null = null;
  let fragmentEntryLinks: PageFragmentEntry[] = [];
  let widgets: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}> = [];
  let journalArticles: JournalArticleSummary[] = [];
  let contentStructures: ContentStructureSummary[] = [];

  if (componentInspectionSupported) {
    const {
      pageElement,
      pageMetadata: fetchedMetadata,
      rawFragmentLinks,
    } = await fetchComponentPageData(config, apiClient, accessToken, site.id, canonicalFriendlyUrl, layout.plid ?? -1);
    pageMetadata = fetchedMetadata;
    configurationTabs = buildRegularPageConfigurationTabs(layout, layoutDetails, privateLayout, pageMetadata);
    fragmentEntryLinks = collectPageElements(pageElement, rawFragmentLinks, matchedLocale);
    enrichRegularPageFragmentSummaries(fragmentEntryLinks);
    await enrichFragmentEntryExportPaths(config, accessToken, site.friendlyUrlPath, fragmentEntryLinks, apiClient);
    widgets = fragmentEntryLinks
      .filter((entry) => entry.type === 'widget' && entry.widgetName)
      .map((entry) => ({
        widgetName: entry.widgetName!,
        ...(entry.portletId ? {portletId: entry.portletId} : {}),
        ...(entry.configuration ? {configuration: entry.configuration} : {}),
      }));
    journalArticles = await collectLayoutJournalArticles(config, apiClient, accessToken, site.id, rawFragmentLinks);
    contentStructures = await collectLayoutContentStructures(config, apiClient, accessToken, journalArticles);
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
        .map(([id, value]) => ({id: id.trim(), value: String(value ?? '').trim()}))
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

      const title =
        firstFieldValue([/^title$/i, /(?:^|[._-])(title|heading|header|label|name)(?:[._-]|$)/i]) ?? undefined;

      let cardCount: number | undefined;

      const heroSource =
        firstFieldValue([
          /^summary$/i,
          /^description$/i,
          /(?:^|[._-])(intro|intro-paragraph|paragraph|text|body|content|summary|description)(?:[._-]|$)/i,
        ]) ??
        field('paragraph') ??
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

/**
 * Extract and normalize configuration metadata from page data.
 * Handles: typeSettings parsing, custom fields, categories, tags, OG settings.
 */
function extractConfigurationMetadata(
  layout: Layout,
  pageMetadata?: Record<string, unknown> | null,
): {
  typeSettings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  metadataSettings: Record<string, unknown>;
  customFieldsMap: Record<string, unknown>;
  categories: string[];
  tags: string[];
} {
  const typeSettings = parseTypeSettingsMap(layout.typeSettings ?? '');
  const metadata = asRecord(pageMetadata ?? {});
  const metadataSettings = asRecord(metadata.settings);

  const customFieldsMap: Record<string, unknown> = {};
  for (const item of Array.isArray(metadata.customFields) ? metadata.customFields : []) {
    const field = asRecord(item);
    const name = String(field.name ?? '').trim();
    if (!name) {
      continue;
    }
    customFieldsMap[name] = asRecord(field.customValue).data;
  }

  const categories = (Array.isArray(metadata.taxonomyCategoryBriefs) ? metadata.taxonomyCategoryBriefs : [])
    .map((item) => asRecord(item).taxonomyCategoryName)
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  const tags = (Array.isArray(metadata.keywords) ? metadata.keywords : []).filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );

  return {typeSettings, metadata, metadataSettings, customFieldsMap, categories, tags};
}

function buildRegularPageConfigurationTabs(
  layout: Layout,
  layoutDetails: {layoutTemplateId?: string; targetUrl?: string},
  privateLayout: boolean,
  pageMetadata?: Record<string, unknown> | null,
): {
  general: Record<string, unknown>;
  design: Record<string, unknown>;
  seo: Record<string, unknown>;
  openGraph: Record<string, unknown>;
  customMetaTags: Record<string, unknown>;
} {
  const {typeSettings, metadata, metadataSettings, customFieldsMap, categories, tags} = extractConfigurationMetadata(
    layout,
    pageMetadata,
  );

  const general: Record<string, unknown> = {
    type: layout.type ?? '',
    name: layout.nameCurrentValue ?? '',
    hiddenInNavigation: toBooleanOrFalse(layout.hidden),
    friendlyUrl: layout.friendlyURL ?? '',
    queryString: typeSettings.queryString ?? '',
    targetType: layoutDetails.targetUrl ? 'url' : '',
    target: layoutDetails.targetUrl ?? '',
    categories,
    tags,
    privateLayout,
  };

  const design: Record<string, unknown> = {
    theme: {
      useInheritedTheme: false,
      themeId: layout.themeId ?? '',
      colorSchemeId: layout.colorSchemeId ?? '',
      styleBookEntryId: Number(layout.styleBookEntryId ?? 0),
      masterLayoutPlid: Number(layout.masterLayoutPlid ?? 0),
      faviconFileEntryId: Number(layout.faviconFileEntryId ?? 0),
    },
    themeFlags: {
      showHeader: toBoolean(typeSettings['lfr-theme:regular:show-header']),
      showFooter: toBoolean(typeSettings['lfr-theme:regular:show-footer']),
      showHeaderSearch: toBoolean(typeSettings['lfr-theme:regular:show-header-search']),
      wrapWidgetPageContent: toBoolean(typeSettings['lfr-theme:regular:wrap-widget-page-content']),
      layoutUpdateable: toBoolean(typeSettings.layoutUpdateable),
      published: toBoolean(typeSettings.published),
    },
    customCss: layout.css ?? '',
    customJavascript: layout.javascript ?? '',
    customFields: customFieldsMap,
  };

  const seo: Record<string, unknown> = {
    title: layout.titleCurrentValue ?? '',
    description: layout.descriptionCurrentValue ?? '',
    keywords: layout.keywordsCurrentValue ?? '',
    robots: layout.robotsCurrentValue ?? layout.robots ?? '',
    sitemap: {
      include: toBoolean(typeSettings['sitemap-include']),
      changefreq: typeSettings['sitemap-changefreq'] ?? '',
    },
  };

  const openGraph: Record<string, unknown> = {
    title: firstNonEmptyString(metadataSettings.openGraphTitle, metadata.openGraphTitle),
    description: firstNonEmptyString(metadataSettings.openGraphDescription, metadata.openGraphDescription),
    type: firstNonEmptyString(metadataSettings.openGraphType, metadata.openGraphType),
    url: firstNonEmptyString(metadataSettings.openGraphUrl, metadata.openGraphUrl),
    imageAlt: firstNonEmptyString(metadataSettings.openGraphImageAlt, metadata.openGraphImageAlt),
    imageFileEntryId: firstPositiveNumber(
      metadataSettings.openGraphImageFileEntryId,
      metadata.openGraphImageFileEntryId,
    ),
  };

  const customMetaTags: Record<string, unknown> = {
    values: metadata.customMetaTags ?? metadataSettings.customMetaTags ?? typeSettings.customMetaTags ?? null,
  };

  return {
    general,
    design,
    seo,
    openGraph,
    customMetaTags,
  };
}

function buildConfigurationRawLayout(layout: Layout): Record<string, unknown> {
  return {
    layoutId: Number(layout.layoutId ?? -1),
    plid: Number(layout.plid ?? -1),
    type: layout.type ?? '',
    nameCurrentValue: layout.nameCurrentValue ?? '',
    titleCurrentValue: layout.titleCurrentValue ?? '',
    descriptionCurrentValue: layout.descriptionCurrentValue ?? '',
    keywordsCurrentValue: layout.keywordsCurrentValue ?? '',
    robotsCurrentValue: layout.robotsCurrentValue ?? '',
    friendlyURL: layout.friendlyURL ?? '',
    hidden: toBooleanOrFalse(layout.hidden),
    themeId: layout.themeId ?? '',
    colorSchemeId: layout.colorSchemeId ?? '',
    styleBookEntryId: Number(layout.styleBookEntryId ?? 0),
    masterLayoutPlid: Number(layout.masterLayoutPlid ?? 0),
    faviconFileEntryId: Number(layout.faviconFileEntryId ?? 0),
    css: layout.css ?? '',
    javascript: layout.javascript ?? '',
  };
}

function buildConfigurationRawSitePage(pageMetadata: Record<string, unknown>): Record<string, unknown> {
  const metadata = asRecord(pageMetadata);
  return {
    id: firstPositiveNumber(metadata.id),
    friendlyUrlPath: firstNonEmptyString(metadata.friendlyUrlPath),
    title: firstNonEmptyString(metadata.title),
    availableLanguages: Array.isArray(metadata.availableLanguages) ? metadata.availableLanguages : [],
    taxonomyCategoryBriefs: Array.isArray(metadata.taxonomyCategoryBriefs) ? metadata.taxonomyCategoryBriefs : [],
    keywords: Array.isArray(metadata.keywords) ? metadata.keywords : [],
    customFields: Array.isArray(metadata.customFields) ? metadata.customFields : [],
    settings: asRecord(metadata.settings),
    viewableBy: asRecord(metadata.viewableBy),
  };
}

function parseTypeSettingsMap(rawTypeSettings: string): Record<string, string> {
  const settings: Record<string, string> = {};
  if (rawTypeSettings.trim() === '') {
    return settings;
  }
  for (const line of rawTypeSettings.split(/\r?\n/)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key !== '') {
      settings[key] = value;
    }
  }
  return settings;
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
  apiClient: LiferayApiClient,
  accessToken: string,
  site: ResolvedSite,
  friendlyUrl: string,
  privateLayout: boolean,
): Promise<ResolvedRegularLayoutPage> {
  const match = await findLayoutByFriendlyUrl(config, apiClient, accessToken, site.id, friendlyUrl, privateLayout);
  if (!match) {
    throw new CliError(`Layout not found for friendlyUrl=${friendlyUrl} in site=${site.friendlyUrlPath}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }
  const {layout} = match;

  const layoutDetails = buildLayoutDetails(layout.typeSettings ?? '');
  const canonicalFriendlyUrl = layout.friendlyURL ?? friendlyUrl;
  const pageUrl = buildPageUrl(site.friendlyUrlPath, canonicalFriendlyUrl, privateLayout);
  const layoutClassNameId = await resolveClassNameId(config, apiClient, accessToken, CLASS_NAME_LAYOUT);

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

async function resolveClassNameId(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  className: string,
): Promise<number> {
  const cacheKey = `${config.liferay.url}|${className}`;
  const cached = classNameIdLookupCache.get(cacheKey);
  if (cached && cached > 0) {
    return cached;
  }

  const response = await safeAuthedGet<Record<string, unknown>>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/classname/fetch-class-name?value=${encodeURIComponent(className)}`,
  );
  const resolved = Number(response.data?.classNameId ?? -1);
  if (!response.ok || resolved <= 0) {
    throw new CliError(
      `Unable to resolve classNameId for ${className}. Verify JSONWS access to /api/jsonws/classname/fetch-class-name and portal credentials/permissions.`,
      {
        code: 'LIFERAY_INVENTORY_ERROR',
      },
    );
  }

  classNameIdLookupCache.set(cacheKey, resolved);
  return resolved;
}

async function findLayoutByFriendlyUrl(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  friendlyUrl: string,
  privateLayout: boolean,
  localeHint?: string,
): Promise<LayoutMatch | null> {
  // 1. Try exact match via recursive tree search (canonical URL, fast)
  const canonical = await findLayoutByFriendlyUrlRecursive(
    config,
    apiClient,
    accessToken,
    groupId,
    friendlyUrl,
    privateLayout,
    0,
  );
  if (canonical) {
    return {layout: canonical, locale: null};
  }

  // 2. If a locale hint is available (from URL prefix like /es/web/...), use targeted JSONWS lookup
  if (localeHint) {
    const localeCandidates = [localeHint, ...KNOWN_LOCALES.filter((candidate) => candidate !== localeHint)];
    for (const candidateLocale of localeCandidates) {
      const match = await findLayoutByLocaleFriendlyUrl(
        config,
        apiClient,
        accessToken,
        groupId,
        friendlyUrl,
        privateLayout,
        candidateLocale,
      );
      if (match) {
        return match;
      }
    }
  }

  // 3. Last resort for localized friendly URLs without a locale prefix.
  // Try common locales and map the localized URL back to the canonical layout.
  for (const candidateLocale of KNOWN_LOCALES) {
    const match = await findLayoutByLocaleFriendlyUrl(
      config,
      apiClient,
      accessToken,
      groupId,
      friendlyUrl,
      privateLayout,
      candidateLocale,
    );
    if (match) {
      return match;
    }
  }

  return null;
}

async function findLayoutByLocaleFriendlyUrl(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  friendlyUrl: string,
  privateLayout: boolean,
  languageId: string,
): Promise<LayoutMatch | null> {
  if (privateLayout) {
    return null;
  }

  const plid = await findLocalizedPagePlid(config, apiClient, accessToken, groupId, friendlyUrl, languageId);
  if (plid <= 0) {
    return null;
  }
  const layout = await findLayoutByPlidRecursive(config, apiClient, accessToken, groupId, privateLayout, 0, plid);
  return layout ? {layout, locale: languageId} : null;
}

async function findLocalizedPagePlid(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  friendlyUrl: string,
  languageId: string,
): Promise<number> {
  let page = 1;
  let lastPage = 1;
  const acceptLanguage = languageId.replace('_', '-');

  while (page <= lastPage) {
    const response = await apiClient.get<{
      items?: Array<{id?: number; friendlyUrlPath?: string}>;
      lastPage?: number;
    }>(config.liferay.url, `/o/headless-delivery/v1.0/sites/${groupId}/site-pages?page=${page}&pageSize=100`, {
      timeoutSeconds: config.liferay.timeoutSeconds,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Language': acceptLanguage,
      },
    });

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
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  friendlyUrl: string,
  privateLayout: boolean,
  parentLayoutId: number,
): Promise<Layout | null> {
  const layouts = await fetchLayoutsByParent(config, apiClient, accessToken, groupId, privateLayout, parentLayoutId);

  for (const layout of layouts) {
    if ((layout.friendlyURL ?? '') === friendlyUrl) {
      return layout;
    }
  }

  for (const layout of layouts) {
    const child = await findLayoutByFriendlyUrlRecursive(
      config,
      apiClient,
      accessToken,
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
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  privateLayout: boolean,
  parentLayoutId: number,
  plid: number,
): Promise<Layout | null> {
  const layouts = await fetchLayoutsByParent(config, apiClient, accessToken, groupId, privateLayout, parentLayoutId);

  for (const layout of layouts) {
    if (Number(layout.plid ?? -1) === plid) {
      return layout;
    }
  }

  for (const layout of layouts) {
    const child = await findLayoutByPlidRecursive(
      config,
      apiClient,
      accessToken,
      groupId,
      privateLayout,
      Number(layout.layoutId ?? 0),
      plid,
    );
    if (child) {
      return child;
    }
  }

  return null;
}

async function fetchSitePageElement(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  friendlyUrl: string,
): Promise<Record<string, unknown> | null> {
  const slug = trimLeadingSlash(friendlyUrl);
  const response = await authedGet<Record<string, unknown>>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${encodeURIComponent(slug)}?fields=pageDefinition`,
  );
  if (!response.ok) {
    return null;
  }
  return asRecord(asRecord(response.data).pageDefinition).pageElement as Record<string, unknown> | null;
}

async function tryFetchSitePageMetadata(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  friendlyUrl: string,
): Promise<Record<string, unknown> | null> {
  try {
    const slug = trimLeadingSlash(friendlyUrl);
    const response = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${encodeURIComponent(slug)}?nestedFields=taxonomyCategoryBriefs`,
    );
    if (!response.ok || !response.data) {
      return null;
    }
    return asRecord(response.data);
  } catch {
    return null;
  }
}

async function tryFetchFragmentEntryLinks(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  plid: number,
): Promise<Array<Record<string, unknown>>> {
  if (plid <= 0) {
    return [];
  }
  const response = await authedGet<Array<Record<string, unknown>>>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/fragment.fragmententrylink/get-fragment-entry-links?groupId=${groupId}&plid=${plid}`,
  );
  return response.ok && Array.isArray(response.data) ? response.data : [];
}

async function collectLayoutJournalArticles(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  defaultGroupId: number,
  fragmentEntryLinks: Array<Record<string, unknown>>,
): Promise<JournalArticleSummary[]> {
  const refs = extractArticleRefs(fragmentEntryLinks, defaultGroupId);
  const result: JournalArticleSummary[] = [];

  for (const ref of refs.values()) {
    result.push(await buildJournalArticleSummary(config, apiClient, accessToken, ref));
  }

  return result;
}

async function buildJournalArticleSummary(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  ref: ArticleRef,
  options?: {
    article?: Record<string, unknown> | null;
    structuredContent?: StructuredContent | null;
    fallbackSite?: ResolvedSite;
    fallbackTitle?: string;
    fallbackContentStructureId?: number;
    includeHeadlessInventoryFields?: boolean;
  },
): Promise<JournalArticleSummary> {
  const article =
    options?.article ?? (await fetchLatestJournalArticle(config, apiClient, accessToken, ref.groupId, ref.articleId));
  const articleSite =
    (await safeFetchGroupInfo(config, ref.groupId, {apiClient, accessToken})) ??
    (options?.fallbackSite
      ? {
          friendlyUrl: options.fallbackSite.friendlyUrlPath,
          name: options.fallbackSite.name,
          parentGroupId: -1,
        }
      : null);
  const ddmTemplateKey = ref.ddmTemplateKey ?? firstString(article?.ddmTemplateKey);
  const summary: JournalArticleSummary = {
    groupId: ref.groupId,
    ...(articleSite?.friendlyUrl ? {siteFriendlyUrl: articleSite.friendlyUrl} : {}),
    ...(articleSite?.name ? {siteName: articleSite.name} : {}),
    articleId: ref.articleId,
    title: String(article?.titleCurrentValue ?? article?.title ?? options?.fallbackTitle ?? ref.articleId),
    ddmStructureKey: String(article?.ddmStructureKey ?? ''),
    ...(ddmTemplateKey ? {ddmTemplateKey} : {}),
    ...(options?.fallbackContentStructureId ? {contentStructureId: Number(options.fallbackContentStructureId)} : {}),
  };

  // 1. Try to enrich with headless-delivery using UUID from JSONWS
  let structuredContent = options?.structuredContent ?? null;
  const uuid = firstString(article?.uuid);
  if (!structuredContent && uuid) {
    structuredContent = await fetchStructuredContentByUuid(config, apiClient, accessToken, ref.groupId, uuid);
  }

  // 2. If UUID lookup failed, try by ID as fallback
  if (!structuredContent) {
    const structuredContentId = Number(article?.id ?? article?.resourcePrimKey ?? -1);
    if (structuredContentId > 0) {
      structuredContent = await fetchStructuredContentById(config, apiClient, accessToken, structuredContentId);
    }
  }

  // 3. Enrich summary with headless-delivery data (or JSONWS fallback if headless-delivery hasn't indexed yet)
  if (structuredContent) {
    if (options?.includeHeadlessInventoryFields) {
      enrichJournalArticleWithStructuredContent(summary, structuredContent, ddmTemplateKey);
    }
    if (structuredContent.contentStructureId) {
      summary.contentStructureId = Number(structuredContent.contentStructureId);
    }
    const contentFields = summarizeContentFields(structuredContent.contentFields);
    if (contentFields.length > 0) {
      summary.contentFields = contentFields;
    }
  } else if (article) {
    // Fallback: Use JSONWS data when headless-delivery hasn't indexed yet
    // Extract contentStructureId from JSONWS article
    const jsonwsContentStructureId = Number(article.contentStructureId ?? -1);
    if (jsonwsContentStructureId > 0) {
      summary.contentStructureId = jsonwsContentStructureId;
    }
  }

  // 4. Resolve structure key if not already available
  if (!summary.ddmStructureKey && summary.contentStructureId) {
    const contentStructure = await fetchContentStructureById(
      config,
      apiClient,
      accessToken,
      summary.contentStructureId,
    );
    const contentStructureKey = inferContentStructureKey(contentStructure);
    if (contentStructureKey) {
      summary.ddmStructureKey = contentStructureKey;
    }
  }

  // 5. Resolve structure site and export path
  if (articleSite?.friendlyUrl && summary.ddmStructureKey) {
    const structureSite = await resolveStructureSiteByKey(
      config,
      apiClient,
      accessToken,
      articleSite.friendlyUrl,
      summary.ddmStructureKey,
    );
    if (structureSite) {
      summary.ddmStructureSiteFriendlyUrl = structureSite.siteFriendlyUrl;
      summary.structureExportPath = buildStructureExportPath(
        config,
        structureSite.siteFriendlyUrl,
        summary.ddmStructureKey,
      );
    }
  }

  // 6. Resolve template site and export path
  if (articleSite?.friendlyUrl && ddmTemplateKey) {
    const templateSite = await resolveTemplateSiteByKey(config, articleSite.friendlyUrl, ddmTemplateKey, {
      apiClient,
      accessToken,
    });
    if (templateSite) {
      summary.ddmTemplateSiteFriendlyUrl = templateSite;
      summary.templateExportPath = buildTemplateExportPath(config, templateSite, ddmTemplateKey);
    }
  }

  return summary;
}

async function collectLayoutContentStructures(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  journalArticles: JournalArticleSummary[],
): Promise<ContentStructureSummary[]> {
  const seen = new Set<number>();
  const result: ContentStructureSummary[] = [];

  for (const article of journalArticles) {
    const contentStructureId = Number(article.contentStructureId ?? -1);
    if (contentStructureId <= 0 || seen.has(contentStructureId)) {
      continue;
    }
    seen.add(contentStructureId);
    const response = await safeAuthedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/o/headless-delivery/v1.0/content-structures/${contentStructureId}`,
    );
    if (!response.ok) {
      continue;
    }
    const key = inferContentStructureKey(response.data) || article.ddmStructureKey;
    const siteFriendlyUrl = article.ddmStructureSiteFriendlyUrl ?? article.siteFriendlyUrl;
    result.push({
      contentStructureId,
      ...(key ? {key} : {}),
      name: String(response.data?.name ?? ''),
      ...(siteFriendlyUrl ? {siteFriendlyUrl} : {}),
      ...(siteFriendlyUrl && key ? {exportPath: buildStructureExportPath(config, siteFriendlyUrl, key)} : {}),
    });
  }

  return result;
}

function extractArticleRefs(
  fragmentEntryLinks: Array<Record<string, unknown>>,
  defaultGroupId: number,
): Map<string, ArticleRef> {
  const refs = new Map<string, ArticleRef>();

  for (const link of fragmentEntryLinks) {
    const editableValues = String(link.editableValues ?? '').trim();
    if (!editableValues || editableValues === '{}') {
      continue;
    }
    try {
      collectArticleRefsFromValue(JSON.parse(editableValues), refs, defaultGroupId);
    } catch {
      // Ignore invalid fragment editable values.
    }
  }

  return refs;
}

function collectArticleRefsFromValue(value: unknown, refs: Map<string, ArticleRef>, defaultGroupId: number): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectArticleRefsFromValue(item, refs, defaultGroupId);
    }
    return;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return;
  }

  const directPrefsMap = asRecord(record.portletPreferencesMap);
  const nestedPrefsMap = asRecord(asRecord(record.configuration).portletPreferencesMap);
  collectArticleRefFromPreferences(directPrefsMap, refs, defaultGroupId);
  collectArticleRefFromPreferences(nestedPrefsMap, refs, defaultGroupId);

  for (const item of Object.values(record)) {
    collectArticleRefsFromValue(item, refs, defaultGroupId);
  }
}

function collectArticleRefFromPreferences(
  prefsMap: Record<string, unknown>,
  refs: Map<string, ArticleRef>,
  defaultGroupId: number,
): void {
  const articleId = firstString(prefsMap.articleId);
  if (!articleId) {
    return;
  }

  const groupId = Number(firstString(prefsMap.groupId) ?? defaultGroupId) || defaultGroupId;
  const ddmTemplateKey = firstString(prefsMap.ddmTemplateKey);
  refs.set(articleId, {
    articleId,
    groupId,
    ...(ddmTemplateKey ? {ddmTemplateKey} : {}),
  });
}

async function fetchJournalArticleByUrlTitle(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  urlTitle: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/api/jsonws/journal.journalarticle/get-article-by-url-title?groupId=${groupId}&urlTitle=${encodeURIComponent(urlTitle)}`,
    );
    if (!response.ok || hasJsonWsException(response.data)) {
      return null;
    }
    return response.data ?? null;
  } catch {
    return null;
  }
}

async function fetchLatestJournalArticle(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  articleId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/api/jsonws/journal.journalarticle/get-latest-article?groupId=${groupId}&articleId=${encodeURIComponent(articleId)}&status=0`,
    );
    if (!response.ok || hasJsonWsException(response.data)) {
      return null;
    }
    return response.data ?? null;
  } catch {
    return null;
  }
}

async function fetchStructuredContentById(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  id: number,
): Promise<StructuredContent | null> {
  if (id <= 0) {
    return null;
  }
  const response = await authedGet<StructuredContent>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/structured-contents/${id}`,
  );
  return response.ok ? (response.data ?? null) : null;
}

async function fetchStructuredContentByUuid(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  uuid: string,
): Promise<StructuredContent | null> {
  if (!uuid) {
    return null;
  }
  const response = await authedGet<StructuredContent>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/sites/${groupId}/structured-contents/by-uuid/${encodeURIComponent(uuid)}`,
  );
  return response.ok ? (response.data ?? null) : null;
}

async function fetchContentStructureById(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  id: number,
): Promise<Record<string, unknown> | null> {
  if (id <= 0) {
    return null;
  }
  const response = await safeAuthedGet<Record<string, unknown>>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/content-structures/${id}`,
  );
  return response.ok ? (response.data ?? null) : null;
}

async function safeAuthedGet<T>(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  requestPath: string,
) {
  try {
    return await authedGet<T>(config, apiClient, accessToken, requestPath);
  } catch {
    return {ok: false, status: -1, headers: new Headers(), body: '', data: null};
  }
}

async function resolveStructureSiteByKey(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  startSite: string,
  structureKey: string,
): Promise<{siteFriendlyUrl: string} | null> {
  const siteChain = await buildResourceSiteChain(config, startSite, {apiClient, accessToken});
  for (const site of siteChain) {
    const response = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/o/data-engine/v2.0/sites/${site.siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(structureKey)}`,
    );
    if (response.ok) {
      return {siteFriendlyUrl: site.siteFriendlyUrl};
    }
  }
  return null;
}

async function safeFetchGroupInfo(
  config: AppConfig,
  groupId: number,
  dependencies: {apiClient: LiferayApiClient; accessToken: string},
) {
  try {
    return await fetchGroupInfo(config, groupId, dependencies);
  } catch {
    return null;
  }
}

async function resolveTemplateSiteByKey(
  config: AppConfig,
  startSite: string,
  templateKey: string,
  dependencies: {apiClient: LiferayApiClient; accessToken: string},
): Promise<string | null> {
  const siteChain = await buildResourceSiteChain(config, startSite, dependencies);
  for (const candidate of siteChain) {
    const site = await resolveResourceSite(config, candidate.siteFriendlyUrl, dependencies);
    const templates = await listDdmTemplates(config, site, dependencies, {
      includeCompanyFallback: candidate.siteFriendlyUrl === '/global',
    });
    if (templates.some((item) => matchesDdmTemplate(item, templateKey))) {
      return candidate.siteFriendlyUrl;
    }
  }
  return null;
}

function buildStructureExportPath(config: AppConfig, siteFriendlyUrl: string, key: string): string | undefined {
  try {
    return path.join(resolveArtifactSiteDir(config, 'structure', resolveSiteToken(siteFriendlyUrl)), `${key}.json`);
  } catch {
    return undefined;
  }
}

function buildTemplateExportPath(config: AppConfig, siteFriendlyUrl: string, key: string): string | undefined {
  try {
    return path.join(resolveArtifactSiteDir(config, 'template', resolveSiteToken(siteFriendlyUrl)), `${key}.ftl`);
  } catch {
    return undefined;
  }
}

async function enrichFragmentEntryExportPaths(
  config: AppConfig,
  accessToken: string,
  startSite: string,
  entries: PageFragmentEntry[],
  apiClient: LiferayApiClient,
): Promise<void> {
  const fragmentEntries = entries.filter((entry) => entry.type === 'fragment' && entry.fragmentKey);
  if (fragmentEntries.length === 0) {
    return;
  }

  const cache = new Map<string, {siteFriendlyUrl: string; exportPath: string} | null>();
  for (const entry of fragmentEntries) {
    const fragmentKey = entry.fragmentKey!;
    if (!cache.has(fragmentKey)) {
      cache.set(
        fragmentKey,
        await findFragmentExportPath(config, startSite, fragmentKey, {
          apiClient,
          accessToken,
        }),
      );
    }
    const match = cache.get(fragmentKey);
    if (match) {
      entry.fragmentSiteFriendlyUrl = match.siteFriendlyUrl;
      entry.fragmentExportPath = match.exportPath;
    }
  }
}

async function findFragmentExportPath(
  config: AppConfig,
  startSite: string,
  fragmentKey: string,
  dependencies: {apiClient: LiferayApiClient; accessToken: string},
): Promise<{siteFriendlyUrl: string; exportPath: string} | null> {
  const baseDirs = await resolveFragmentSearchBaseDirs(config);
  const siteChain = await safeBuildFragmentSiteChain(config, startSite, dependencies);
  for (const site of siteChain) {
    for (const baseDir of baseDirs) {
      const siteDir = path.join(baseDir, 'sites', resolveSiteToken(site.siteFriendlyUrl));
      const exportPath = await findFragmentDir(siteDir, fragmentKey);
      if (exportPath) {
        return {siteFriendlyUrl: site.siteFriendlyUrl, exportPath};
      }
    }
  }
  return null;
}

async function resolveFragmentSearchBaseDirs(config: AppConfig): Promise<string[]> {
  const configured = resolveFragmentsBaseDir(config);
  const candidates = [configured];
  if (config.liferayDir && (await fs.pathExists(config.liferayDir))) {
    const entries = await fs.readdir(config.liferayDir, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isDirectory() && /fragments$/i.test(entry.name)) {
        candidates.push(path.join(config.liferayDir, entry.name));
      }
    }
  }
  return [...new Set(candidates)];
}

async function safeBuildFragmentSiteChain(
  config: AppConfig,
  startSite: string,
  dependencies: {apiClient: LiferayApiClient; accessToken: string},
): Promise<Array<{siteFriendlyUrl: string}>> {
  try {
    return await buildResourceSiteChain(config, startSite, dependencies);
  } catch {
    return startSite === '/global'
      ? [{siteFriendlyUrl: '/global'}]
      : [{siteFriendlyUrl: startSite}, {siteFriendlyUrl: '/global'}];
  }
}

async function findFragmentDir(root: string, fragmentKey: string): Promise<string | null> {
  if (!(await fs.pathExists(root))) {
    return null;
  }
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === fragmentKey && path.basename(path.dirname(entryPath)) === 'fragments') {
        return entryPath;
      }
      queue.push(entryPath);
    }
  }
  return null;
}

function inferContentStructureKey(value: Record<string, unknown> | null | undefined): string {
  const explicit = String(value?.dataDefinitionKey ?? value?.key ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const name = String(value?.name ?? '').trim();
  return /^[A-Z0-9_]+$/.test(name) ? name : '';
}

/**
 * Fetch component page data (page element, metadata, fragment links).
 * Single responsibility: isolated API calls for content page data.
 */
async function fetchComponentPageData(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  canonicalFriendlyUrl: string,
  plid: number,
): Promise<{
  pageElement: Record<string, unknown> | null;
  pageMetadata: Record<string, unknown> | null;
  rawFragmentLinks: Array<Record<string, unknown>>;
}> {
  const pageElement = await fetchSitePageElement(config, apiClient, accessToken, siteId, canonicalFriendlyUrl);
  const pageMetadata = await tryFetchSitePageMetadata(config, apiClient, accessToken, siteId, canonicalFriendlyUrl);
  const rawFragmentLinks = await tryFetchFragmentEntryLinks(config, apiClient, accessToken, siteId, plid);

  return {pageElement, pageMetadata, rawFragmentLinks};
}

type TemplateInfo = {
  widgetTemplateCandidates: string[];
  displayPageTemplateCandidates: string[];
  widgetHeadlessDefaultTemplate: string | undefined;
  displayPageDefaultTemplate: string | undefined;
};

function extractTemplatesFromRenderedContents(renderedContents: Array<Record<string, unknown>>): TemplateInfo {
  const widgetTemplateCandidates: string[] = [];
  const displayPageTemplateCandidates: string[] = [];
  let widgetHeadlessDefaultTemplate: string | undefined;
  let displayPageDefaultTemplate: string | undefined;

  for (const entry of renderedContents) {
    const template = firstString(entry.contentTemplateName) ?? firstString(entry.contentTemplateId);
    if (!template) {
      continue;
    }
    const renderedUrl = firstString(entry.renderedContentURL) ?? '';
    const markedAsDefault = Boolean(entry.markedAsDefault);
    const isDisplayPage = renderedUrl.includes('/rendered-content-by-display-page/');
    if (isDisplayPage) {
      displayPageTemplateCandidates.push(template);
      if (markedAsDefault && !displayPageDefaultTemplate) {
        displayPageDefaultTemplate = template;
      }
    } else {
      widgetTemplateCandidates.push(template);
      if (markedAsDefault && !widgetHeadlessDefaultTemplate) {
        widgetHeadlessDefaultTemplate = template;
      }
    }
  }

  return {
    widgetTemplateCandidates,
    displayPageTemplateCandidates,
    widgetHeadlessDefaultTemplate,
    displayPageDefaultTemplate,
  };
}

function enrichJournalArticleWithStructuredContent(
  summary: JournalArticleSummary,
  structuredContent: StructuredContent,
  ddmTemplateKey?: string,
): void {
  const record = asRecord(structuredContent);
  const renderedContents = Array.isArray(record.renderedContents)
    ? record.renderedContents.map((item) => asRecord(item))
    : [];
  const taxonomyCategoryBriefs = Array.isArray(record.taxonomyCategoryBriefs)
    ? record.taxonomyCategoryBriefs.map((item) => asRecord(item))
    : [];

  // Extract template information from rendered contents
  const templates = extractTemplatesFromRenderedContents(renderedContents);
  const widgetDefaultTemplate = ddmTemplateKey || templates.widgetHeadlessDefaultTemplate;

  const taxonomyCategoryNames = taxonomyCategoryBriefs
    .map((item) => firstString(item.taxonomyCategoryName))
    .filter((value): value is string => Boolean(value));

  const priority = Number(record.priority);
  const relatedContentsCount = Array.isArray(record.relatedContents) ? record.relatedContents.length : undefined;
  const availableLanguages = Array.isArray(record.availableLanguages)
    ? record.availableLanguages.map((item) => String(item)).filter(Boolean)
    : [];

  // Assign template properties
  assignOptionalString(summary, 'widgetDefaultTemplate', widgetDefaultTemplate);
  assignOptionalString(summary, 'widgetHeadlessDefaultTemplate', templates.widgetHeadlessDefaultTemplate);
  assignOptionalString(summary, 'displayPageDefaultTemplate', templates.displayPageDefaultTemplate);
  if (templates.widgetTemplateCandidates.length > 0) {
    summary.widgetTemplateCandidates = templates.widgetTemplateCandidates;
  }
  if (templates.displayPageTemplateCandidates.length > 0) {
    summary.displayPageTemplateCandidates = templates.displayPageTemplateCandidates;
  }
  if (renderedContents.length > 0) {
    summary.renderedContents = renderedContents;
  }
  if (taxonomyCategoryBriefs.length > 0) {
    summary.taxonomyCategoryBriefs = taxonomyCategoryBriefs;
  }
  if (taxonomyCategoryNames.length > 0) {
    summary.taxonomyCategoryNames = taxonomyCategoryNames;
  }
  if (availableLanguages.length > 0) {
    summary.availableLanguages = availableLanguages;
  }

  // Assign date properties using helper
  assignOptionalString(summary, 'dateCreated', firstString(record.dateCreated));
  assignOptionalString(summary, 'dateModified', firstString(record.dateModified));
  assignOptionalString(summary, 'datePublished', firstString(record.datePublished));
  assignOptionalString(
    summary,
    'expirationDate',
    firstString(record.expirationDate) ?? firstString(record.dateExpired) ?? firstString(record.dateExpiration),
  );
  assignOptionalString(summary, 'reviewDate', firstString(record.reviewDate) ?? firstString(record.dateReview));
  assignOptionalString(summary, 'description', firstString(record.description));
  assignOptionalString(summary, 'externalReferenceCode', firstString(record.externalReferenceCode));
  assignOptionalString(summary, 'uuid', firstString(record.uuid));

  // Assign numeric properties
  assignOptionalNumber(summary, 'siteId', Number(record.siteId));
  assignOptionalNumber(summary, 'structuredContentFolderId', Number(record.structuredContentFolderId));
  assignOptionalFiniteNumber(summary, 'priority', priority);

  // Assign boolean properties
  assignOptionalBoolean(summary, 'neverExpire', record.neverExpire);
  assignOptionalBoolean(summary, 'subscribed', record.subscribed);
  if (typeof relatedContentsCount === 'number') {
    summary.relatedContentsCount = relatedContentsCount;
  }
}
