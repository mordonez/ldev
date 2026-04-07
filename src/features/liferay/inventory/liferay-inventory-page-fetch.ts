import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {authedGet, type ResolvedSite} from './liferay-inventory-shared.js';
import {
  buildLayoutDetails,
  buildPageUrl,
  fetchLayoutsByParent,
  type Layout,
} from '../page-layout/liferay-layout-shared.js';
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
import type {LiferayInventoryPageResult, ResolvedRegularLayoutPage} from './liferay-inventory-page.js';

type LayoutMatch = {layout: Layout; locale: string | null};

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

  // Fallback: try JSONWS get-article-by-url-title when headless delivery returns nothing.
  if (!article) {
    const jsonwsResponse = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/api/jsonws/journal.journalarticle/get-article-by-url-title?groupId=${site.id}&urlTitle=${encodeURIComponent(urlTitle)}`,
    );
    if (jsonwsResponse.ok && !hasJsonWsException(jsonwsResponse.data)) {
      const jw = jsonwsResponse.data ?? {};
      article = {
        id: Number(jw['resourcePrimKey'] ?? jw['id'] ?? -1) || undefined,
        key: String(jw['articleId'] ?? ''),
        title: String(jw['titleCurrentValue'] ?? jw['title'] ?? ''),
        friendlyUrlPath: urlTitle,
        contentStructureId: Number(jw['contentStructureId'] ?? -1) || undefined,
      };
    }
  }

  if (!article) {
    throw new CliError(`No structured content found with friendlyUrlPath=${urlTitle}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const structuredContentId = article.id && article.id > 0 ? article.id : -1;
  const structuredContent =
    structuredContentId > 0
      ? await fetchStructuredContentById(config, apiClient, accessToken, structuredContentId)
      : null;

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
    ...(structuredContent
      ? {
          articleProperties: {
            contentFields: summarizeContentFields(structuredContent.contentFields),
          },
        }
      : {}),
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
  const canonicalFriendlyUrl = layout.friendlyURL ?? friendlyUrl;
  const pageUrl = buildPageUrl(site.friendlyUrlPath, canonicalFriendlyUrl, privateLayout);
  const componentInspectionSupported = String(layout.type ?? '').toLowerCase() === 'content';
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
    adminUrls: {
      edit: `${config.liferay.url}${pageUrl}?p_l_mode=edit`,
      configure: `${config.liferay.url}/group/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_tabs1=general&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_redirect=${encodeURIComponent(pageUrl)}&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_selPlid=${layout.plid ?? -1}`,
      translate: `${config.liferay.url}/group/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_tabs1=translation&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_redirect=${encodeURIComponent(pageUrl)}&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_selPlid=${layout.plid ?? -1}`,
    },
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
    adminUrls: {
      edit: `${config.liferay.url}${pageUrl}?p_l_mode=edit`,
      configure: `${config.liferay.url}/group/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_tabs1=general&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_redirect=${encodeURIComponent(pageUrl)}&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_selPlid=${layout.plid ?? -1}`,
      translate: `${config.liferay.url}/group/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_tabs1=translation&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_redirect=${encodeURIComponent(pageUrl)}&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_selPlid=${layout.plid ?? -1}`,
    },
  };
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
    const article = await fetchLatestJournalArticle(config, apiClient, accessToken, ref.groupId, ref.articleId);
    const summary: JournalArticleSummary = {
      articleId: ref.articleId,
      title: String(article?.titleCurrentValue ?? ref.articleId),
      ddmStructureKey: String(article?.ddmStructureKey ?? ''),
      ...(ref.ddmTemplateKey ? {ddmTemplateKey: ref.ddmTemplateKey} : {}),
    };

    const structuredContentId = Number(article?.id ?? -1);
    if (structuredContentId > 0) {
      const structuredContent = await fetchStructuredContentById(config, apiClient, accessToken, structuredContentId);
      if (structuredContent?.contentStructureId) {
        summary.contentStructureId = Number(structuredContent.contentStructureId);
      }
      const contentFields = summarizeContentFields(structuredContent?.contentFields);
      if (contentFields.length > 0) {
        summary.contentFields = contentFields;
      }
    }

    result.push(summary);
  }

  return result;
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
    const response = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/o/headless-delivery/v1.0/content-structures/${contentStructureId}`,
    );
    if (!response.ok) {
      continue;
    }
    result.push({
      contentStructureId,
      name: String(response.data?.name ?? ''),
    });
  }

  return result;
}

function extractArticleRefs(
  fragmentEntryLinks: Array<Record<string, unknown>>,
  defaultGroupId: number,
): Map<string, {articleId: string; groupId: number; ddmTemplateKey?: string}> {
  const refs = new Map<string, {articleId: string; groupId: number; ddmTemplateKey?: string}>();

  for (const link of fragmentEntryLinks) {
    const editableValues = String(link.editableValues ?? '').trim();
    if (!editableValues || editableValues === '{}') {
      continue;
    }
    try {
      const parsed = JSON.parse(editableValues) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (!key.includes('journal_content') && !key.includes('JournalContent')) {
          continue;
        }
        const prefsMap = asRecord(
          asRecord(value).portletPreferencesMap ?? asRecord(asRecord(value).configuration).portletPreferencesMap,
        );
        const articleId = firstString(prefsMap.articleId);
        if (!articleId) {
          continue;
        }
        const groupId = Number(firstString(prefsMap.groupId) ?? defaultGroupId) || defaultGroupId;
        const ddmTemplateKey = firstString(prefsMap.ddmTemplateKey);
        refs.set(articleId, {
          articleId,
          groupId,
          ...(ddmTemplateKey ? {ddmTemplateKey} : {}),
        });
      }
    } catch {
      // Ignore invalid fragment editable values.
    }
  }

  return refs;
}

async function fetchLatestJournalArticle(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  articleId: string,
): Promise<Record<string, unknown> | null> {
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
