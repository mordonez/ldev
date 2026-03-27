import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/liferay/auth.js';
import type {LiferayApiClient} from '../../core/liferay/client.js';
import {runLiferayInventorySites} from './liferay-inventory-sites.js';
import {
  normalizeAdtWidgetType,
  resolveAdtClassEntries,
} from './liferay-resource-list-adts.js';
import {
  fetchAdtResourceClassNameId,
  listDdmTemplatesByClassName,
  resolveResourceSite,
  type ResolvedResourceSite,
} from './liferay-resource-shared.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResolvedAdtMatch = {
  siteId: number;
  siteFriendlyUrl: string;
  siteName: string;
  widgetType: string;
  className: string;
  templateId: string;
  displayStyle: string;
  templateKey: string;
  adtName: string;
  displayName: string;
  externalReferenceCode: string;
};

export type LiferayResourceResolveAdtResult = {
  query: {
    site: string | null;
    displayStyle: string | null;
    id: string | null;
    name: string | null;
    widgetType: string | null;
    className: string | null;
  };
  searchedSites: string[];
  matches: LiferayResolvedAdtMatch[];
};

export async function runLiferayResourceResolveAdt(
  config: AppConfig,
  options: {site?: string; displayStyle?: string; id?: string; name?: string; widgetType?: string; className?: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceResolveAdtResult> {
  const resolvedTemplateId = templateIdFromDisplayStyle(options.displayStyle, options.id);
  const normalizedWidgetType = normalizeAdtWidgetType(options.widgetType ?? '');
  const explicitClassName = options.className?.trim() ?? '';
  const normalizedName = options.name?.trim() ?? '';

  if (resolvedTemplateId === '' && normalizedName === '') {
    throw new CliError('resolve-adt requiere --display-style, --id o --name', {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  const sites = await collectSearchSites(config, options.site, dependencies);
  const matches: LiferayResolvedAdtMatch[] = [];
  const resourceClassNameId = await fetchAdtResourceClassNameId(config, dependencies);

  for (const site of sites) {
    for (const {widgetType, className} of resolveAdtClassEntries(normalizedWidgetType, explicitClassName)) {
      if (normalizedWidgetType !== '' && widgetType !== normalizedWidgetType) {
        continue;
      }

      const templates = await listDdmTemplatesByClassName(
        config,
        site,
        className,
        resourceClassNameId,
        dependencies,
      );

      for (const item of templates) {
        if (!matchesAdt(item, resolvedTemplateId, normalizedName)) {
          continue;
        }

        const templateId = String(item.templateId ?? '');
        const templateKey = String(item.templateKey ?? '');
        const displayName = String(item.nameCurrentValue ?? '').trim();

        matches.push({
          siteId: site.id,
          siteFriendlyUrl: site.friendlyUrlPath,
          siteName: site.name,
          widgetType,
          className,
          templateId,
          displayStyle: templateId === '' ? '' : `ddmTemplate_${templateId}`,
          templateKey,
          adtName: displayName === '' ? templateKey : displayName,
          displayName,
          externalReferenceCode: String(item.externalReferenceCode ?? ''),
        });
      }
    }
  }

  if (matches.length === 0) {
    throw new CliError('ADT no encontrada. Usa adts o prueba con --site explícito.', {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  return {
    query: {
      site: options.site?.trim() || null,
      displayStyle: options.displayStyle?.trim() || null,
      id: resolvedTemplateId || null,
      name: normalizedName || null,
      widgetType: normalizedWidgetType || null,
      className: explicitClassName || null,
    },
    searchedSites: sites.map((site) => site.friendlyUrlPath),
    matches,
  };
}

export function formatLiferayResourceResolveAdt(result: LiferayResourceResolveAdtResult): string {
  const lines = [
    'RESOURCE_RESOLVE_ADT',
    `matches=${result.matches.length}`,
    `searchedSites=${result.searchedSites.join(',')}`,
  ];

  for (const row of result.matches) {
    lines.push(
      `- site=${row.siteFriendlyUrl} widgetType=${row.widgetType} className=${row.className} templateId=${row.templateId} displayStyle=${row.displayStyle} key=${row.templateKey} name=${row.adtName}`,
    );
  }

  return lines.join('\n');
}

export function templateIdFromDisplayStyle(displayStyle?: string, id?: string): string {
  if (id && id.trim() !== '') {
    return id.trim();
  }

  if (!displayStyle || displayStyle.trim() === '') {
    return '';
  }

  const trimmed = displayStyle.trim();
  if (trimmed.startsWith('ddmTemplate_')) {
    return trimmed.slice('ddmTemplate_'.length);
  }

  return trimmed;
}

export function matchesAdt(item: Record<string, unknown>, templateId: string, name: string): boolean {
  const currentTemplateId = String(item.templateId ?? '');
  const templateKey = String(item.templateKey ?? '');
  const externalReferenceCode = String(item.externalReferenceCode ?? '');
  const displayName = String(item.nameCurrentValue ?? '').trim();

  if (templateId !== '' && templateId === currentTemplateId) {
    return true;
  }

  if (name !== '') {
    return name === templateKey || name === externalReferenceCode || name === displayName;
  }

  return false;
}

async function collectSearchSites(
  config: AppConfig,
  requestedSite: string | undefined,
  dependencies?: ResourceDependencies,
): Promise<ResolvedResourceSite[]> {
  const sites: ResolvedResourceSite[] = [];

  if (requestedSite && requestedSite.trim() !== '') {
    const resolved = await resolveResourceSite(config, requestedSite, dependencies);
    sites.push(resolved);

    if (resolved.friendlyUrlPath !== '/global') {
      sites.push(await resolveResourceSite(config, '/global', dependencies));
    }

    return dedupeSites(sites);
  }

  sites.push(await resolveResourceSite(config, '/global', dependencies));

  const accessibleSites = await runLiferayInventorySites(config, undefined, dependencies);
  for (const site of accessibleSites) {
    sites.push(await resolveResourceSite(config, site.siteFriendlyUrl, dependencies));
  }

  return dedupeSites(sites);
}

function dedupeSites(sites: ResolvedResourceSite[]): ResolvedResourceSite[] {
  const deduped = new Map<number, ResolvedResourceSite>();

  for (const site of sites) {
    deduped.set(site.id, site);
  }

  return [...deduped.values()];
}
