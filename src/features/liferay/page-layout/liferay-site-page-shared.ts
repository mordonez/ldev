import {CliError} from '../../../core/errors.js';
import {trimLeadingSlash} from '../../../core/utils/text.js';
import type {LiferayGateway} from '../liferay-gateway.js';

export type HeadlessSitePageActions = {
  [key: string]: unknown;
};

export type HeadlessSitePageTaxonomyCategoryBrief = {
  taxonomyCategoryName?: string;
  [key: string]: unknown;
};

export type HeadlessSitePageCustomValuePayload = {
  data?: unknown;
  [key: string]: unknown;
};

export type HeadlessSitePageCustomFieldPayload = {
  name?: string;
  customValue?: HeadlessSitePageCustomValuePayload;
  [key: string]: unknown;
};

export type HeadlessSitePageSettingsPayload = {
  openGraphTitle?: string;
  openGraphDescription?: string;
  openGraphType?: string;
  openGraphUrl?: string;
  openGraphImageAlt?: string;
  openGraphImageFileEntryId?: number;
  customMetaTags?: unknown;
  [key: string]: unknown;
};

export type HeadlessPageElementPayload = {
  type?: string;
  name?: string;
  definition?: {[key: string]: unknown};
  cssClasses?: string[];
  customCSS?: string;
  pageElements?: HeadlessPageElementPayload[];
  [key: string]: unknown;
};

export type HeadlessPageDefinitionPayload = {
  pageElement?: HeadlessPageElementPayload | null;
  widgets?: unknown[];
  [key: string]: unknown;
};

export type HeadlessSitePagePayload = {
  id?: number;
  uuid?: string;
  friendlyUrlPath?: string;
  pageType?: string;
  siteId?: number;
  title?: string;
  actions?: HeadlessSitePageActions;
  pageDefinition?: HeadlessPageDefinitionPayload;
  availableLanguages?: string[];
  taxonomyCategoryBriefs?: HeadlessSitePageTaxonomyCategoryBrief[];
  keywords?: string[];
  customFields?: HeadlessSitePageCustomFieldPayload[];
  settings?: HeadlessSitePageSettingsPayload;
  viewableBy?: {[key: string]: unknown};
  openGraphTitle?: string;
  openGraphDescription?: string;
  openGraphType?: string;
  openGraphUrl?: string;
  openGraphImageAlt?: string;
  openGraphImageFileEntryId?: number;
  [key: string]: unknown;
};

export function toHeadlessSitePagePayload(raw: unknown): HeadlessSitePagePayload | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

  const normalized = {...record} as HeadlessSitePagePayload;
  const actions = asObject(record.actions);
  const pageDefinition = toHeadlessPageDefinitionPayload(record.pageDefinition);
  const settings = toHeadlessSitePageSettingsPayload(record.settings);
  const viewableBy = asObject(record.viewableBy);
  const taxonomyCategoryBriefs = Array.isArray(record.taxonomyCategoryBriefs)
    ? record.taxonomyCategoryBriefs
        .map((item) => toHeadlessSitePageTaxonomyCategoryBrief(item))
        .filter((item): item is HeadlessSitePageTaxonomyCategoryBrief => item !== null)
    : undefined;
  const customFields = Array.isArray(record.customFields)
    ? record.customFields
        .map((item) => toHeadlessSitePageCustomFieldPayload(item))
        .filter((item): item is HeadlessSitePageCustomFieldPayload => item !== null)
    : undefined;
  const availableLanguages = toStringArray(record.availableLanguages);
  const keywords = toStringArray(record.keywords);

  normalized.id = toPositiveNumber(record.id);
  normalized.uuid = toStringOrUndefined(record.uuid);
  normalized.friendlyUrlPath = toStringOrUndefined(record.friendlyUrlPath);
  normalized.pageType = toStringOrUndefined(record.pageType);
  normalized.siteId = toPositiveNumber(record.siteId);
  normalized.title = toStringOrUndefined(record.title);
  normalized.openGraphTitle = toStringOrUndefined(record.openGraphTitle);
  normalized.openGraphDescription = toStringOrUndefined(record.openGraphDescription);
  normalized.openGraphType = toStringOrUndefined(record.openGraphType);
  normalized.openGraphUrl = toStringOrUndefined(record.openGraphUrl);
  normalized.openGraphImageAlt = toStringOrUndefined(record.openGraphImageAlt);
  normalized.openGraphImageFileEntryId = toPositiveNumber(record.openGraphImageFileEntryId);

  if (actions) {
    normalized.actions = actions;
  } else {
    delete normalized.actions;
  }

  if (pageDefinition) {
    normalized.pageDefinition = pageDefinition;
  } else {
    delete normalized.pageDefinition;
  }

  if (availableLanguages) {
    normalized.availableLanguages = availableLanguages;
  } else {
    delete normalized.availableLanguages;
  }

  if (taxonomyCategoryBriefs) {
    normalized.taxonomyCategoryBriefs = taxonomyCategoryBriefs;
  } else {
    delete normalized.taxonomyCategoryBriefs;
  }

  if (keywords) {
    normalized.keywords = keywords;
  } else {
    delete normalized.keywords;
  }

  if (customFields) {
    normalized.customFields = customFields;
  } else {
    delete normalized.customFields;
  }

  if (settings) {
    normalized.settings = settings;
  } else {
    delete normalized.settings;
  }

  if (viewableBy) {
    normalized.viewableBy = viewableBy;
  } else {
    delete normalized.viewableBy;
  }

  return normalized;
}

