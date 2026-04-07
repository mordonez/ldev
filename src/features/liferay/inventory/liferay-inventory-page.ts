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
  ContentFieldSummary,
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
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean; verbose?: boolean},
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

  return fetchRegularPageInventory(
    config,
    apiClient,
    accessToken,
    site,
    request.friendlyUrl,
    request.privateLayout,
    request.localeHint,
  );
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
