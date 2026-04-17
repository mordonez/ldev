import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {
  fetchAdtResourceClassNameId,
  listDdmTemplatesByClassName,
  resolveResourceSite,
} from './liferay-resource-shared.js';

export const ADT_CLASS_BY_WIDGET_TYPE: Record<string, string> = {
  'asset-entry': 'com.liferay.asset.kernel.model.AssetEntry',
  breadcrumb: 'com.liferay.portal.kernel.servlet.taglib.ui.BreadcrumbEntry',
  'category-facet': 'com.liferay.portal.search.web.internal.category.facet.portlet.CategoryFacetPortlet',
  'custom-facet': 'com.liferay.portal.search.web.internal.custom.facet.portlet.CustomFacetPortlet',
  'custom-filter': 'com.liferay.portal.search.web.internal.custom.filter.display.context.CustomFilterDisplayContext',
  'language-selector': 'com.liferay.portal.kernel.servlet.taglib.ui.LanguageEntry',
  'navigation-menu': 'com.liferay.portal.kernel.theme.NavItem',
  'search-result-summary':
    'com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext',
  searchbar: 'com.liferay.portal.search.web.internal.search.bar.portlet.SearchBarPortlet',
  'similar-results':
    'com.liferay.portal.search.similar.results.web.internal.display.context.SimilarResultsDocumentDisplayContext',
};

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceAdtRow = {
  adtName: string;
  displayName: string;
  widgetType: string;
  className: string;
  templateId: number;
  templateKey: string;
  classNameId: number;
  script?: string;
};

export async function runLiferayResourceListAdts(
  config: AppConfig,
  options?: {site?: string; widgetType?: string; className?: string; includeScript?: boolean},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceAdtRow[]> {
  const site = await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const filter = normalizeAdtWidgetType(options?.widgetType ?? '');
  const explicitClassName = options?.className?.trim() ?? '';
  const resourceClassNameId = await fetchAdtResourceClassNameId(config, dependencies);
  const rows: LiferayResourceAdtRow[] = [];
  for (const {widgetType, className} of resolveAdtClassEntries(filter, explicitClassName)) {
    if (filter !== '' && widgetType !== filter) {
      continue;
    }

    const templates = await listDdmTemplatesByClassName(config, site, className, resourceClassNameId, dependencies);
    for (const item of templates) {
      const displayName = String(item.nameCurrentValue ?? '').trim();
      const templateKey = String(item.templateKey ?? '');
      rows.push({
        adtName: displayName === '' ? templateKey : displayName,
        displayName,
        widgetType,
        className,
        templateId: Number(item.templateId ?? -1),
        templateKey,
        classNameId: Number(item.classNameId ?? -1),
        ...(options?.includeScript ? {script: String(item.script ?? '')} : {}),
      });
    }
  }

  return rows;
}

export function formatLiferayResourceAdts(rows: LiferayResourceAdtRow[]): string {
  if (rows.length === 0) {
    return 'No ADTs';
  }

  return rows.map((row) => `${row.widgetType}\t${row.templateId}\t${row.templateKey}\t${row.adtName}`).join('\n');
}

export function normalizeAdtWidgetType(widgetType: string): string {
  const normalized = widgetType.trim().toLowerCase().replaceAll('_', '-');
  if (normalized === 'search-results') {
    return 'search-result-summary';
  }
  return normalized;
}

export function resolveAdtClassEntries(
  widgetType: string,
  className: string,
): Array<{widgetType: string; className: string}> {
  if (className.trim() !== '') {
    return [
      {
        widgetType: widgetType || deriveAdtWidgetTypeFromClassName(className),
        className: className.trim(),
      },
    ];
  }

  return Object.entries(ADT_CLASS_BY_WIDGET_TYPE).map(([resolvedWidgetType, resolvedClassName]) => ({
    widgetType: resolvedWidgetType,
    className: resolvedClassName,
  }));
}

function deriveAdtWidgetTypeFromClassName(className: string): string {
  const basename = className.trim().split('.').at(-1) ?? className.trim();
  const stripped = basename
    .replace(/DisplayContext$/, '')
    .replace(/Portlet$/, '')
    .replace(/Entry$/, '')
    .replace(/Item$/, '');

  const kebab = stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();

  return kebab === '' ? 'adt' : kebab;
}
