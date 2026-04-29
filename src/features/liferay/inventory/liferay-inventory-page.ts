import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {createInventoryGateway} from './liferay-inventory-shared.js';
import {resolveSite} from '../portal/site-resolution.js';
import {
  isRegularPageRequest,
  isSiteRootRequest,
  privateLayoutForInventoryPageRequest,
  resolveInventoryPageRequest,
  type InventoryPageOptions,
  type InventoryPageRequest,
} from './liferay-inventory-page-url.js';
import {buildPageUrl} from '../page-layout/liferay-layout-shared.js';
import {
  fetchDisplayPageInventory,
  fetchRegularPageInventory,
  fetchSiteRootInventory,
  resolveRegularLayoutPageData,
} from './liferay-inventory-page-fetch.js';
import {
  validateLiferayInventoryPageJsonResult,
  type LiferayInventoryPageJsonResult,
} from './liferay-inventory-page-json-schema.js';
import {validateLiferayInventoryPageResultV2} from './liferay-inventory-page-schema.js';
import type {
  ContentStructureSummary,
  JournalArticleSummary,
  PageFragmentEntry,
} from './liferay-inventory-page-assemble.js';
import type {PageEvidence} from './liferay-inventory-page-evidence.js';
import type {HeadlessSitePagePayload} from '../page-layout/liferay-site-page-shared.js';

export {resolveInventoryPageRequest};
export {formatLiferayInventoryPage} from './liferay-inventory-page-format.js';
export type {LiferayInventoryPageJsonResult} from './liferay-inventory-page-json-schema.js';

type InventoryPageDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
  gateway?: LiferayGateway;
};

export type InventoryPageConfigurationGeneral = {
  type: string;
  name: string;
  hiddenInNavigation: boolean;
  friendlyUrl: string;
  queryString: string;
  targetType: string;
  target: string;
  categories: string[];
  tags: string[];
  privateLayout: boolean;
};

export type InventoryPageConfigurationDesign = {
  theme: {
    useInheritedTheme: boolean;
    themeId: string;
    colorSchemeId: string;
    styleBookEntryId: number;
    masterLayoutPlid: number;
    faviconFileEntryId: number;
  };
  themeFlags: {
    showHeader?: boolean;
    showFooter?: boolean;
    showHeaderSearch?: boolean;
    wrapWidgetPageContent?: boolean;
    layoutUpdateable?: boolean;
    published?: boolean;
  };
  customCss: string;
  customJavascript: string;
  customFields: {[key: string]: unknown};
};

export type InventoryPageConfigurationSeo = {
  title: string;
  description: string;
  keywords: string;
  robots: string;
  sitemap: {
    include?: boolean;
    changefreq: string;
  };
};

export type InventoryPageConfigurationOpenGraph = {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  imageAlt?: string;
  imageFileEntryId?: number;
};

export type InventoryPageConfigurationCustomMetaTags = {
  values: unknown;
};

export type InventoryPageConfigurationTabs = {
  general: InventoryPageConfigurationGeneral;
  design: InventoryPageConfigurationDesign;
  seo: InventoryPageConfigurationSeo;
  openGraph: InventoryPageConfigurationOpenGraph;
  customMetaTags: InventoryPageConfigurationCustomMetaTags;
};

export type InventoryPageRawLayout = {
  layoutId: number;
  plid: number;
  type: string;
  nameCurrentValue: string;
  titleCurrentValue: string;
  descriptionCurrentValue: string;
  keywordsCurrentValue: string;
  robotsCurrentValue: string;
  friendlyURL: string;
  hidden: boolean;
  themeId: string;
  colorSchemeId: string;
  styleBookEntryId: number;
  masterLayoutPlid: number;
  faviconFileEntryId: number;
  css: string;
  javascript: string;
};

