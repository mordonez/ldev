import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {CliError} from '../../../core/errors.js';
import {fetchAccessToken, resolveSite} from './liferay-inventory-shared.js';
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

export {resolveInventoryPageRequest};

type InventoryPageDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
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
      configurationTabs?: {
        general: Record<string, unknown>;
        design: Record<string, unknown>;
        seo: Record<string, unknown>;
        openGraph: Record<string, unknown>;
        customMetaTags: Record<string, unknown>;
      };
      configurationRaw?: {
        layout: Record<string, unknown>;
        typeSettings: Record<string, string>;
        sitePageMetadata?: Record<string, unknown>;
      };
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
  const accessToken = await fetchAccessToken(effectiveConfig, dependencies);

  if (request.route === 'portalHome') {
    const homeRequest = await resolvePortalHomeRequest(effectiveConfig);
    if (homeRequest) {
      const site = await resolveSite(effectiveConfig, homeRequest.siteSlug, dependencies);
      return fetchRegularPageInventory(
        effectiveConfig,
        apiClient,
        accessToken,
        site,
        homeRequest.friendlyUrl,
        homeRequest.privateLayout,
        homeRequest.localeHint,
      ).then(finalizeResult);
    }
    const site = await resolveSite(effectiveConfig, 'global', dependencies);
    return finalizeResult(await fetchSiteRootInventory(effectiveConfig, apiClient, accessToken, site, false));
  }

  const site = await resolveSite(effectiveConfig, request.siteSlug, dependencies);

  if (request.route === 'siteRoot') {
    if (options.url) {
      const redirectedRequest = await resolveSiteHomeRequest(effectiveConfig, request);
      if (redirectedRequest) {
        return fetchRegularPageInventory(
          effectiveConfig,
          apiClient,
          accessToken,
          site,
          redirectedRequest.friendlyUrl,
          redirectedRequest.privateLayout,
          redirectedRequest.localeHint,
        ).then(finalizeResult);
      }
    }
    return finalizeResult(
      await fetchSiteRootInventory(effectiveConfig, apiClient, accessToken, site, request.privateLayout),
    );
  }

  if (request.route === 'displayPage') {
    return finalizeResult(
      await fetchDisplayPageInventory(effectiveConfig, apiClient, accessToken, site, request.displayPageUrlTitle ?? ''),
    );
  }

  return finalizeResult(
    await fetchRegularPageInventory(
      effectiveConfig,
      apiClient,
      accessToken,
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
    throw new CliError('Only a regular page can be resolved for this flow.', {
      code: 'LIFERAY_INVENTORY_ERROR',
    });
  }

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const site = await resolveSite(config, request.siteSlug, dependencies);

  return resolveRegularLayoutPageData(config, apiClient, accessToken, site, request.friendlyUrl, request.privateLayout);
}

