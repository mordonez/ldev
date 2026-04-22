import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {CliError} from '../../../core/errors.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {trimLeadingSlash} from '../../../core/utils/text.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {resolveRegularLayoutPage} from '../inventory/liferay-inventory-page.js';
import {buildLayoutConfigureUrl} from './liferay-page-admin-urls.js';
import {fetchHeadlessSitePage, type HeadlessSitePagePayload} from './liferay-site-page-shared.js';

const EXPORT_KIND = 'liferay-page-layout-export';
const EXPORT_SCHEMA_VERSION = 1;

type PageLayoutExportDependencies = {
  apiClient?: HttpApiClient;
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
  headlessSitePage: HeadlessSitePagePayload;
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
  const gateway = createLiferayGateway(config, apiClient, dependencies?.tokenClient);
  const headlessSitePage = await fetchHeadlessSitePage(gateway, regularPage.groupId, regularPage.friendlyUrl);

  if (headlessSitePage === null) {
    throw LiferayErrors.pageLayoutError(
      'The page cannot be exported through Headless Delivery or could not be resolved as a content page.',
    );
  }

  const experiences = await fetchSitePageExperiences(gateway, regularPage.groupId, regularPage.friendlyUrl);

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

async function fetchSitePageExperiences(
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
): Promise<unknown> {
  const slug = trimLeadingSlash(friendlyUrl);

  try {
    return await gateway.getJson<unknown>(
      `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${slug}/experiences`,
      `fetch site page experiences ${siteId}/${slug}`,
    );
  } catch (error) {
    if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR') {
      return null;
    }

    throw error;
  }
}
