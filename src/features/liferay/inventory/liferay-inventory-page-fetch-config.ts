import {firstNonEmptyString, firstPositiveNumber, toBoolean, toBooleanOrFalse} from '../../../core/utils/coerce.js';
import type {Layout} from '../page-layout/liferay-layout-shared.js';
import type {
  InventoryPageConfigurationCustomMetaTags,
  InventoryPageConfigurationDesign,
  InventoryPageConfigurationGeneral,
  InventoryPageConfigurationOpenGraph,
  InventoryPageConfigurationSeo,
  InventoryPageConfigurationTabs,
  InventoryPageRawLayout,
} from './liferay-inventory-page.js';
import type {
  HeadlessSitePagePayload,
  HeadlessSitePageSettingsPayload,
} from '../page-layout/liferay-site-page-shared.js';

function extractConfigurationMetadata(
  layout: Layout,
  pageMetadata?: HeadlessSitePagePayload | null,
): {
  typeSettings: {[key: string]: string};
  metadata: HeadlessSitePagePayload;
  metadataSettings: HeadlessSitePageSettingsPayload;
  customFieldsMap: {[key: string]: unknown};
  categories: string[];
  tags: string[];
} {
  const typeSettings = parseTypeSettingsMap(layout.typeSettings ?? '');
  const metadata: HeadlessSitePagePayload = pageMetadata ?? {};
  const metadataSettings: HeadlessSitePageSettingsPayload = metadata.settings ?? {};

  const customFieldsMap: {[key: string]: unknown} = {};
  for (const field of metadata.customFields ?? []) {
    const name = String(field.name ?? '').trim();
    if (!name) {
      continue;
    }
    customFieldsMap[name] = field.customValue?.data;
  }

  const categories = (metadata.taxonomyCategoryBriefs ?? [])
    .map((item: {taxonomyCategoryName?: string}) => item.taxonomyCategoryName)
    .filter((value: string | undefined): value is string => typeof value === 'string' && value.trim() !== '');

  const tags = (metadata.keywords ?? []).filter(
    (item: string | undefined): item is string => typeof item === 'string' && item.trim() !== '',
  );

  return {typeSettings, metadata, metadataSettings, customFieldsMap, categories, tags};
}

