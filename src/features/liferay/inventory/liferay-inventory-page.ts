import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import {createInventoryGateway, resolveSite} from './liferay-inventory-shared.js';
import {resolveInventoryPageRequest} from './liferay-inventory-page-url.js';
import {buildPageUrl} from '../page-layout/liferay-layout-shared.js';
import {
  fetchDisplayPageInventory,
  fetchRegularPageInventory,
  fetchSiteRootInventory,
  resolveRegularLayoutPageData,
} from './liferay-inventory-page-fetch.js';
import {validateLiferayInventoryPageResultV2} from './liferay-inventory-page-schema.js';
import type {
  ContentStructureSummary,
  JournalArticleSummary,
  PageFragmentEntry,
} from './liferay-inventory-page-assemble.js';
import type {HeadlessSitePagePayload} from '../page-layout/liferay-site-page-shared.js';

export {resolveInventoryPageRequest};
export {formatLiferayInventoryPage} from './liferay-inventory-page-format.js';

type InventoryPageDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
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
      contractVersion: '2';
      pageType: 'siteRoot';
      siteName: string;
      siteFriendlyUrl: string;
      groupId: number;
      url: string;
      pages: Array<{layoutId: number; friendlyUrl: string; name: string; type: string}>;
    }
  | {
      contractVersion: '2';
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
      journalArticles?: JournalArticleSummary[];
      contentStructures?: ContentStructureSummary[];
    }
  | {
      contractVersion: '2';
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
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean; verbose?: boolean},
  dependencies?: InventoryPageDependencies,
): Promise<LiferayInventoryPageResult> {
  const finalizeResult = (result: LiferayInventoryPageResult): LiferayInventoryPageResult =>
    validateLiferayInventoryPageResultV2(result) as LiferayInventoryPageResult;

  const request = resolveInventoryPageRequest(options);
  const effectiveConfig = config;
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(effectiveConfig, apiClient, dependencies);
  const siteDependencies = {...dependencies, gateway};

  if (request.route === 'portalHome') {
    const homeRequest = await resolvePortalHomeRequest(effectiveConfig);
    if (homeRequest) {
      const site = await resolveSite(effectiveConfig, homeRequest.siteSlug, siteDependencies);
      return fetchRegularPageInventory(
        effectiveConfig,
        gateway,
        apiClient,
        site,
        homeRequest.friendlyUrl,
        homeRequest.privateLayout,
        homeRequest.localeHint,
      ).then(finalizeResult);
    }
    const site = await resolveSite(effectiveConfig, 'global', siteDependencies);
    return finalizeResult(await fetchSiteRootInventory(gateway, site, false));
  }

  const site = await resolveSite(effectiveConfig, request.siteSlug, siteDependencies);
  if (request.route === 'siteRoot') {
    if (options.url) {
      const redirectedRequest = await resolveSiteHomeRequest(effectiveConfig, request);
      if (redirectedRequest) {
        return fetchRegularPageInventory(
          effectiveConfig,
          gateway,
          apiClient,
          site,
          redirectedRequest.friendlyUrl,
          redirectedRequest.privateLayout,
          redirectedRequest.localeHint,
        ).then(finalizeResult);
      }
    }
    return finalizeResult(await fetchSiteRootInventory(gateway, site, request.privateLayout));
  }

  if (request.route === 'displayPage') {
    return finalizeResult(
      await fetchDisplayPageInventory(effectiveConfig, gateway, apiClient, site, request.displayPageUrlTitle ?? ''),
    );
  }

  return finalizeResult(
    await fetchRegularPageInventory(
      effectiveConfig,
      gateway,
      apiClient,
      site,
      request.friendlyUrl,
      request.privateLayout,
      request.localeHint,
    ),
  );
}

async function resolvePortalHomeRequest(config: AppConfig) {
  const redirectedUrl = await detectPathRedirect(config, '/');
  if (!redirectedUrl) {
    return null;
  }

  const resolved = resolveInventoryPageRequest({url: redirectedUrl});
  return resolved.route === 'regularPage' ? resolved : null;
}

async function resolveSiteHomeRequest(config: AppConfig, request: ReturnType<typeof resolveInventoryPageRequest>) {
  const redirectedUrl = await detectPathRedirect(
    config,
    buildPageUrl(`/${request.siteSlug}`, '/', request.privateLayout),
  );
  if (!redirectedUrl) {
    return null;
  }

  const resolved = resolveInventoryPageRequest({url: redirectedUrl});
  return resolved.route === 'regularPage' && resolved.siteSlug === request.siteSlug ? resolved : null;
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
  if (request.route !== 'regularPage') {
    throw LiferayErrors.inventoryError('Only a regular page can be resolved for this flow.');
  }

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createInventoryGateway(config, apiClient, dependencies);
  const site = await resolveSite(config, request.siteSlug, {...dependencies, gateway});

  return resolveRegularLayoutPageData(config, gateway, apiClient, site, request.friendlyUrl, request.privateLayout);
}
