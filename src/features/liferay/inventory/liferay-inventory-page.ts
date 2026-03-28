import {CliError} from '../../../cli/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {
  authedGet,
  expectJsonSuccess,
  fetchAccessToken,
  resolveSite,
  type ResolvedSite,
} from './liferay-inventory-shared.js';
import {
  buildLayoutDetails,
  buildPageUrl,
  fetchLayoutsByParent,
  type Layout,
} from '../page-layout/liferay-layout-shared.js';

type InventoryPageDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

type InventoryPageRoute = 'siteRoot' | 'displayPage' | 'regularPage';

type InventoryPageRequest = {
  siteSlug: string;
  friendlyUrl: string;
  privateLayout: boolean;
  route: InventoryPageRoute;
  displayPageUrlTitle: string | null;
};

type StructuredContent = {
  id?: number;
  key?: string;
  title?: string;
  friendlyUrlPath?: string;
  contentStructureId?: number;
  contentFields?: unknown[];
};

type ContentFieldSummary = {
  path: string;
  label: string;
  name: string;
  type: string;
  value: string;
};

type JournalArticleSummary = {
  articleId: string;
  title: string;
  ddmStructureKey: string;
  ddmTemplateKey?: string;
  contentStructureId?: number;
  contentFields?: ContentFieldSummary[];
};

type ContentStructureSummary = {
  contentStructureId: number;
  name: string;
};

type PageFragmentEntry = {
  type: 'fragment' | 'widget';
  fragmentKey?: string;
  widgetName?: string;
  portletId?: string;
  configuration?: Record<string, string>;
};

export type LiferayInventoryPageResult =
  | {
      pageType: 'siteRoot';
      siteName: string;
      siteFriendlyUrl: string;
      groupId: number;
      url: string;
      pages: Array<{layoutId: number; friendlyUrl: string; name: string; type: string}>;
    }
  | {
      pageType: 'displayPage';
      pageSubtype: 'journalArticle';
      siteName: string;
      siteFriendlyUrl: string;
      groupId: number;
      url: string;
      friendlyUrl: string;
      article: {
        id: number;
        key: string;
        title: string;
        friendlyUrlPath: string;
        contentStructureId: number;
      };
      articleProperties?: {
        contentFields?: ContentFieldSummary[];
      };
    }
  | {
      pageType: 'regularPage';
      pageSubtype: string;
      siteName: string;
      siteFriendlyUrl: string;
      groupId: number;
      url: string;
      friendlyUrl: string;
      pageName: string;
      privateLayout: boolean;
      layout: {
        layoutId: number;
        plid: number;
        friendlyUrl: string;
        type: string;
        hidden: boolean;
      };
      layoutDetails: {
        layoutTemplateId?: string;
        targetUrl?: string;
      };
      adminUrls: {
        edit: string;
        configure: string;
        translate: string;
      };
      componentInspectionSupported?: boolean;
      fragmentEntryLinks?: PageFragmentEntry[];
      widgets?: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}>;
      journalArticles?: JournalArticleSummary[];
      contentStructures?: ContentStructureSummary[];
    };

export type ResolvedRegularLayoutPage = {
  siteName: string;
  siteFriendlyUrl: string;
  groupId: number;
  url: string;
  friendlyUrl: string;
  pageName: string;
  privateLayout: boolean;
  layoutType: string;
  layoutId: number;
  plid: number;
  hidden: boolean;
  layoutDetails: {
    layoutTemplateId?: string;
    targetUrl?: string;
  };
  adminUrls: {
    edit: string;
    configure: string;
    translate: string;
  };
};

export async function runLiferayInventoryPage(
  config: AppConfig,
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean},
  dependencies?: InventoryPageDependencies,
): Promise<LiferayInventoryPageResult> {
  const request = resolveInventoryPageRequest(options);
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const site = await resolveSite(config, request.siteSlug, dependencies);

  if (request.route === 'siteRoot') {
    return fetchSiteRootInventory(config, apiClient, accessToken, site, request.privateLayout);
  }

  if (request.route === 'displayPage') {
    return fetchDisplayPageInventory(config, apiClient, accessToken, site, request.displayPageUrlTitle ?? '');
  }

  return fetchRegularPageInventory(config, apiClient, accessToken, site, request.friendlyUrl, request.privateLayout);
}

