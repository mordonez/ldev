import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/liferay/auth.js';
import type {LiferayApiClient} from '../../core/liferay/client.js';
import {createLiferayApiClient} from '../../core/liferay/client.js';
import {fetchAccessToken, resolveSite} from './liferay-inventory-shared.js';
import {buildLayoutDetails, buildPageUrl, fetchLayoutsByParent} from './liferay-layout-shared.js';

type InventoryPagesDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayInventoryPagesNode = {
  pageType: 'regularPage';
  pageSubtype: string;
  name: string;
  friendlyUrl: string;
  fullUrl: string;
  pageCommand: string;
  layoutId: number;
  plid: number;
  hidden: boolean;
  targetUrl?: string;
  children: LiferayInventoryPagesNode[];
};

export type LiferayInventoryPagesResult = {
  inventoryType: 'pages';
  groupId: number;
  siteName: string;
  siteFriendlyUrl: string;
  privateLayout: boolean;
  sitePathPrefix: string;
  inspectCommandTemplate: string;
  pageCount: number;
  pages: LiferayInventoryPagesNode[];
};

export async function runLiferayInventoryPages(
  config: AppConfig,
  options?: {site?: string; privateLayout?: boolean; maxDepth?: number},
  dependencies?: InventoryPagesDependencies,
): Promise<LiferayInventoryPagesResult> {
  const site = await resolveSite(config, options?.site ?? '/global', dependencies);
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const privateLayout = Boolean(options?.privateLayout);
  const maxDepth = Math.max(0, options?.maxDepth ?? 12);
  const pages = await fetchLayoutTree(
    config,
    apiClient,
    accessToken,
    site.id,
    site.friendlyUrlPath,
    privateLayout,
    0,
    0,
    maxDepth,
  );

  return {
    inventoryType: 'pages',
    groupId: site.id,
    siteName: site.name,
    siteFriendlyUrl: site.friendlyUrlPath,
    privateLayout,
    sitePathPrefix: buildSitePathPrefix(site.friendlyUrlPath, privateLayout),
    inspectCommandTemplate: 'inventory page --url <fullUrl>',
    pageCount: countPages(pages),
    pages,
  };
}

export function formatLiferayInventoryPages(result: LiferayInventoryPagesResult): string {
  const lines = [
    'SITE PAGES',
    `site=${result.siteName}`,
    `siteFriendlyUrl=${result.siteFriendlyUrl}`,
    `sitePathPrefix=${result.sitePathPrefix}`,
    `groupId=${result.groupId}`,
    `scope=${result.privateLayout ? 'private' : 'public'}`,
    `pageCount=${result.pageCount}`,
    `inspectCommandTemplate=${result.inspectCommandTemplate}`,
  ];

  appendPageTree(lines, result.pages, 0);
  return lines.join('\n');
}

function appendPageTree(lines: string[], pages: LiferayInventoryPagesNode[], depth: number): void {
  const indent = '  '.repeat(Math.max(0, depth));

  for (const page of pages) {
    let line = `${indent}- ${page.name} [${page.pageSubtype}] ${page.fullUrl}`;
    if (page.hidden) {
      line += ' (hidden)';
    }
    if (page.targetUrl) {
      line += ` -> ${page.targetUrl}`;
    }
    lines.push(line);

    appendPageTree(lines, page.children, depth + 1);
  }
}

async function fetchLayoutTree(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  siteFriendlyUrl: string,
  privateLayout: boolean,
  parentLayoutId: number,
  depth: number,
  maxDepth: number,
): Promise<LiferayInventoryPagesNode[]> {
  if (depth > maxDepth) {
    return [];
  }

  const layouts = await fetchLayoutsByParent(config, apiClient, accessToken, groupId, privateLayout, parentLayoutId);
  const pages: LiferayInventoryPagesNode[] = [];

  for (const layout of layouts) {
    const friendlyUrl = layout.friendlyURL ?? '';
    const fullUrl = buildPageUrl(siteFriendlyUrl, friendlyUrl, privateLayout);
    const layoutDetails = buildLayoutDetails(layout.typeSettings ?? '');

    pages.push({
      pageType: 'regularPage',
      pageSubtype: layout.type ?? '',
      name: layout.nameCurrentValue ?? '',
      friendlyUrl,
      fullUrl,
      pageCommand: `inventory page --url ${fullUrl}`,
      layoutId: layout.layoutId ?? -1,
      plid: layout.plid ?? -1,
      hidden: layout.hidden ?? false,
      ...(layoutDetails.targetUrl ? {targetUrl: layoutDetails.targetUrl} : {}),
      children: await fetchLayoutTree(
        config,
        apiClient,
        accessToken,
        groupId,
        siteFriendlyUrl,
        privateLayout,
        layout.layoutId ?? 0,
        depth + 1,
        maxDepth,
      ),
    });
  }

  return pages;
}

function countPages(pages: LiferayInventoryPagesNode[]): number {
  let count = 0;
  for (const page of pages) {
    count += 1 + countPages(page.children);
  }
  return count;
}

function buildSitePathPrefix(siteFriendlyUrl: string, privateLayout: boolean): string {
  const siteSlug = siteFriendlyUrl.startsWith('/') ? siteFriendlyUrl.slice(1) : siteFriendlyUrl;
  return `${privateLayout ? '/group/' : '/web/'}${siteSlug}`;
}
