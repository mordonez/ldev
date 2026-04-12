import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {CliError} from '../../../core/errors.js';
import {fetchAccessToken, resolveSite} from './liferay-inventory-shared.js';
import {resolveInventoryPageRequest} from './liferay-inventory-page-url.js';
import {
  fetchDisplayPageInventory,
  fetchRegularPageInventory,
  fetchSiteRootInventory,
  resolveRegularLayoutPageData,
} from './liferay-inventory-page-fetch.js';
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
      journalArticles?: JournalArticleSummary[];
      contentStructures?: ContentStructureSummary[];
    }
  | {
      pageType: 'regularPage';
      pageSubtype: string;
      siteName: string;
      siteFriendlyUrl: string;
      groupId: number;
      url: string;
      friendlyUrl: string;
      matchedLocale?: string;
      requestedFriendlyUrl?: string;
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
    edit: string;
    configure: string;
    translate: string;
  };
};

export async function runLiferayInventoryPage(
  config: AppConfig,
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean; verbose?: boolean},
  dependencies?: InventoryPageDependencies,
): Promise<LiferayInventoryPageResult> {
  const request = resolveInventoryPageRequest(options);
  const effectiveConfig = resolveAbsoluteUrlConfig(config, options.url);
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
      );
    }
    const site = await resolveSite(effectiveConfig, 'global', dependencies);
    return fetchSiteRootInventory(effectiveConfig, apiClient, accessToken, site, false);
  }

  const site = await resolveSite(effectiveConfig, request.siteSlug, dependencies);

  if (request.route === 'siteRoot') {
    return fetchSiteRootInventory(effectiveConfig, apiClient, accessToken, site, request.privateLayout);
  }

  if (request.route === 'displayPage') {
    return fetchDisplayPageInventory(effectiveConfig, apiClient, accessToken, site, request.displayPageUrlTitle ?? '');
  }

  return fetchRegularPageInventory(
    effectiveConfig,
    apiClient,
    accessToken,
    site,
    request.friendlyUrl,
    request.privateLayout,
    request.localeHint,
  );
}

function resolveAbsoluteUrlConfig(config: AppConfig, rawUrl?: string): AppConfig {
  if (!rawUrl) {
    return config;
  }

  try {
    const parsed = new URL(rawUrl);
    const current = new URL(config.liferay.url);
    if (parsed.origin === current.origin || !['http:', 'https:'].includes(parsed.protocol)) {
      return config;
    }
    return {
      ...config,
      liferay: {
        ...config.liferay,
        url: parsed.origin,
      },
    };
  } catch {
    return config;
  }
}

async function resolvePortalHomeRequest(config: AppConfig) {
  const redirectedUrl = await detectPortalHomeRedirect(config);
  if (!redirectedUrl) {
    return null;
  }

  const resolved = resolveInventoryPageRequest({url: redirectedUrl});
  return resolved.route === 'regularPage' ? resolved : null;
}

async function detectPortalHomeRedirect(config: AppConfig): Promise<string | null> {
  const rootUrl = `${config.liferay.url}/`;

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
    html.match(/<a\b[^>]+href=['"]([^'"]*\/web\/[^'"]+)['"][^>]*>\s*UB\.EDU\s*</i);
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
    appendJournalArticleLines(lines, result.journalArticles);
    appendContentStructureLines(lines, result.contentStructures);
    return lines.join('\n');
  }

  const lines = [
    'REGULAR PAGE',
    `site=${result.siteName}`,
    `siteFriendlyUrl=${result.siteFriendlyUrl}`,
    `groupId=${result.groupId}`,
    `url=${result.url}`,
    `friendlyUrl=${result.friendlyUrl}`,
    ...(result.matchedLocale ? [`locale=${result.matchedLocale}`, `requestedUrl=${result.requestedFriendlyUrl}`] : []),
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