export type InventoryPageConfigurationRaw = {
  layout: InventoryPageRawLayout;
  typeSettings: {[key: string]: string};
  sitePageMetadata?: HeadlessSitePagePayload;
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
      contentItemType: 'WebContent';
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
      adminUrls?: {
        edit: string;
        translate: string;
      };
      evidence?: PageEvidence[];
      journalArticles?: JournalArticleSummary[];
      contentStructures?: ContentStructureSummary[];
    }
  | {
      pageType: 'regularPage';
      pageSubtype: string;
      pageUiType: string;
      siteName: string;
      siteFriendlyUrl: string;
      groupId: number;
      url: string;
      friendlyUrl: string;
      matchedLocale?: string;
      requestedFriendlyUrl?: string;
      pageName: string;
      privateLayout: boolean;
      pageSummary?: {
        layoutTemplateId?: string;
        targetUrl?: string;
        fragmentCount: number;
        widgetCount: number;
      };
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
        view: string;
        edit: string;
        configureGeneral: string;
        configureDesign: string;
        configureSeo: string;
        configureOpenGraph: string;
        configureCustomMetaTags: string;
        translate: string;
      };
      configurationTabs?: InventoryPageConfigurationTabs;
      configurationRaw?: InventoryPageConfigurationRaw;
      componentInspectionSupported?: boolean;
      evidence?: PageEvidence[];
      portlets?: PagePortletSummary[];
      fragmentEntryLinks?: PageFragmentEntry[];
      widgets?: Array<{widgetName: string; portletId?: string; configuration?: Record<string, string>}>;
      journalArticles?: JournalArticleSummary[];
      contentStructures?: ContentStructureSummary[];
    };

export type PagePortletSummary = {
  columnId: string;
  position: number;
  portletId: string;
  portletName: string;
  instanceId?: string;
  configuration?: Record<string, string>;
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
    view: string;
    edit: string;
    configureGeneral: string;
    configureDesign: string;
    configureSeo: string;
    configureOpenGraph: string;
    configureCustomMetaTags: string;
    translate: string;
  };
};

export async function runLiferayInventoryPage(
  config: AppConfig,
  requestOrOptions: InventoryPageRequest | InventoryPageOptions,
  dependencies?: InventoryPageDependencies,
): Promise<LiferayInventoryPageResult> {
  const finalizeResult = (result: LiferayInventoryPageResult): LiferayInventoryPageResult =>
    validateLiferayInventoryPageResultV2(result) as LiferayInventoryPageResult;

  const request = isInventoryPageRequest(requestOrOptions)
    ? requestOrOptions
    : resolveInventoryPageRequest(requestOrOptions);
  const effectiveConfig = config;
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(effectiveConfig, apiClient, dependencies);
  const siteDependencies = {...dependencies, gateway};

  if (request.kind === 'portalHome') {
    const homeRequest = await resolvePortalHomeRequest(effectiveConfig);
    if (homeRequest) {
      const site = await resolveSite(effectiveConfig, homeRequest.site, siteDependencies);
      return fetchRegularPageInventory(
        effectiveConfig,
        gateway,
        apiClient,
        site,
        homeRequest.friendlyUrl,
        privateLayoutForInventoryPageRequest(homeRequest),
        homeRequest.localeHint,
      ).then(finalizeResult);
    }
    const site = await resolveSite(effectiveConfig, 'global', siteDependencies);
    return finalizeResult(await fetchSiteRootInventory(gateway, site, false));
  }

  const site = await resolveSite(effectiveConfig, request.site, siteDependencies);
  if (isSiteRootRequest(request)) {
    if (request.resolveHomeRedirect || (!isInventoryPageRequest(requestOrOptions) && requestOrOptions.url)) {
      const redirectedRequest = await resolveSiteHomeRequest(effectiveConfig, request);
      if (redirectedRequest) {
        return fetchRegularPageInventory(
          effectiveConfig,
          gateway,
          apiClient,
          site,
          redirectedRequest.friendlyUrl,
          privateLayoutForInventoryPageRequest(redirectedRequest),
          redirectedRequest.localeHint,
        ).then(finalizeResult);
      }
    }
    return finalizeResult(await fetchSiteRootInventory(gateway, site, privateLayoutForInventoryPageRequest(request)));
  }

  if (request.kind === 'webContentDisplayPage') {
    return finalizeResult(await fetchDisplayPageInventory(effectiveConfig, gateway, apiClient, site, request.urlTitle));
  }

  return finalizeResult(
    await fetchRegularPageInventory(
      effectiveConfig,
      gateway,
      apiClient,
      site,
      request.friendlyUrl,
      privateLayoutForInventoryPageRequest(request),
      request.localeHint,
    ),
  );
}

function isInventoryPageRequest(value: InventoryPageRequest | InventoryPageOptions): value is InventoryPageRequest {
  return 'kind' in value;
}

