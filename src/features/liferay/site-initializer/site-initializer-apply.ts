/**
 * `ldev resource apply-site-initializer`: create a site from a site initializer
 * by site ERC and read back what it declared.
 *
 * Site initializers are create-only (only `POST /sites/site-initializer` runs
 * BundleSiteInitializer; redeploys and PUTs do not re-apply assets), so applying
 * to an existing site means deleting and recreating it, which needs --recreate.
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, isGatewayStatus} from '../liferay-gateway.js';
import type {ResourceDependencies} from '../resource/liferay-resource-artifact-shared.js';
import {getOrNull, listAllPages} from '../resource/liferay-resource-headless-shared.js';
import {textOf} from '../resource/liferay-resource-object-diff.js';
import {
  buildSiteInitializerPlan,
  resolveSiteInitializerSource,
  zipSiteInitializer,
  type SiteInitializerLint,
  type SiteInitializerPlan,
} from './site-initializer-plan.js';

const ADMIN_SITE = '/o/headless-admin-site/v1.0';
const DELIVERY = '/o/headless-delivery/v1.0';

type RemoteSite = {id: number; externalReferenceCode: string; friendlyUrlPath: string; name: string};

export type SiteInitializerReadBack = {
  pages: {missing: string[]; present: string[]};
  menus: {missing: string[]; itemCountMismatch: {name: string; declared: number; actual: number}[]};
  displayPageTemplates: {supported: boolean; missing: string[]; note: string | null};
};

export type ApplySiteInitializerResult = {
  status: 'checked' | 'created' | 'recreated';
  siteExternalReferenceCode: string;
  siteName: string;
  sourceDir: string;
  /** check-only: what the portal would do. */
  action: 'create' | 'recreate' | 'blocked-existing-site';
  site: {id: number; friendlyUrlPath: string} | null;
  declared: {pages: number; menus: number; displayPageTemplates: number};
  lint: SiteInitializerLint[];
  readBack: SiteInitializerReadBack | null;
};

export async function runApplySiteInitializer(
  config: AppConfig,
  options: {
    source: string;
    siteErc?: string;
    siteName?: string;
    friendlyUrlPath?: string;
    recreate?: boolean;
    checkOnly?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<ApplySiteInitializerResult> {
  const plan = await buildSiteInitializerPlan(await resolveSiteInitializerSource(config, options.source));
  const siteErc = options.siteErc ?? plan.defaults.siteExternalReferenceCode;
  if (!siteErc) {
    throw LiferayErrors.configError(
      'apply-site-initializer needs --site-erc (or siteExternalReferenceCode in the client-extension.yaml)',
    );
  }
  const siteName = options.siteName ?? plan.defaults.siteName ?? siteErc;

  const errors = plan.lint.filter((item) => item.level === 'error');
  if (errors.length > 0) {
    throw LiferayErrors.resourceError(
      `Site initializer ${plan.sourceDir} has errors: ${errors.map((item) => `${item.file}: ${item.message}`).join('; ')}`,
      {details: {lint: plan.lint}},
    );
  }

  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const existing = await getOrNull(() =>
    gateway.getJson<RemoteSite>(`${ADMIN_SITE}/sites/${encodeURIComponent(siteErc)}`, 'site-get-by-erc'),
  );
  const action = !existing ? 'create' : options.recreate ? 'recreate' : 'blocked-existing-site';
  const base = {
    siteExternalReferenceCode: siteErc,
    siteName,
    sourceDir: plan.sourceDir,
    action,
    declared: {
      pages: plan.pages.length,
      menus: plan.menus.length,
      displayPageTemplates: plan.displayPageTemplates.length,
    },
    lint: plan.lint,
  } as const;

  if (options.checkOnly) {
    return {
      ...base,
      status: 'checked',
      site: existing ? {id: existing.id, friendlyUrlPath: existing.friendlyUrlPath} : null,
      readBack: null,
    };
  }

  if (action === 'blocked-existing-site') {
    throw LiferayErrors.resourceBreakingChange(
      `Site ${siteErc} already exists. Site initializers are create-only: re-applying means deleting the site ` +
        'and all its content, then recreating it. Pass --recreate to do that.',
      {details: {siteExternalReferenceCode: siteErc, siteId: existing?.id}},
    );
  }

  try {
    if (existing) {
      await gateway.deleteJson(`${ADMIN_SITE}/sites/${encodeURIComponent(siteErc)}`, 'site-delete');
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(await zipSiteInitializer(plan.sourceDir))], {type: 'application/zip'}),
      'site-initializer.zip',
    );
    form.append(
      'site',
      JSON.stringify({
        externalReferenceCode: siteErc,
        name: siteName,
        ...(options.friendlyUrlPath ? {friendlyUrlPath: options.friendlyUrlPath} : {}),
      }),
    );
    const created = await gateway.postMultipart<RemoteSite>(
      `${ADMIN_SITE}/sites/site-initializer`,
      form,
      'site-initializer-apply',
    );

    const readBack = await readBackSiteInitializer(config, plan, created, dependencies);
    const result: ApplySiteInitializerResult = {
      ...base,
      status: existing ? 'recreated' : 'created',
      site: {id: created.id, friendlyUrlPath: created.friendlyUrlPath},
      readBack,
    };

    const problems = [
      ...readBack.pages.missing.map((url) => `page ${url} missing`),
      ...readBack.menus.missing.map((name) => `navigation menu ${name} missing`),
      ...readBack.menus.itemCountMismatch.map(
        (menu) => `navigation menu ${menu.name} has ${menu.actual} item(s), ${menu.declared} declared`,
      ),
      ...readBack.displayPageTemplates.missing.map((key) => `display page template ${key} missing`),
    ];
    if (problems.length > 0) {
      throw LiferayErrors.resourceError(
        `Site ${siteErc} was created but the site initializer did not apply cleanly: ${problems.join('; ')}`,
        {details: result},
      );
    }
    return result;
  } catch (error) {
    if (isGatewayStatus(error, 400, 409, 500)) {
      throw LiferayErrors.resourceError(`Applying the site initializer to ${siteErc} failed: ${String(error)}`);
    }
    throw error;
  }
}