export function buildRegularPageConfigurationTabs(
  layout: Layout,
  layoutDetails: {layoutTemplateId?: string; targetUrl?: string},
  privateLayout: boolean,
  pageMetadata?: HeadlessSitePagePayload | null,
): InventoryPageConfigurationTabs {
  const {typeSettings, metadata, metadataSettings, customFieldsMap, categories, tags} = extractConfigurationMetadata(
    layout,
    pageMetadata,
  );

  const general: InventoryPageConfigurationGeneral = {
    type: layout.type ?? '',
    name: layout.nameCurrentValue ?? '',
    hiddenInNavigation: toBooleanOrFalse(layout.hidden),
    friendlyUrl: layout.friendlyURL ?? '',
    queryString: typeSettings.queryString,
    targetType: layoutDetails.targetUrl ? 'url' : '',
    target: layoutDetails.targetUrl ?? '',
    categories,
    tags,
    privateLayout,
  };

  const design: InventoryPageConfigurationDesign = {
    theme: {
      useInheritedTheme: false,
      themeId: layout.themeId ?? '',
      colorSchemeId: layout.colorSchemeId ?? '',
      styleBookEntryId: Number(layout.styleBookEntryId ?? 0),
      masterLayoutPlid: Number(layout.masterLayoutPlid ?? 0),
      faviconFileEntryId: Number(layout.faviconFileEntryId ?? 0),
    },
    themeFlags: {
      showHeader: toBoolean(typeSettings['lfr-theme:regular:show-header']) ?? undefined,
      showFooter: toBoolean(typeSettings['lfr-theme:regular:show-footer']) ?? undefined,
      showHeaderSearch: toBoolean(typeSettings['lfr-theme:regular:show-header-search']) ?? undefined,
      wrapWidgetPageContent: toBoolean(typeSettings['lfr-theme:regular:wrap-widget-page-content']) ?? undefined,
      layoutUpdateable: toBoolean(typeSettings.layoutUpdateable) ?? undefined,
      published: toBoolean(typeSettings.published) ?? undefined,
    },
    customCss: layout.css ?? '',
    customJavascript: layout.javascript ?? '',
    customFields: customFieldsMap,
  };

  const seo: InventoryPageConfigurationSeo = {
    title: layout.titleCurrentValue ?? '',
    description: layout.descriptionCurrentValue ?? '',
    keywords: layout.keywordsCurrentValue ?? '',
    robots: layout.robotsCurrentValue ?? layout.robots ?? '',
    sitemap: {
      include: toBoolean(typeSettings['sitemap-include']) ?? undefined,
      changefreq: typeSettings['sitemap-changefreq'] ?? '',
    },
  };

  const openGraph: InventoryPageConfigurationOpenGraph = {
    title: firstNonEmptyString(metadataSettings.openGraphTitle, metadata.openGraphTitle),
    description: firstNonEmptyString(metadataSettings.openGraphDescription, metadata.openGraphDescription),
    type: firstNonEmptyString(metadataSettings.openGraphType, metadata.openGraphType),
    url: firstNonEmptyString(metadataSettings.openGraphUrl, metadata.openGraphUrl),
    imageAlt: firstNonEmptyString(metadataSettings.openGraphImageAlt, metadata.openGraphImageAlt),
    imageFileEntryId:
      firstPositiveNumber(metadataSettings.openGraphImageFileEntryId, metadata.openGraphImageFileEntryId) ?? undefined,
  };

  const customMetaTags: InventoryPageConfigurationCustomMetaTags = {
    values: metadata.customMetaTags ?? metadataSettings.customMetaTags ?? typeSettings.customMetaTags,
  };

  return {
    general,
    design,
    seo,
    openGraph,
    customMetaTags,
  };
}

export function buildConfigurationRawLayout(layout: Layout): InventoryPageRawLayout {
  return {
    layoutId: Number(layout.layoutId ?? -1),
    plid: Number(layout.plid ?? -1),
    type: layout.type ?? '',
    nameCurrentValue: layout.nameCurrentValue ?? '',
    titleCurrentValue: layout.titleCurrentValue ?? '',
    descriptionCurrentValue: layout.descriptionCurrentValue ?? '',
    keywordsCurrentValue: layout.keywordsCurrentValue ?? '',
    robotsCurrentValue: layout.robotsCurrentValue ?? '',
    friendlyURL: layout.friendlyURL ?? '',
    hidden: toBooleanOrFalse(layout.hidden),
    themeId: layout.themeId ?? '',
    colorSchemeId: layout.colorSchemeId ?? '',
    styleBookEntryId: Number(layout.styleBookEntryId ?? 0),
    masterLayoutPlid: Number(layout.masterLayoutPlid ?? 0),
    faviconFileEntryId: Number(layout.faviconFileEntryId ?? 0),
    css: layout.css ?? '',
    javascript: layout.javascript ?? '',
  };
}

export function buildConfigurationRawSitePage(pageMetadata: HeadlessSitePagePayload): HeadlessSitePagePayload {
  // pageMetadata is already normalized by toHeadlessSitePagePayload — pass through directly
  // to avoid introducing synthetic empty strings/arrays for absent fields.
  return pageMetadata;
}

export function parseTypeSettingsMap(rawTypeSettings: string): Record<string, string> {
  const settings: Record<string, string> = {};
  if (rawTypeSettings.trim() === '') {
    return settings;
  }
  for (const line of rawTypeSettings.split(/\r?\n/)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key !== '') {
      settings[key] = value;
    }
  }
  return settings;
}