export function formatLiferayInventoryPage(result: LiferayInventoryPageResult): string {
  if (result.pageType === 'siteRoot') {
    const lines = [
      'SITE ROOT',
      `site=${result.siteName}`,
      `siteFriendlyUrl=${result.siteFriendlyUrl}`,
      `groupId=${result.groupId}`,
      `url=${result.url}`,
      `pages=${result.pages.length}`,
    ];
    for (const page of result.pages) {
      lines.push(`- layoutId=${page.layoutId} type=${page.type} friendlyUrl=${page.friendlyUrl} name=${page.name}`);
    }
    return lines.join('\n');
  }

  if (result.pageType === 'displayPage') {
    const lines = [
      'DISPLAY PAGE',
      `site=${result.siteName}`,
      `siteFriendlyUrl=${result.siteFriendlyUrl}`,
      `groupId=${result.groupId}`,
      `url=${result.url}`,
      `friendlyUrl=${result.friendlyUrl}`,
      `articleId=${result.article.id}`,
      `articleKey=${result.article.key}`,
      `articleTitle=${result.article.title}`,
      `contentStructureId=${result.article.contentStructureId}`,
    ];
    for (const field of result.articleProperties?.contentFields ?? []) {
      lines.push(`contentField ${field.path}=${field.value}`);
    }
    return lines.join('\n');
  }

  const lines = [
    'REGULAR PAGE',
    `site=${result.siteName}`,
    `siteFriendlyUrl=${result.siteFriendlyUrl}`,
    `groupId=${result.groupId}`,
    `url=${result.url}`,
    `friendlyUrl=${result.friendlyUrl}`,
    `pageName=${result.pageName}`,
    `layoutType=${result.pageSubtype}`,
    `layoutId=${result.layout.layoutId}`,
    `plid=${result.layout.plid}`,
    `hidden=${result.layout.hidden}`,
    `privateLayout=${result.privateLayout}`,
    `editUrl=${result.adminUrls.edit}`,
  ];

  if (result.layoutDetails.layoutTemplateId) {
    lines.push(`layoutTemplateId=${result.layoutDetails.layoutTemplateId}`);
  }
  if (result.layoutDetails.targetUrl) {
    lines.push(`targetUrl=${result.layoutDetails.targetUrl}`);
  }
  if (result.fragmentEntryLinks && result.fragmentEntryLinks.length > 0) {
    lines.push(`fragmentEntryLinks=${result.fragmentEntryLinks.length}`);
  }
  if (result.journalArticles && result.journalArticles.length > 0) {
    lines.push(`journalArticles=${result.journalArticles.length}`);
    for (const article of result.journalArticles) {
      lines.push(`article ${article.articleId} title=${article.title} structure=${article.ddmStructureKey}`);
      for (const field of article.contentFields ?? []) {
        lines.push(`contentField ${field.path}=${field.value}`);
      }
    }
  }

  return lines.join('\n');
}

