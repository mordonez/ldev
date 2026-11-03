import type {AppConfig} from '../../../core/config/load-config.js';
import {resolveSite} from '../portal/site-resolution.js';
import {listRedirectEntries, type RedirectDependencies, type RedirectEntry} from './liferay-redirects-shared.js';

export type LiferayInventoryRedirectsResult = {
  inventoryType: 'redirects';
  groupId: number;
  siteFriendlyUrl: string;
  count: number;
  redirects: RedirectEntry[];
};

export async function runLiferayInventoryRedirects(
  config: AppConfig,
  options: {site: string},
  dependencies?: RedirectDependencies,
): Promise<LiferayInventoryRedirectsResult> {
  const site = await resolveSite(config, options.site, dependencies);
  const redirects = (await listRedirectEntries(config, site.id, dependencies)).sort((a, b) =>
    a.sourceURL.localeCompare(b.sourceURL),
  );
  return {
    inventoryType: 'redirects',
    groupId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    count: redirects.length,
    redirects,
  };
}

export function formatLiferayInventoryRedirects(result: LiferayInventoryRedirectsResult): string {
  return [
    `REDIRECTS site=${result.siteFriendlyUrl} groupId=${result.groupId} count=${result.count}`,
    ...result.redirects.map(
      (entry) => `${entry.permanent ? '301' : '302'}\t/${entry.sourceURL}\t-> ${entry.destinationURL}`,
    ),
  ].join('\n');
}