export function projectLiferayInventoryPageJson(
  result: LiferayInventoryPageResult,
  options?: {full?: boolean},
): LiferayInventoryPageJsonResult {
  if (result.pageType === 'displayPage') {
    return validateLiferayInventoryPageJsonResult(projectDisplayPageJson(result, options));
  }

  if (result.pageType === 'siteRoot') {
    return validateLiferayInventoryPageJsonResult({
      page: {
        type: 'siteRoot',
        ...(result.siteName ? {siteName: result.siteName} : {}),
        siteFriendlyUrl: result.siteFriendlyUrl,
        groupId: result.groupId,
        url: result.url,
      },
      pages: result.pages,
    });
  }

  const fragments = (result.fragmentEntryLinks ?? [])
    .filter((entry) => entry.type === 'fragment' && entry.fragmentKey)
    .map((entry) => ({
      fragmentKey: entry.fragmentKey!,
      ...(entry.fragmentSiteFriendlyUrl ? {fragmentSiteFriendlyUrl: entry.fragmentSiteFriendlyUrl} : {}),
      ...(entry.fragmentExportPath ? {fragmentExportPath: entry.fragmentExportPath} : {}),
      ...(entry.configuration ? {configuration: entry.configuration} : {}),
      ...(entry.contentSummary ? {contentSummary: entry.contentSummary} : {}),
      ...(entry.mappedTemplateKeys && entry.mappedTemplateKeys.length > 0
        ? {mappedTemplateKeys: entry.mappedTemplateKeys}
        : {}),
      ...(entry.mappedStructureKeys && entry.mappedStructureKeys.length > 0
        ? {mappedStructureKeys: entry.mappedStructureKeys}
        : {}),
    }));

  const widgets = (result.fragmentEntryLinks ?? [])
    .filter((entry) => entry.type === 'widget' && entry.widgetName)
    .map((entry) => ({
      widgetName: entry.widgetName!,
      ...(entry.portletId ? {portletId: entry.portletId} : {}),
      ...(entry.configuration ? {configuration: entry.configuration} : {}),
    }));

  const portlets = (result.portlets ?? []).map((portlet) => ({
    columnId: portlet.columnId,
    position: portlet.position,
    portletId: portlet.portletId,
    portletName: portlet.portletName,
    ...(portlet.instanceId ? {instanceId: portlet.instanceId} : {}),
    ...(portlet.configuration ? {configuration: portlet.configuration} : {}),
  }));

  const minimalResult = {
    page: {
      type: 'regularPage',
      subtype: result.pageSubtype,
      uiType: result.pageUiType,
      siteName: result.siteName,
      siteFriendlyUrl: result.siteFriendlyUrl,
      groupId: result.groupId,
      url: result.url,
      friendlyUrl: result.friendlyUrl,
      pageName: result.pageName,
      privateLayout: result.privateLayout,
      layoutId: result.layout.layoutId,
      plid: result.layout.plid,
      hidden: result.layout.hidden,
    },
    ...(result.pageSummary ? {summary: result.pageSummary} : {}),
    adminUrls: result.adminUrls,
    ...(result.configurationTabs ? {configuration: result.configurationTabs} : {}),
    ...(result.journalArticles && result.journalArticles.length > 0
      ? {contentRefs: result.journalArticles.map(projectJournalArticleRef)}
      : {}),
    ...(result.evidence && result.evidence.length > 0 ? {evidence: result.evidence} : {}),
    ...(fragments.length > 0 || widgets.length > 0 || portlets.length > 0
      ? {
          components: {
            ...(fragments.length > 0 ? {fragments} : {}),
            ...(widgets.length > 0 ? {widgets} : {}),
            ...(portlets.length > 0 ? {portlets} : {}),
          },
        }
      : {}),
    ...(result.componentInspectionSupported !== undefined
      ? {capabilities: {componentInspectionSupported: result.componentInspectionSupported}}
      : {}),
  };

  if (!options?.full) {
    return validateLiferayInventoryPageJsonResult(minimalResult);
  }

  const fullFragments = (result.fragmentEntryLinks ?? []).filter(
    (entry) => entry.type === 'fragment' && entry.fragmentKey,
  );
  const fullWidgets = (result.fragmentEntryLinks ?? []).filter((entry) => entry.type === 'widget' && entry.widgetName);

  return validateLiferayInventoryPageJsonResult({
    ...minimalResult,
    full: {
      ...(Object.keys(result.layoutDetails).length > 0 ? {layoutDetails: result.layoutDetails} : {}),
      ...(result.configurationRaw ? {configurationRaw: result.configurationRaw} : {}),
      ...(result.portlets && result.portlets.length > 0 ? {portlets: result.portlets} : {}),
      ...(result.journalArticles && result.journalArticles.length > 0 ? {journalArticles: result.journalArticles} : {}),
      ...(result.contentStructures && result.contentStructures.length > 0
        ? {contentStructures: result.contentStructures}
        : {}),
      ...(fullFragments.length > 0 || fullWidgets.length > 0
        ? {
            components: {
              ...(fullFragments.length > 0 ? {fragments: fullFragments} : {}),
              ...(fullWidgets.length > 0 ? {widgets: fullWidgets} : {}),
            },
          }
        : {}),
    },
  });
}