export function formatLiferayInventoryPage(result: LiferayInventoryPageResult, verbose = false): string {
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
    const firstArticle = result.journalArticles?.[0];
    const lines = [
      'DISPLAY PAGE',
      `site=${result.siteName}`,
      `siteFriendlyUrl=${result.siteFriendlyUrl}`,
      `groupId=${result.groupId}`,
      `url=${result.url}`,
      `friendlyUrl=${result.friendlyUrl}`,
      ...(firstArticle?.ddmStructureKey ? [`structureKey=${firstArticle.ddmStructureKey}`] : []),
      ...(firstArticle?.widgetDefaultTemplate ? [`templateWidgetDefault=${firstArticle.widgetDefaultTemplate}`] : []),
      ...(firstArticle?.displayPageDefaultTemplate
        ? [`templateDisplayPageDefault=${firstArticle.displayPageDefaultTemplate}`]
        : []),
      `articleId=${result.article.id}`,
      `articleKey=${result.article.key}`,
      `articleTitle=${result.article.title}`,
      `contentStructureId=${result.article.contentStructureId}`,
      ...(result.adminUrls ? [`editUrl=${result.adminUrls.edit}`] : []),
      ...(result.adminUrls ? [`translateUrl=${result.adminUrls.translate}`] : []),
    ];
    if (firstArticle?.taxonomyCategoryNames?.length) {
      lines.push(`categories=${firstArticle.taxonomyCategoryNames.join(', ')}`);
    }
    if (firstArticle?.datePublished) {
      lines.push(`datePublished=${firstArticle.datePublished}`);
    }
    if (typeof firstArticle?.priority === 'number') {
      lines.push(`priority=${firstArticle.priority}`);
    }
    appendJournalArticleLines(lines, result.journalArticles);
    appendContentStructureLines(lines, result.contentStructures);
    return lines.join('\n');
  }

  const lines = [
    'REGULAR PAGE',
    `site=${result.siteName}`,
    `siteFriendlyUrl=${result.siteFriendlyUrl}`,
    `groupId=${result.groupId}`,
    `friendlyUrl=${result.friendlyUrl}`,
    `url=${result.url}`,
    ...(result.matchedLocale ? [`locale=${result.matchedLocale}`, `requestedUrl=${result.requestedFriendlyUrl}`] : []),
    `pageName=${result.pageName}`,
    `layoutType=${result.pageSubtype}`,
    `layoutId=${result.layout.layoutId}`,
    `plid=${result.layout.plid}`,
    `hidden=${result.layout.hidden}`,
    `privateLayout=${result.privateLayout}`,
    `viewUrl=${result.adminUrls.view}`,
    `editUrl=${result.adminUrls.edit}`,
    `configureGeneralUrl=${result.adminUrls.configureGeneral}`,
    `configureDesignUrl=${result.adminUrls.configureDesign}`,
    `configureSeoUrl=${result.adminUrls.configureSeo}`,
    `configureOpenGraphUrl=${result.adminUrls.configureOpenGraph}`,
    `configureCustomMetaTagsUrl=${result.adminUrls.configureCustomMetaTags}`,
    `translateUrl=${result.adminUrls.translate}`,
  ];

  if (result.pageSummary) {
    lines.push('PAGE SUMMARY');
    lines.push(`layoutTemplateId=${result.pageSummary.layoutTemplateId ?? '-'}`);
    lines.push(`targetUrl=${result.pageSummary.targetUrl ?? '-'}`);
    lines.push(`fragmentCount=${result.pageSummary.fragmentCount}`);
    lines.push(`widgetCount=${result.pageSummary.widgetCount}`);
  }

  if (result.layoutDetails.layoutTemplateId) {
    lines.push(`layoutTemplateId=${result.layoutDetails.layoutTemplateId}`);
  }
  if (result.layoutDetails.targetUrl) {
    lines.push(`targetUrl=${result.layoutDetails.targetUrl}`);
  }
  if (result.configurationTabs) {
    lines.push(`CONFIGURATION TABS`);
    lines.push(`general=${JSON.stringify(result.configurationTabs.general)}`);
    lines.push(`design=${JSON.stringify(result.configurationTabs.design)}`);
    lines.push(`seo=${JSON.stringify(result.configurationTabs.seo)}`);
    lines.push(`openGraph=${JSON.stringify(result.configurationTabs.openGraph)}`);
    lines.push(`customMetaTags=${JSON.stringify(result.configurationTabs.customMetaTags)}`);
  }
  appendPortletLines(lines, result.portlets);
  if (result.fragmentEntryLinks && result.fragmentEntryLinks.length > 0) {
    lines.push(`FRAGMENTS (${result.fragmentEntryLinks.length})`);
    let i = 1;
    for (const entry of result.fragmentEntryLinks) {
      if (entry.type === 'widget') {
        lines.push(`${i++}. ${entry.widgetName}`);
        if (entry.portletId && entry.portletId !== entry.widgetName) {
          lines.push(`   portletId=${entry.portletId}`);
        }
      } else {
        lines.push(`${i++}. ${entry.fragmentKey}`);
        if (entry.fragmentSiteFriendlyUrl) {
          lines.push(`   site=${entry.fragmentSiteFriendlyUrl}`);
        }
        if (entry.fragmentExportPath) {
          lines.push(`   exportPath=${entry.fragmentExportPath}`);
        }
        if (entry.title) {
          lines.push(`   title=${entry.title}`);
        }
        if (entry.heroText) {
          lines.push(`   heroText=${entry.heroText}`);
        }
        if (entry.navigationItems && entry.navigationItems.length > 0) {
          lines.push(`   navigationItems=${entry.navigationItems.join(' | ')}`);
        }
        if (typeof entry.cardCount === 'number') {
          lines.push(`   cardCount=${entry.cardCount}`);
        }
        if (entry.contentSummary) {
          lines.push(`   summary=${entry.contentSummary}`);
        }
      }
      if (verbose && entry.elementName) {
        lines.push(`   name=${entry.elementName}`);
      }
      if (entry.editableFields) {
        for (const field of entry.editableFields) {
          lines.push(`   [${field.id}] ${field.value}`);
        }
      }
      if (entry.configuration) {
        for (const [key, value] of Object.entries(entry.configuration)) {
          lines.push(`   ${key}=${value}`);
        }
      }
      if (verbose && entry.cssClasses && entry.cssClasses.length > 0) {
        lines.push(`   cssClasses=${entry.cssClasses.join(' ')}`);
      }
      if (verbose && entry.customCSS) {
        lines.push(`   customCSS=${entry.customCSS.replace(/\s+/g, ' ')}`);
      }
    }
  }
  appendJournalArticleLines(lines, result.journalArticles);
  appendContentStructureLines(lines, result.contentStructures);

  return lines.join('\n');
}