async function readBackSiteInitializer(
  config: AppConfig,
  plan: SiteInitializerPlan,
  site: RemoteSite,
  dependencies?: ResourceDependencies,
): Promise<SiteInitializerReadBack> {
  const pages = await listAllPages<Record<string, unknown>>(
    config,
    `${DELIVERY}/sites/${site.id}/site-pages`,
    'site-initializer-read-pages',
    dependencies,
  );
  const remoteUrls = new Set(pages.map((page) => textOf(page.friendlyUrlPath)));
  const declaredUrls = plan.pages.map((page) => page.friendlyUrl);

  const menus = await listAllPages<Record<string, unknown>>(
    config,
    `${DELIVERY}/sites/${site.id}/navigation-menus`,
    'site-initializer-read-menus',
    dependencies,
  );
  const remoteMenus = new Map(menus.map((menu) => [textOf(menu.name), menu]));

  return {
    pages: {
      present: declaredUrls.filter((url) => remoteUrls.has(url)),
      missing: declaredUrls.filter((url) => !remoteUrls.has(url)),
    },
    menus: {
      missing: plan.menus.filter((menu) => !remoteMenus.has(menu.name)).map((menu) => menu.name),
      itemCountMismatch: plan.menus.flatMap((menu) => {
        const remote = remoteMenus.get(menu.name);
        const actual = remote && Array.isArray(remote.navigationMenuItems) ? remote.navigationMenuItems.length : 0;
        return remote && actual !== menu.itemCount ? [{name: menu.name, declared: menu.itemCount, actual}] : [];
      }),
    },
    displayPageTemplates: await readBackDisplayPageTemplates(config, plan, site, dependencies),
  };
}

/** The admin DPT endpoint needs feature flag LPD-35443; without it the read-back says so instead of guessing. */
async function readBackDisplayPageTemplates(
  config: AppConfig,
  plan: SiteInitializerPlan,
  site: RemoteSite,
  dependencies?: ResourceDependencies,
): Promise<SiteInitializerReadBack['displayPageTemplates']> {
  if (plan.displayPageTemplates.length === 0) {
    return {supported: true, missing: [], note: null};
  }
  try {
    const remote = await listAllPages<Record<string, unknown>>(
      config,
      `${ADMIN_SITE}/sites/${encodeURIComponent(site.externalReferenceCode)}/display-page-templates`,
      'site-initializer-read-dpts',
      dependencies,
    );
    const names = new Set(
      remote.flatMap((dpt) => [textOf(dpt.name), textOf(dpt.key), textOf(dpt.externalReferenceCode)]),
    );
    return {
      supported: true,
      missing: plan.displayPageTemplates
        .filter((dpt) => !names.has(dpt.key) && !(dpt.name !== null && names.has(dpt.name)))
        .map((dpt) => dpt.key),
      note: null,
    };
  } catch (error) {
    if (isGatewayStatus(error, 400)) {
      return {
        supported: false,
        missing: [],
        note: 'display page templates could not be read back (headless-admin-site needs feature flag LPD-35443)',
      };
    }
    throw error;
  }
}

export function formatApplySiteInitializer(result: ApplySiteInitializerResult): string {
  const lines = [
    `${result.status}\t${result.siteExternalReferenceCode}\t${result.siteName}`,
    `source=${result.sourceDir}`,
    `action=${result.action}`,
    `declared pages=${result.declared.pages} menus=${result.declared.menus} displayPageTemplates=${result.declared.displayPageTemplates}`,
    ...result.lint.map((item) => `${item.level}\t${item.file}\t${item.message}`),
  ];
  if (result.site) {
    lines.push(`site id=${result.site.id} friendlyUrlPath=${result.site.friendlyUrlPath}`);
  }
  if (result.readBack) {
    lines.push(`read-back pages=${result.readBack.pages.present.length}/${result.declared.pages}`);
    if (result.readBack.displayPageTemplates.note) {
      lines.push(result.readBack.displayPageTemplates.note);
    }
  }
  return lines.join('\n');
}