export async function fetchHeadlessSitePage(
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
): Promise<HeadlessSitePagePayload | null> {
  return fetchHeadlessSitePageWithQuery(
    gateway,
    siteId,
    friendlyUrl,
    '?fields=actions,friendlyUrlPath,id,pageDefinition,pageType,siteId,title,uuid',
    'fetch-site-page',
  );
}

export async function fetchHeadlessSitePageElement(
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
): Promise<HeadlessPageElementPayload | null> {
  try {
    const sitePage = await fetchHeadlessSitePageWithQuery(
      gateway,
      siteId,
      friendlyUrl,
      '?fields=pageDefinition',
      'fetch-site-page-element',
    );

    return sitePage?.pageDefinition?.pageElement ?? null;
  } catch {
    return null;
  }
}

export async function fetchHeadlessSitePageMetadata(
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
): Promise<HeadlessSitePagePayload | null> {
  try {
    return await fetchHeadlessSitePageWithQuery(
      gateway,
      siteId,
      friendlyUrl,
      '?nestedFields=taxonomyCategoryBriefs',
      'fetch-site-page-metadata',
    );
  } catch {
    return null;
  }
}

async function fetchHeadlessSitePageWithQuery(
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
  query: string,
  label: string,
): Promise<HeadlessSitePagePayload | null> {
  const slug = trimLeadingSlash(friendlyUrl);

  try {
    const raw = await gateway.getJson<unknown>(
      `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${encodeURIComponent(slug)}${query}`,
      label,
    );
    return toHeadlessSitePagePayload(raw);
  } catch (error) {
    if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR') {
      return null;
    }

    throw error;
  }
}

function toHeadlessSitePageTaxonomyCategoryBrief(raw: unknown): HeadlessSitePageTaxonomyCategoryBrief | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

  const normalized = {...record} as HeadlessSitePageTaxonomyCategoryBrief;
  normalized.taxonomyCategoryName = toStringOrUndefined(record.taxonomyCategoryName);
  return normalized;
}

function toHeadlessSitePageCustomFieldPayload(raw: unknown): HeadlessSitePageCustomFieldPayload | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

  const normalized = {...record} as HeadlessSitePageCustomFieldPayload;
  const customValue = asObject(record.customValue);

  normalized.name = toStringOrUndefined(record.name);

  if (customValue) {
    normalized.customValue = {...customValue} as HeadlessSitePageCustomValuePayload;
  } else {
    delete normalized.customValue;
  }

  return normalized;
}

function toHeadlessSitePageSettingsPayload(raw: unknown): HeadlessSitePageSettingsPayload | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

  const normalized = {...record} as HeadlessSitePageSettingsPayload;
  normalized.openGraphTitle = toStringOrUndefined(record.openGraphTitle);
  normalized.openGraphDescription = toStringOrUndefined(record.openGraphDescription);
  normalized.openGraphType = toStringOrUndefined(record.openGraphType);
  normalized.openGraphUrl = toStringOrUndefined(record.openGraphUrl);
  normalized.openGraphImageAlt = toStringOrUndefined(record.openGraphImageAlt);
  normalized.openGraphImageFileEntryId = toPositiveNumber(record.openGraphImageFileEntryId);
  return normalized;
}

function toHeadlessPageDefinitionPayload(raw: unknown): HeadlessPageDefinitionPayload | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

  const normalized = {...record} as HeadlessPageDefinitionPayload;
  const pageElement = toHeadlessPageElementPayload(record.pageElement);
  if (pageElement) {
    normalized.pageElement = pageElement;
  } else {
    delete normalized.pageElement;
  }
  if (!Array.isArray(record.widgets)) {
    delete normalized.widgets;
  }
  return normalized;
}

function toHeadlessPageElementPayload(raw: unknown): HeadlessPageElementPayload | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

  const normalized = {...record} as HeadlessPageElementPayload;
  const definition = asObject(record.definition);
  const pageElements = Array.isArray(record.pageElements)
    ? record.pageElements
        .map((item) => toHeadlessPageElementPayload(item))
        .filter((item): item is HeadlessPageElementPayload => item !== null)
    : undefined;
  const cssClasses = toStringArray(record.cssClasses);

  normalized.type = toStringOrUndefined(record.type);
  normalized.name = toStringOrUndefined(record.name);
  normalized.customCSS = toStringOrUndefined(record.customCSS);

  if (definition) {
    normalized.definition = definition;
  } else {
    delete normalized.definition;
  }

  if (cssClasses) {
    normalized.cssClasses = cssClasses;
  } else {
    delete normalized.cssClasses;
  }

  if (pageElements) {
    normalized.pageElements = pageElements;
  } else {
    delete normalized.pageElements;
  }

  return normalized;
}

function asObject(value: unknown): {[key: string]: unknown} | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? ({...(value as {[key: string]: unknown})} as {[key: string]: unknown})
    : null;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized === '' ? undefined : normalized;
}

function toPositiveNumber(value: unknown): number | undefined {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return undefined;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === 'string');
}
