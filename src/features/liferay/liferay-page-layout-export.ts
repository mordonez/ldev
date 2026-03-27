import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/liferay/auth.js';
import type {LiferayApiClient} from '../../core/liferay/client.js';
import {createLiferayApiClient} from '../../core/liferay/client.js';
import {resolveRegularLayoutPage} from './liferay-inventory-page.js';
import {authedGet, fetchAccessToken} from './liferay-inventory-shared.js';

const EXPORT_KIND = 'liferay-page-layout-export';
const EXPORT_SCHEMA_VERSION = 1;

type PageLayoutExportDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
  now?: () => Date;
};

export type LiferayPageLayoutExport = {
  kind: typeof EXPORT_KIND;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  generatedAt: string;
  source: {
    baseUrl: string;
    url: string;
    siteFriendlyUrl: string;
    siteName: string;
    siteId: number;
    friendlyUrl: string;
    privateLayout: boolean;
    layoutId: number;
    plid: number;
    layoutType: string;
    pageName: string;
  };
  adminUrls: {
    edit: string;
    translate: string;
    configureGeneral: string;
    configureDesign: string;
    configureSeo: string;
  };
  headlessSitePage: Record<string, unknown>;
  experiences?: unknown;
  layoutStructure: {
    available: false;
    storage: 'api-only';
    warning: string;
  };
};

export async function runLiferayPageLayoutExport(
  config: AppConfig,
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean},
  dependencies?: PageLayoutExportDependencies,
): Promise<LiferayPageLayoutExport> {
  const regularPage = await resolveExportableRegularPage(config, options, dependencies);
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const headlessSitePage = await fetchSitePage(config, apiClient, accessToken, regularPage.groupId, regularPage.friendlyUrl);

  if (headlessSitePage === null) {
    throw new CliError('La página no es exportable por Headless Delivery o no se pudo resolver como content page.', {
      code: 'LIFERAY_PAGE_LAYOUT_ERROR',
    });
  }

  const experiences = await fetchSitePageExperiences(config, apiClient, accessToken, regularPage.groupId, regularPage.friendlyUrl);

  return {
    kind: EXPORT_KIND,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: (dependencies?.now ?? (() => new Date()))().toISOString(),
    source: {
      baseUrl: config.liferay.url,
      url: regularPage.url,
      siteFriendlyUrl: regularPage.siteFriendlyUrl,
      siteName: regularPage.siteName,
      siteId: regularPage.groupId,
      friendlyUrl: regularPage.friendlyUrl,
      privateLayout: regularPage.privateLayout,
      layoutId: regularPage.layoutId,
      plid: regularPage.plid,
      layoutType: regularPage.layoutType,
      pageName: regularPage.pageName,
    },
    adminUrls: {
      edit: regularPage.adminUrls.edit,
      translate: regularPage.adminUrls.translate,
      configureGeneral: buildConfigureUrl(config.liferay.url, regularPage.siteFriendlyUrl, regularPage.plid, 'general'),
      configureDesign: buildConfigureUrl(config.liferay.url, regularPage.siteFriendlyUrl, regularPage.plid, 'design'),
      configureSeo: buildConfigureUrl(config.liferay.url, regularPage.siteFriendlyUrl, regularPage.plid, 'seo'),
    },
    headlessSitePage,
    ...(experiences === null ? {} : {experiences}),
    layoutStructure: {
      available: false,
      storage: 'api-only',
      warning: 'Stored layout structure is not exported by the official API. Compare uses headless pageDefinition.',
    },
  };
}

export async function writeLiferayPageLayoutExport(
  pageExport: LiferayPageLayoutExport,
  outputPath: string,
  options?: {pretty?: boolean},
): Promise<string> {
  const resolvedOutputPath = path.resolve(outputPath);
  await fs.ensureDir(path.dirname(resolvedOutputPath));
  const serialized = options?.pretty === false ? JSON.stringify(pageExport) : JSON.stringify(pageExport, null, 2);
  await fs.writeFile(resolvedOutputPath, `${serialized}\n`);
  return resolvedOutputPath;
}

async function resolveExportableRegularPage(
  config: AppConfig,
  options: {url?: string; site?: string; friendlyUrl?: string; privateLayout?: boolean},
  dependencies?: PageLayoutExportDependencies,
): Promise<Awaited<ReturnType<typeof resolveRegularLayoutPage>>> {
  const page = await resolveRegularLayoutPage(config, options, dependencies);

  if (page.layoutType.toLowerCase() !== 'content') {
    throw new CliError(`page-layout export solo soporta layoutType=content; recibido ${page.layoutType || '<empty>'}.`, {
      code: 'LIFERAY_PAGE_LAYOUT_ERROR',
    });
  }

  return page;
}

async function fetchSitePage(
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
    `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${slug}?fields=actions,friendlyUrlPath,id,pageDefinition,pageType,siteId,title,uuid`,
  );

  if (!response.ok || response.data === null || Array.isArray(response.data)) {
    return null;
  }

  return response.data;
}

async function fetchSitePageExperiences(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
  friendlyUrl: string,
): Promise<unknown | null> {
  const slug = friendlyUrl.startsWith('/') ? friendlyUrl.slice(1) : friendlyUrl;
  const response = await authedGet<unknown>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${slug}/experiences`,
  );

  return response.ok ? response.data : null;
}

function buildConfigureUrl(baseUrl: string, siteFriendlyUrl: string, plid: number, screenNavigationEntryKey: string): string {
  const siteSlug = siteFriendlyUrl.startsWith('/') ? siteFriendlyUrl.slice(1) : siteFriendlyUrl;
  const prefix = '&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_';
  return (
    `${baseUrl}/ca/group/${siteSlug}/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet` +
    '&p_p_lifecycle=0&p_p_state=maximized' +
    `${prefix}mvcRenderCommandName=%2Flayout_admin%2Fedit_layout` +
    `${prefix}selPlid=${plid}` +
    `${prefix}backURL=` +
    `${prefix}screenNavigationEntryKey=${screenNavigationEntryKey}`
  );
}
