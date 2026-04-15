import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {trimLeadingSlash} from '../../../core/utils/text.js';
import {LiferayErrors} from '../errors/index.js';
import {resolveRegularLayoutPage} from '../inventory/liferay-inventory-page.js';
import {authedGet, fetchAccessToken} from '../inventory/liferay-inventory-shared.js';
import {buildLayoutConfigureUrl} from './liferay-page-admin-urls.js';

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
    view: string;
    edit: string;
    translate: string;
    configureGeneral: string;
    configureDesign: string;
    configureSeo: string;
    configureOpenGraph: string;
    configureCustomMetaTags: string;
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
  const headlessSitePage = await fetchSitePage(
    config,
    apiClient,
    accessToken,
    regularPage.groupId,
    regularPage.friendlyUrl,
  );

  if (headlessSitePage === null) {
    throw LiferayErrors.pageLayoutError(
      'The page cannot be exported through Headless Delivery or could not be resolved as a content page.',
    );
  }

  const experiences = await fetchSitePageExperiences(
    config,
    apiClient,
    accessToken,
    regularPage.groupId,
    regularPage.friendlyUrl,
  );

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
      view: regularPage.adminUrls.view,
      edit: regularPage.adminUrls.edit,
      translate: regularPage.adminUrls.translate,
      configureGeneral: buildLayoutConfigureUrl(
        config.liferay.url,
        regularPage.siteFriendlyUrl,
        regularPage.groupId,
        regularPage.plid,
        'general',
        regularPage.privateLayout,
      ),
      configureDesign: buildLayoutConfigureUrl(
        config.liferay.url,
        regularPage.siteFriendlyUrl,
        regularPage.groupId,
        regularPage.plid,
        'design',
        regularPage.privateLayout,
      ),
      configureSeo: buildLayoutConfigureUrl(
        config.liferay.url,
        regularPage.siteFriendlyUrl,
        regularPage.groupId,
        regularPage.plid,
        'seo',
        regularPage.privateLayout,
      ),
      configureOpenGraph: buildLayoutConfigureUrl(
        config.liferay.url,
        regularPage.siteFriendlyUrl,
        regularPage.groupId,
        regularPage.plid,
        'open-graph',
        regularPage.privateLayout,
      ),
      configureCustomMetaTags: buildLayoutConfigureUrl(
        config.liferay.url,
        regularPage.siteFriendlyUrl,
        regularPage.groupId,
        regularPage.plid,
        'custom-meta-tags',
        regularPage.privateLayout,
      ),
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
    throw LiferayErrors.pageLayoutError(
      `page-layout export solo soporta layoutType=content; recibido ${page.layoutType || '<empty>'}.`,
    );
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
  const slug = trimLeadingSlash(friendlyUrl);
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
  const slug = trimLeadingSlash(friendlyUrl);
  const response = await authedGet<unknown>(
    config,
    apiClient,
    accessToken,
    `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${slug}/experiences`,
  );

  return response.ok ? response.data : null;
}