function projectDisplayPageJson(
  result: Extract<LiferayInventoryPageResult, {pageType: 'displayPage'}>,
  options?: {full?: boolean},
): LiferayInventoryPageJsonResult {
  const articleDetails = result.journalArticles?.[0];
  const contentSummary = buildDisplayContentSummary(articleDetails, result.article.title);
  const rendering = buildDisplayRendering(articleDetails);
  const taxonomy =
    articleDetails?.taxonomyCategoryNames && articleDetails.taxonomyCategoryNames.length > 0
      ? {categories: articleDetails.taxonomyCategoryNames}
      : undefined;
  const lifecycle = buildDisplayLifecycle(articleDetails);

  const minimalResult = {
    page: {
      type: 'displayPage',
      subtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteName: result.siteName,
      siteFriendlyUrl: result.siteFriendlyUrl,
      groupId: result.groupId,
      url: result.url,
      friendlyUrl: result.friendlyUrl,
    },
    article: {
      id: result.article.id,
      key: result.article.key,
      title: result.article.title,
      friendlyUrlPath: result.article.friendlyUrlPath,
      contentStructureId: result.article.contentStructureId,
      ...(articleDetails?.groupId ? {groupId: articleDetails.groupId} : {}),
      ...(articleDetails?.siteId ? {siteId: articleDetails.siteId} : {}),
      ...(articleDetails?.siteFriendlyUrl ? {siteFriendlyUrl: articleDetails.siteFriendlyUrl} : {}),
      ...(articleDetails?.siteName ? {siteName: articleDetails.siteName} : {}),
      ...(articleDetails?.ddmStructureKey ? {structureKey: articleDetails.ddmStructureKey} : {}),
      ...(articleDetails?.ddmStructureSiteFriendlyUrl
        ? {structureSiteFriendlyUrl: articleDetails.ddmStructureSiteFriendlyUrl}
        : {}),
      ...(articleDetails?.structureExportPath ? {structureExportPath: articleDetails.structureExportPath} : {}),
      ...(articleDetails?.ddmTemplateKey ? {templateKey: articleDetails.ddmTemplateKey} : {}),
      ...(articleDetails?.ddmTemplateSiteFriendlyUrl
        ? {templateSiteFriendlyUrl: articleDetails.ddmTemplateSiteFriendlyUrl}
        : {}),
      ...(articleDetails?.templateExportPath ? {templateExportPath: articleDetails.templateExportPath} : {}),
      ...(articleDetails?.externalReferenceCode ? {externalReferenceCode: articleDetails.externalReferenceCode} : {}),
      ...(articleDetails?.uuid ? {uuid: articleDetails.uuid} : {}),
    },
    ...(result.adminUrls ? {adminUrls: result.adminUrls} : {}),
    ...(contentSummary ? {contentSummary} : {}),
    ...(rendering ? {rendering} : {}),
    ...(taxonomy ? {taxonomy} : {}),
    ...(lifecycle ? {lifecycle} : {}),
    ...(result.evidence && result.evidence.length > 0 ? {evidence: result.evidence} : {}),
  };

  if (!options?.full) {
    return minimalResult as LiferayInventoryPageJsonResult;
  }

  return {
    ...minimalResult,
    full: {
      ...(articleDetails
        ? {
            articleDetails: {
              ...(articleDetails.contentFields && articleDetails.contentFields.length > 0
                ? {contentFields: articleDetails.contentFields}
                : {}),
              ...(articleDetails.widgetTemplateCandidates && articleDetails.widgetTemplateCandidates.length > 0
                ? {widgetTemplateCandidates: articleDetails.widgetTemplateCandidates}
                : {}),
              ...(articleDetails.displayPageTemplateCandidates &&
              articleDetails.displayPageTemplateCandidates.length > 0
                ? {displayPageTemplateCandidates: articleDetails.displayPageTemplateCandidates}
                : {}),
              ...(articleDetails.taxonomyCategoryBriefs && articleDetails.taxonomyCategoryBriefs.length > 0
                ? {taxonomyCategoryBriefs: articleDetails.taxonomyCategoryBriefs}
                : {}),
              ...(articleDetails.renderedContents && articleDetails.renderedContents.length > 0
                ? {renderedContents: articleDetails.renderedContents}
                : {}),
            },
          }
        : {}),
      ...(result.contentStructures && result.contentStructures.length > 0
        ? {contentStructures: result.contentStructures}
        : {}),
    },
  } as LiferayInventoryPageJsonResult;
}

