import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import path from 'node:path';
import fs from 'fs-extra';
import type {LiferayApiClient} from '../../../core/http/client.js';
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
import {
  resolveSiteToken,
  resolveStructuresBaseDir,
  resolveTemplatesBaseDir,
  resolveFragmentsBaseDir,
} from '../resource/liferay-resource-paths.js';
import {
  buildResourceSiteChain,
  fetchGroupInfo,
  listDdmTemplates,
  resolveResourceSite,
} from '../resource/liferay-resource-shared.js';

type LayoutMatch = {layout: Layout; locale: string | null};
type ArticleRef = {articleId: string; groupId: number; ddmTemplateKey?: string};

const CLASS_NAME_LAYOUT = 'com.liferay.portal.kernel.model.Layout';
const CLASS_NAME_JOURNAL_ARTICLE = 'com.liferay.journal.model.JournalArticle';
const classNameIdCache = new Map<string, number>();

export async function fetchSiteRootInventory(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  site: ResolvedSite,
  privateLayout: boolean,
): Promise<LiferayInventoryPageResult> {
  const layouts = await fetchLayoutsByParent(config, apiClient, accessToken, site.id, privateLayout, 0);

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
  apiClient: LiferayApiClient,
  accessToken: string,
  site: ResolvedSite,
  urlTitle: string,
): Promise<LiferayInventoryPageResult> {
  const filter = encodeURIComponent(`friendlyUrlPath eq '${urlTitle}'`);
  const response = await authedGet<{items?: StructuredContent[]}>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/sites/${site.id}/structured-contents?filter=${filter}&pageSize=1`,
  );
  let article: StructuredContent | undefined = response.ok ? response.data?.items?.[0] : undefined;
  let jsonwsArticle = await fetchJournalArticleByUrlTitle(config, apiClient, accessToken, site.id, urlTitle);

  // Fallback: try JSONWS get-article-by-url-title when headless delivery returns nothing.
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
      {
        code: 'LIFERAY_INVENTORY_ERROR',
      },
    );
  }

  const structuredContentId = article.id && article.id > 0 ? article.id : -1;
  const structuredContent =
    structuredContentId > 0
      ? await fetchStructuredContentById(config, apiClient, accessToken, structuredContentId)
      : null;
  const articleRef: ArticleRef = {
    articleId: String(article.key ?? jsonwsArticle?.articleId ?? ''),
    groupId: site.id,
    ...(firstString(jsonwsArticle?.ddmTemplateKey) ? {ddmTemplateKey: firstString(jsonwsArticle?.ddmTemplateKey)} : {}),
  };
  if (!jsonwsArticle && articleRef.articleId) {
    jsonwsArticle = await fetchLatestJournalArticle(config, apiClient, accessToken, site.id, articleRef.articleId);
  }
  const journalArticle = await buildJournalArticleSummary(config, apiClient, accessToken, articleRef, {
    article: jsonwsArticle,
    structuredContent,
    fallbackSite: site,
    fallbackTitle: article.title,
    fallbackContentStructureId: article.contentStructureId,
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
    pageType: 'displayPage',
    pageSubtype: 'journalArticle',
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
      contentStructureId: article.contentStructureId ?? -1,
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
  const portlets = collectPortletPagePortlets(layout.typeSettings ?? '', layoutDetails.layoutTemplateId);
  const canonicalFriendlyUrl = layout.friendlyURL ?? friendlyUrl;
  const pageUrl = buildPageUrl(site.friendlyUrlPath, canonicalFriendlyUrl, privateLayout);
  const componentInspectionSupported = String(layout.type ?? '').toLowerCase() === 'content';
  const layoutClassNameId = await resolveClassNameId(config, apiClient, accessToken, CLASS_NAME_LAYOUT);
  let fragmentEntryLinks: PageFragmentEntry[] | undefined;
  let widgets: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}> | undefined;
  let journalArticles: JournalArticleSummary[] | undefined;
  let contentStructures: ContentStructureSummary[] | undefined;

  if (componentInspectionSupported) {
    const pageElement = await fetchSitePageElement(config, apiClient, accessToken, site.id, canonicalFriendlyUrl);
    const rawFragmentLinks = await tryFetchFragmentEntryLinks(
      config,
      apiClient,
      accessToken,
      site.id,
      layout.plid ?? -1,
    );
    fragmentEntryLinks = collectPageElements(pageElement, rawFragmentLinks, matchedLocale);
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

  return {
    pageType: 'regularPage',
    pageSubtype: layout.type ?? '',
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    groupId: site.id,
    url: pageUrl,
    friendlyUrl: canonicalFriendlyUrl,
    ...(matchedLocale ? {matchedLocale, requestedFriendlyUrl: friendlyUrl} : {}),
    pageName: layout.nameCurrentValue ?? '',
    privateLayout,
    layout: {
      layoutId: layout.layoutId ?? -1,
      plid: layout.plid ?? -1,
      friendlyUrl: canonicalFriendlyUrl,
      type: layout.type ?? '',
      hidden: layout.hidden ?? false,
    },
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
    ...(portlets.length > 0 ? {portlets} : {}),
    ...(componentInspectionSupported
      ? {
          componentInspectionSupported,
          fragmentEntryLinks,
          widgets,
          journalArticles,
          contentStructures,
        }
      : {}),
  };
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
  const cached = classNameIdCache.get(cacheKey);
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

  classNameIdCache.set(cacheKey, resolved);
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
  const slug = friendlyUrl.startsWith('/') ? friendlyUrl.slice(1) : friendlyUrl;
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

  const structuredContentId = Number(options?.structuredContent?.id ?? article?.id ?? article?.resourcePrimKey ?? -1);
  if (structuredContentId > 0) {
    const structuredContent =
      options?.structuredContent ??
      (await fetchStructuredContentById(config, apiClient, accessToken, structuredContentId));
    if (structuredContent?.contentStructureId) {
      summary.contentStructureId = Number(structuredContent.contentStructureId);
    }
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
        if (articleSite?.friendlyUrl) {
          const structureSite = await resolveStructureSiteByKey(
            config,
            apiClient,
            accessToken,
            articleSite.friendlyUrl,
            summary.ddmStructureKey,
          );
          const siteFriendlyUrl = structureSite?.siteFriendlyUrl ?? articleSite.friendlyUrl;
          summary.ddmStructureSiteFriendlyUrl = siteFriendlyUrl;
          summary.structureExportPath = buildStructureExportPath(config, siteFriendlyUrl, summary.ddmStructureKey);
        }
      }
    }
    const contentFields = summarizeContentFields(structuredContent?.contentFields);
    if (contentFields.length > 0) {
      summary.contentFields = contentFields;
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
    if (templates.some((item) => matchesTemplateKey(item, templateKey))) {
      return candidate.siteFriendlyUrl;
    }
  }
  return null;
}

function matchesTemplateKey(item: Record<string, unknown>, templateKey: string): boolean {
  return (
    templateKey === String(item.templateKey ?? '') ||
    templateKey === String(item.templateId ?? '') ||
    templateKey === String(item.externalReferenceCode ?? '') ||
    templateKey === String(item.nameCurrentValue ?? '') ||
    templateKey === String(item.name ?? '')
  );
}

function buildStructureExportPath(config: AppConfig, siteFriendlyUrl: string, key: string): string | undefined {
  try {
    return path.join(resolveStructuresBaseDir(config), resolveSiteToken(siteFriendlyUrl), `${key}.json`);
  } catch {
    return undefined;
  }
}

function buildTemplateExportPath(config: AppConfig, siteFriendlyUrl: string, key: string): string | undefined {
  try {
    return path.join(resolveTemplatesBaseDir(config), resolveSiteToken(siteFriendlyUrl), `${key}.ftl`);
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