function appendPortletLines(lines: string[], portlets?: PagePortletSummary[]): void {
  if (!portlets || portlets.length === 0) {
    return;
  }

  lines.push(`PORTLETS (${portlets.length})`);
  let i = 1;
  for (const portlet of portlets) {
    lines.push(`${i++}. ${portlet.portletName}`);
    lines.push(`   portletId=${portlet.portletId}`);
    if (portlet.instanceId) {
      lines.push(`   instanceId=${portlet.instanceId}`);
    }
    for (const [key, value] of Object.entries(portlet.configuration ?? {})) {
      lines.push(`   ${key}=${value}`);
    }
  }
}

function appendJournalArticleLines(lines: string[], journalArticles?: JournalArticleSummary[]): void {
  if (!journalArticles || journalArticles.length === 0) {
    return;
  }

  lines.push(`journalArticles=${journalArticles.length}`);
  for (const article of journalArticles) {
    lines.push(`article ${article.articleId} title=${article.title} structure=${article.ddmStructureKey}`);
    if (article.siteFriendlyUrl || article.groupId) {
      lines.push(`  articleSite=${article.siteFriendlyUrl ?? '?'} groupId=${article.groupId ?? '?'}`);
    }
    if (article.ddmStructureSiteFriendlyUrl || article.structureExportPath) {
      lines.push(
        `  structureSite=${article.ddmStructureSiteFriendlyUrl ?? '?'}${article.structureExportPath ? ` export=${article.structureExportPath}` : ''}`,
      );
    }
    if (article.ddmTemplateKey && (article.ddmTemplateSiteFriendlyUrl || article.templateExportPath)) {
      lines.push(
        `  template ${article.ddmTemplateKey} site=${article.ddmTemplateSiteFriendlyUrl ?? '?'}${article.templateExportPath ? ` export=${article.templateExportPath}` : ''}`,
      );
    }
    if (article.widgetDefaultTemplate || article.displayPageDefaultTemplate) {
      lines.push(
        `  templates widgetDefault=${article.widgetDefaultTemplate ?? '-'} displayPageDefault=${article.displayPageDefaultTemplate ?? '-'}`,
      );
    }
    if (article.taxonomyCategoryNames && article.taxonomyCategoryNames.length > 0) {
      lines.push(`  categories=${article.taxonomyCategoryNames.join(', ')}`);
    }
    if (article.datePublished || article.dateModified) {
      lines.push(`  dates published=${article.datePublished ?? '-'} modified=${article.dateModified ?? '-'}`);
    }
    for (const field of article.contentFields ?? []) {
      lines.push(`contentField ${field.path}=${field.value}`);
    }
  }
}

function appendContentStructureLines(lines: string[], contentStructures?: ContentStructureSummary[]): void {
  if (!contentStructures || contentStructures.length === 0) {
    return;
  }

  lines.push(`contentStructures=${contentStructures.length}`);
  for (const structure of contentStructures) {
    lines.push(
      `structure ${structure.key ?? structure.contentStructureId} site=${structure.siteFriendlyUrl ?? '?'} id=${structure.contentStructureId} name=${structure.name}${structure.exportPath ? ` export=${structure.exportPath}` : ''}`,
    );
  }
}