function buildDisplayContentSummary(articleDetails: JournalArticleSummary | undefined, fallbackTitle: string) {
  const headline = articleDetails?.title ? truncateText(stripHtml(articleDetails.title), 240) : fallbackTitle;
  const lead = articleDetails?.description ? truncateText(stripHtml(articleDetails.description), 240) : undefined;

  if (!headline && !lead) {
    return undefined;
  }

  return {
    ...(headline ? {headline: decodeHtmlEntities(headline)} : {}),
    ...(lead ? {lead: decodeHtmlEntities(lead)} : {}),
  };
}

function projectJournalArticleRef(article: JournalArticleSummary) {
  return {
    articleId: article.articleId,
    title: article.title,
    ...(article.groupId ? {groupId: article.groupId} : {}),
    ...(article.siteId ? {siteId: article.siteId} : {}),
    ...(article.siteFriendlyUrl ? {siteFriendlyUrl: article.siteFriendlyUrl} : {}),
    ...(article.siteName ? {siteName: article.siteName} : {}),
    ...(article.ddmStructureKey ? {structureKey: article.ddmStructureKey} : {}),
    ...(article.ddmStructureSiteFriendlyUrl ? {structureSiteFriendlyUrl: article.ddmStructureSiteFriendlyUrl} : {}),
    ...(article.structureExportPath ? {structureExportPath: article.structureExportPath} : {}),
    ...(article.contentStructureId ? {contentStructureId: article.contentStructureId} : {}),
    ...(article.ddmTemplateKey ? {templateKey: article.ddmTemplateKey} : {}),
    ...(article.ddmTemplateSiteFriendlyUrl ? {templateSiteFriendlyUrl: article.ddmTemplateSiteFriendlyUrl} : {}),
    ...(article.templateExportPath ? {templateExportPath: article.templateExportPath} : {}),
    ...(article.widgetDefaultTemplate ? {widgetDefaultTemplate: article.widgetDefaultTemplate} : {}),
    ...(article.displayPageDefaultTemplate ? {displayPageDefaultTemplate: article.displayPageDefaultTemplate} : {}),
  };
}

function buildDisplayRendering(articleDetails?: JournalArticleSummary) {
  if (!articleDetails) {
    return undefined;
  }

  const derivedDisplayPageTemplate = articleDetails.renderedContents
    ?.map((item) => item as Record<string, unknown>)
    .find(
      (candidate) =>
        candidate.markedAsDefault === true &&
        typeof candidate.contentTemplateName === 'string' &&
        typeof candidate.renderedContentURL === 'string' &&
        candidate.renderedContentURL.includes('/rendered-content-by-display-page/'),
    );
  const displayPageDefaultTemplate =
    articleDetails.displayPageDefaultTemplate ??
    (derivedDisplayPageTemplate?.contentTemplateName as string | undefined);

  const hasWidgetRendering = Boolean(
    articleDetails.widgetDefaultTemplate ||
    articleDetails.widgetHeadlessDefaultTemplate ||
    articleDetails.widgetTemplateCandidates?.length,
  );
  const hasDisplayPageRendering = Boolean(
    displayPageDefaultTemplate || articleDetails.displayPageTemplateCandidates?.length,
  );

  if (!hasWidgetRendering && !hasDisplayPageRendering) {
    return undefined;
  }

  return {
    ...(articleDetails.widgetDefaultTemplate ? {widgetDefaultTemplate: articleDetails.widgetDefaultTemplate} : {}),
    ...(displayPageDefaultTemplate ? {displayPageDefaultTemplate} : {}),
    ...(articleDetails.displayPageDdmTemplates && articleDetails.displayPageDdmTemplates.length > 0
      ? {displayPageDdmTemplates: articleDetails.displayPageDdmTemplates}
      : {}),
    hasWidgetRendering,
    hasDisplayPageRendering,
  };
}