export function resolveInventoryPageRequest(options: {
  url?: string;
  site?: string;
  friendlyUrl?: string;
  privateLayout?: boolean;
}): InventoryPageRequest {
  const sanitizedUrl = sanitizeInventoryUrl(options.url);

  if (sanitizedUrl) {
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

  throw new CliError('Debe proporcionar --url o bien (--site y --friendly-url).', {
    code: 'LIFERAY_INVENTORY_ERROR',
  });
}

async function fetchSiteRootInventory(
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

async function fetchDisplayPageInventory(
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
  const success = await expectJsonSuccess(response, 'structured-contents by friendlyUrlPath');
  const article = success.data?.items?.[0];

  if (!article) {
    throw new CliError(`No structured content found with friendlyUrlPath=${urlTitle}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const structuredContent = article.id
    ? await fetchStructuredContentById(config, apiClient, accessToken, article.id)
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

async function fetchRegularPageInventory(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  site: ResolvedSite,
  friendlyUrl: string,
  privateLayout: boolean,
): Promise<LiferayInventoryPageResult> {
  const layout = await findLayoutByFriendlyUrl(config, apiClient, accessToken, site.id, friendlyUrl, privateLayout);
  if (!layout) {
    throw new CliError(`Layout not found for friendlyUrl=${friendlyUrl} in site=${site.friendlyUrlPath}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const layoutDetails = buildLayoutDetails(layout.typeSettings ?? '');
  const pageUrl = buildPageUrl(site.friendlyUrlPath, friendlyUrl, privateLayout);
  const componentInspectionSupported = String(layout.type ?? '').toLowerCase() === 'content';
  let fragmentEntryLinks: PageFragmentEntry[] | undefined;
  let widgets: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}> | undefined;
  let journalArticles: JournalArticleSummary[] | undefined;
  let contentStructures: ContentStructureSummary[] | undefined;

  if (componentInspectionSupported) {
    const pageElement = await fetchSitePageElement(config, apiClient, accessToken, site.id, friendlyUrl);
    const rawFragmentLinks = await tryFetchFragmentEntryLinks(
      config,
      apiClient,
      accessToken,
      site.id,
      layout.plid ?? -1,
    );
    fragmentEntryLinks = collectPageElements(pageElement, rawFragmentLinks);
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
    friendlyUrl,
    pageName: layout.nameCurrentValue ?? '',
    privateLayout,
    layout: {
      layoutId: layout.layoutId ?? -1,
      plid: layout.plid ?? -1,
      friendlyUrl: layout.friendlyURL ?? friendlyUrl,
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

export async function resolveRegularLayoutPage(
  config: AppConfig,
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean},
  dependencies?: InventoryPageDependencies,
): Promise<ResolvedRegularLayoutPage> {
  const request = resolveInventoryPageRequest(options);
  if (request.route !== 'regularPage') {
    throw new CliError('Solo se puede resolver una regular page para este flujo.', {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const site = await resolveSite(config, request.siteSlug, dependencies);
  const layout = await findLayoutByFriendlyUrl(
    config,
    apiClient,
    accessToken,
    site.id,
    request.friendlyUrl,
    request.privateLayout,
  );
  if (!layout) {
    throw new CliError(`Layout not found for friendlyUrl=${request.friendlyUrl} in site=${site.friendlyUrlPath}.`, {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const layoutDetails = buildLayoutDetails(layout.typeSettings ?? '');
  const pageUrl = buildPageUrl(site.friendlyUrlPath, request.friendlyUrl, request.privateLayout);

  return {
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    groupId: site.id,
    url: pageUrl,
    friendlyUrl: request.friendlyUrl,
    pageName: layout.nameCurrentValue ?? '',
    privateLayout: request.privateLayout,
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
  parentLayoutId = 0,
): Promise<Layout | null> {
  const layouts = await fetchLayoutsByParent(config, apiClient, accessToken, groupId, privateLayout, parentLayoutId);

  for (const layout of layouts) {
    if ((layout.friendlyURL ?? '') === friendlyUrl) {
      return layout;
    }
  }

  for (const layout of layouts) {
    const child = await findLayoutByFriendlyUrl(
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

function extractDisplayPageUrlTitle(friendlyUrl: string): string | null {
  const candidate = friendlyUrl.startsWith('/') ? friendlyUrl.slice(1) : friendlyUrl;
  if (!candidate.startsWith('w/')) {
    return null;
  }
  return candidate.slice(2);
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

function collectPageElements(
  pageElement: Record<string, unknown> | null,
  fragmentEntryLinks: Array<Record<string, unknown>>,
): PageFragmentEntry[] {
  const result: PageFragmentEntry[] = [];
  collectPageElementsRecursive(pageElement, result);

  for (const entry of result) {
    if (entry.type !== 'widget' || !entry.widgetName) {
      continue;
    }
    const match = fragmentEntryLinks.find((item) => String(item.portletId ?? '').includes(entry.widgetName!));
    if (match) {
      entry.portletId = String(match.portletId ?? '');
    }
  }

  return result;
}

function collectPageElementsRecursive(element: Record<string, unknown> | null, result: PageFragmentEntry[]): void {
  if (!element) {
    return;
  }
  const type = String(element.type ?? '');
  if (type === 'Fragment') {
    const definition = asRecord(element.definition);
    const key = String(asRecord(definition.fragment).key ?? '').trim();
    if (key) {
      result.push({
        type: 'fragment',
        fragmentKey: key,
        configuration: recordToStringMap(asRecord(definition.fragmentConfig)),
      });
    }
  } else if (type === 'Widget') {
    const widgetInstance = asRecord(asRecord(element.definition).widgetInstance);
    const widgetName = String(widgetInstance.widgetName ?? '').trim();
    if (widgetName) {
      result.push({
        type: 'widget',
        widgetName,
        configuration: recordToStringMap(asRecord(widgetInstance.widgetConfig)),
      });
    }
  }
  for (const child of asArrayOfRecords(element.pageElements)) {
    collectPageElementsRecursive(child, result);
  }
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

function summarizeContentFields(contentFields: unknown): ContentFieldSummary[] {
  const result: ContentFieldSummary[] = [];
  appendContentFieldSummary(result, contentFields, []);
  return result;
}

function appendContentFieldSummary(target: ContentFieldSummary[], contentFields: unknown, parentPath: string[]): void {
  if (!Array.isArray(contentFields)) {
    return;
  }
  for (const item of contentFields) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const field = item as Record<string, unknown>;
    const label = firstNonBlank(String(field.label ?? '').trim(), String(field.name ?? '').trim());
    const name = String(field.name ?? '').trim();
    const type = firstNonBlank(
      String(field.dataType ?? '').trim(),
      inferContentFieldType(asRecord(field.contentFieldValue)),
    );
    const value = summarizeContentFieldValue(asRecord(field.contentFieldValue));
    if (value !== '') {
      target.push({
        path: [...parentPath, label || name].filter(Boolean).join(' > '),
        label,
        name,
        type,
        value,
      });
    }
    const nextPath = shouldIncludeContentFieldLabelInPath(label, name)
      ? [...parentPath, label || name].filter(Boolean)
      : parentPath;
    appendContentFieldSummary(target, field.nestedContentFields, nextPath);
  }
}

function summarizeContentFieldValue(contentFieldValue: Record<string, unknown>): string {
  const data = String(contentFieldValue.data ?? '').trim();
  if (data !== '') {
    return data.replace(/\s+/g, ' ').trim();
  }
  if (Object.keys(contentFieldValue).length > 0) {
    return JSON.stringify(contentFieldValue);
  }
  return '';
}

function inferContentFieldType(contentFieldValue: Record<string, unknown>): string {
  if ('image' in contentFieldValue) {
    return 'image';
  }
  if ('document' in contentFieldValue) {
    return 'document';
  }
  if ('data' in contentFieldValue) {
    return 'string';
  }
  return '';
}

function shouldIncludeContentFieldLabelInPath(label: string, name: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === 'grup de camps' || normalized === 'group of fields') {
    return false;
  }
  return !name.trim().toLowerCase().endsWith('fieldset');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function recordToStringMap(value: Record<string, unknown>): Record<string, string> | undefined {
  const entries = Object.entries(value).map(([key, item]) => [key, String(item)]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value.find((item) => String(item ?? '').trim() !== '');
    return first === undefined ? undefined : String(first).trim();
  }
  const normalized = String(value ?? '').trim();
  return normalized === '' ? undefined : normalized;
}

function firstNonBlank(...values: string[]): string {
  return values.find((value) => value.trim() !== '') ?? '';
}

function hasJsonWsException(value: unknown): boolean {
  return Boolean(asRecord(value).exception);
}