function buildDisplayLifecycle(articleDetails?: JournalArticleSummary) {
  if (!articleDetails) {
    return undefined;
  }

  if (
    !articleDetails.availableLanguages?.length &&
    !articleDetails.dateCreated &&
    !articleDetails.dateModified &&
    !articleDetails.datePublished &&
    articleDetails.neverExpire === undefined
  ) {
    return undefined;
  }

  return {
    ...(articleDetails.availableLanguages?.length ? {availableLanguages: articleDetails.availableLanguages} : {}),
    ...(articleDetails.dateCreated ? {dateCreated: articleDetails.dateCreated} : {}),
    ...(articleDetails.dateModified ? {dateModified: articleDetails.dateModified} : {}),
    ...(articleDetails.datePublished ? {datePublished: articleDetails.datePublished} : {}),
    ...(articleDetails.neverExpire !== undefined ? {neverExpire: articleDetails.neverExpire} : {}),
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };

  return value
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => entityMap[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

async function resolvePortalHomeRequest(config: AppConfig) {
  const redirectedUrl = await detectPathRedirect(config, '/');
  if (!redirectedUrl) {
    return null;
  }

  const resolved = resolveInventoryPageRequest({url: redirectedUrl});
  return isRegularPageRequest(resolved) ? resolved : null;
}

async function resolveSiteHomeRequest(
  config: AppConfig,
  request: Extract<InventoryPageRequest, {kind: 'publicSiteRoot' | 'privateSiteRoot'}>,
) {
  const redirectedUrl = await detectPathRedirect(
    config,
    buildPageUrl(`/${request.site}`, '/', privateLayoutForInventoryPageRequest(request)),
  );
  if (!redirectedUrl) {
    return null;
  }

  const resolved = resolveInventoryPageRequest({url: redirectedUrl});
  return isRegularPageRequest(resolved) && resolved.site === request.site ? resolved : null;
}

async function detectPathRedirect(config: AppConfig, path: string): Promise<string | null> {
  const rootUrl = `${config.liferay.url}${path}`;

  try {
    const manual = await fetch(rootUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(config.liferay.timeoutSeconds * 1000),
    });
    const location = manual.headers.get('location');
    const locationPath = normalizeDetectedPortalPath(location, config.liferay.url);
    if (locationPath) {
      return locationPath;
    }
    const manualBodyPath = parsePortalHomePathFromHtml(await manual.text().catch(() => ''));
    if (manualBodyPath) {
      return manualBodyPath;
    }
  } catch {
    // Fall through to the regular follow-redirect request.
  }

  try {
    const followed = await fetch(rootUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(config.liferay.timeoutSeconds * 1000),
    });
    const followedPath = normalizeDetectedPortalPath(followed.url, config.liferay.url);
    if (followedPath) {
      return followedPath;
    }
    return parsePortalHomePathFromHtml(await followed.text().catch(() => ''));
  } catch {
    return null;
  }
}

function parsePortalHomePathFromHtml(html: string): string | null {
  const match =
    html.match(/getLayoutRelativeURL:\s*function\s*\(\)\s*\{\s*return\s*['"]([^'"]+)['"]/) ??
    html.match(/getLayoutURL:\s*function\s*\(\)\s*\{\s*return\s*['"]([^'"]+)['"]/) ??
    html.match(/<a\b[^>]+href=['"]([^'"]*(?:\/web\/|\/group\/)[^'"]+)['"][^>]*>/i);
  return normalizeDetectedPortalPath(match?.[1] ?? null, 'http://localhost');
}

function normalizeDetectedPortalPath(value: string | null, baseUrl: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.pathname === '/' || (!parsed.pathname.startsWith('/web/') && !parsed.pathname.startsWith('/group/'))) {
      return null;
    }
    return parsed.pathname;
  } catch {
    return value.startsWith('/web/') || value.startsWith('/group/') ? value : null;
  }
}

export async function resolveRegularLayoutPage(
  config: AppConfig,
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean},
  dependencies?: InventoryPageDependencies,
): Promise<ResolvedRegularLayoutPage> {
  const request = resolveInventoryPageRequest(options);
  if (!isRegularPageRequest(request)) {
    throw LiferayErrors.inventoryError('Only a regular page can be resolved for this flow.');
  }

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(config, apiClient, dependencies);
  const site = await resolveSite(config, request.site, {...dependencies, gateway});

  return resolveRegularLayoutPageData(
    config,
    gateway,
    apiClient,
    site,
    request.friendlyUrl,
    privateLayoutForInventoryPageRequest(request),
  );
}
