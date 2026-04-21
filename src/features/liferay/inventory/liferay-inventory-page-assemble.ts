import {firstNonBlank, firstString as firstStringUtil, normalizeScalarString} from '../../../core/utils/text.js';
import type {HeadlessPageElementPayload} from '../page-layout/liferay-site-page-shared.js';

export type StructuredContent = {
  id?: number;
  key?: string;
  title?: string;
  friendlyUrlPath?: string;
  contentStructureId?: number;
  contentFields?: unknown[];
};

export type ContentFieldSummary = {
  path: string;
  label: string;
  name: string;
  type: string;
  value: string;
};

export type JournalArticleSummary = {
  groupId?: number;
  siteFriendlyUrl?: string;
  siteName?: string;
  articleId: string;
  title: string;
  ddmStructureKey: string;
  ddmTemplateKey?: string;
  ddmStructureSiteFriendlyUrl?: string;
  ddmTemplateSiteFriendlyUrl?: string;
  structureExportPath?: string;
  templateExportPath?: string;
  contentStructureId?: number;
  contentFields?: ContentFieldSummary[];
  widgetDefaultTemplate?: string;
  widgetHeadlessDefaultTemplate?: string;
  displayPageDefaultTemplate?: string;
  widgetTemplateCandidates?: string[];
  displayPageTemplateCandidates?: string[];
  displayPageDdmTemplates?: string[];
  taxonomyCategoryNames?: string[];
  taxonomyCategoryBriefs?: Array<Record<string, unknown>>;
  renderedContents?: Array<Record<string, unknown>>;
  availableLanguages?: string[];
  dateCreated?: string;
  dateModified?: string;
  datePublished?: string;
  expirationDate?: string;
  reviewDate?: string;
  description?: string;
  externalReferenceCode?: string;
  siteId?: number;
  structuredContentFolderId?: number;
  uuid?: string;
  priority?: number;
  neverExpire?: boolean;
  subscribed?: boolean;
  relatedContentsCount?: number;
};

export type ContentStructureSummary = {
  contentStructureId: number;
  key?: string;
  name: string;
  siteFriendlyUrl?: string;
  exportPath?: string;
};

export type FragmentEditableField = {
  id: string;
  value: string;
};

export type PageFragmentEntry = {
  type: 'fragment' | 'widget';
  fragmentKey?: string;
  fragmentSiteFriendlyUrl?: string;
  fragmentExportPath?: string;
  widgetName?: string;
  portletId?: string;
  configuration?: Record<string, string>;
  editableFields?: FragmentEditableField[];
  contentSummary?: string;
  title?: string;
  heroText?: string;
  navigationItems?: string[];
  cardCount?: number;
  // verbose-only fields
  elementName?: string;
  cssClasses?: string[];
  customCSS?: string;
};

export function collectPageElements(
  pageElement: HeadlessPageElementPayload | null,
  fragmentEntryLinks: Array<Record<string, unknown>>,
  locale: string | null = null,
): PageFragmentEntry[] {
  const result: PageFragmentEntry[] = [];
  collectPageElementsRecursive(pageElement, result, locale);

  for (const entry of result) {
    if (entry.type !== 'widget' || !entry.widgetName) {
      continue;
    }
    const widgetName = entry.widgetName;
    const match = fragmentEntryLinks.find((item) => (firstStringUtil(item.portletId) ?? '').includes(widgetName));
    if (match) {
      entry.portletId = firstStringUtil(match.portletId) ?? '';
    }
  }

  return result;
}

function collectPageElementsRecursive(
  element: HeadlessPageElementPayload | null,
  result: PageFragmentEntry[],
  locale: string | null = null,
): void {
  if (!element) {
    return;
  }
  const type = String(element.type ?? '');
  const elementName = String(element.name ?? '').trim() || undefined;
  const cssClasses = Array.isArray(element.cssClasses)
    ? (element.cssClasses as unknown[]).map((c) => String(c)).filter(Boolean)
    : undefined;
  const customCSS = String(element.customCSS ?? '').trim() || undefined;

  if (type === 'Fragment') {
    const definition = asRecord(element.definition);
    const key = firstStringUtil(asRecord(definition.fragment).key) ?? '';
    if (key) {
      const editableFields = extractFragmentEditableFields(definition.fragmentFields, locale);
      result.push({
        type: 'fragment',
        fragmentKey: key,
        configuration: recordToStringMap(asRecord(definition.fragmentConfig)),
        ...(editableFields.length > 0 ? {editableFields} : {}),
        ...(elementName ? {elementName} : {}),
        ...(cssClasses && cssClasses.length > 0 ? {cssClasses} : {}),
        ...(customCSS ? {customCSS} : {}),
      });
    }
  } else if (type === 'Widget') {
    const widgetInstance = asRecord(asRecord(element.definition).widgetInstance);
    const widgetName = firstStringUtil(widgetInstance.widgetName) ?? '';
    if (widgetName) {
      result.push({
        type: 'widget',
        widgetName,
        configuration: recordToStringMap(asRecord(widgetInstance.widgetConfig)),
        ...(elementName ? {elementName} : {}),
        ...(cssClasses && cssClasses.length > 0 ? {cssClasses} : {}),
        ...(customCSS ? {customCSS} : {}),
      });
    }
  }
  for (const child of asArrayOfRecords(element.pageElements)) {
    collectPageElementsRecursive(child, result, locale);
  }
}

export function summarizeContentFields(contentFields: unknown): ContentFieldSummary[] {
  const result: ContentFieldSummary[] = [];
  appendContentFieldSummary(result, contentFields, []);
  return result;
}

function appendContentFieldSummary(target: ContentFieldSummary[], contentFields: unknown, parentPath: string[]): void {
  if (!Array.isArray(contentFields)) {
    return;
  }
  for (const item of contentFields) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const field = item as Record<string, unknown>;
    const label = firstNonBlank(firstStringUtil(field.label), firstStringUtil(field.name));
    const name = firstStringUtil(field.name) ?? '';
    const type = firstNonBlank(
      firstStringUtil(field.dataType),
      inferContentFieldType(asRecord(field.contentFieldValue)),
    );
    const value = summarizeContentFieldValue(asRecord(field.contentFieldValue));
    if (value !== '') {
      target.push({
        path: [...parentPath, label || name].filter(Boolean).join(' > '),
        label,
        name,
        type,
        value,
      });
    }
    const nextPath = shouldIncludeContentFieldLabelInPath(label, name)
      ? [...parentPath, label || name].filter(Boolean)
      : parentPath;
    appendContentFieldSummary(target, field.nestedContentFields, nextPath);
  }
}

function summarizeContentFieldValue(contentFieldValue: Record<string, unknown>): string {
  const data = firstStringUtil(contentFieldValue.data) ?? '';
  if (data !== '') {
    return data.replace(/\s+/g, ' ').trim();
  }
  if (Object.keys(contentFieldValue).length > 0) {
    return JSON.stringify(contentFieldValue);
  }
  return '';
}

function inferContentFieldType(contentFieldValue: Record<string, unknown>): string {
  if ('image' in contentFieldValue) {
    return 'image';
  }
  if ('document' in contentFieldValue) {
    return 'document';
  }
  if ('data' in contentFieldValue) {
    return 'string';
  }
  return '';
}

function shouldIncludeContentFieldLabelInPath(label: string, name: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === 'grup de camps' || normalized === 'group of fields') {
    return false;
  }
  return !name.trim().toLowerCase().endsWith('fieldset');
}

function extractFragmentEditableFields(fragmentFields: unknown, locale: string | null = null): FragmentEditableField[] {
  if (!Array.isArray(fragmentFields)) {
    return [];
  }
  const result: FragmentEditableField[] = [];
  for (const field of fragmentFields) {
    const f = asRecord(field);
    const id = firstStringUtil(f.id) ?? '';
    if (!id) {
      continue;
    }
    const value = asRecord(f.value);
    const text = asRecord(value.text);
    const i18n = asRecord(text.value_i18n);
    // Prefer the matched locale, then ca_ES, then es_ES, then any available
    // TODO: consider improving locale matching logic if needed in the future
    // Not hardcoded locales
    const textValue = firstNonBlank(
      firstStringUtil(locale ? i18n[locale] : undefined),
      firstStringUtil(i18n['ca_ES']),
      firstStringUtil(i18n['es_ES']),
      firstStringUtil(Object.values(i18n)),
      firstStringUtil(text.value),
    );
    if (textValue) {
      result.push({id, value: textValue.replace(/\s+/g, ' ')});
      continue;
    }
    // Image or document fields
    const image = asRecord(value.image);
    const fragmentImage = asRecord(value.fragmentImage);
    const fragmentImageTitle = asRecord(fragmentImage.title);
    const fragmentImageDescription = asRecord(fragmentImage.description);
    const fragmentImageUrl = asRecord(fragmentImage.url);
    const fragmentImageUrlI18n = asRecord(fragmentImageUrl.value_i18n);
    const imageValue = firstNonBlank(
      firstStringUtil(image.title),
      firstStringUtil(image.description),
      firstStringUtil(image.url),
      firstStringUtil(image.contentURL),
      firstStringUtil(image.src),
      firstStringUtil(image.fileEntryId),
      firstStringUtil(image.classPK),
      firstStringUtil(fragmentImageTitle.value),
      firstStringUtil(fragmentImageDescription.value),
      firstNonBlank(
        firstStringUtil(locale ? fragmentImageUrlI18n[locale] : undefined),
        firstStringUtil(fragmentImageUrlI18n['ca_ES']),
        firstStringUtil(fragmentImageUrlI18n['es_ES']),
        firstStringUtil(Object.values(fragmentImageUrlI18n)),
        firstStringUtil(fragmentImageUrl.value),
      ),
    );
    if (imageValue) {
      result.push({id, value: imageValue});
      continue;
    }
    const document = asRecord(value.document);
    const documentValue = firstNonBlank(firstStringUtil(document.title), firstStringUtil(document.url));
    if (documentValue) {
      result.push({id, value: documentValue});
    }
  }
  return result;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function asArrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function recordToStringMap(value: Record<string, unknown>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeScalarString(item);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export const firstString = firstStringUtil;

export function hasJsonWsException(value: unknown): boolean {
  return Boolean(asRecord(value).exception);
}

/**
 * Assign optional string property to object if value is non-empty.
 * Reduces boilerplate: instead of 4 lines per property, use 1 line.
 */
export function assignOptionalString(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value) {
    target[key] = value;
  }
}

/**
 * Assign optional numeric property to object if value is finite and > 0.
 */
export function assignOptionalNumber(target: Record<string, unknown>, key: string, value: number | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    target[key] = value;
  }
}

/**
 * Assign optional numeric property to object if value is finite.
 */
export function assignOptionalFiniteNumber(
  target: Record<string, unknown>,
  key: string,
  value: number | undefined,
): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value;
  }
}

/**
 * Assign optional boolean property to object if value is boolean.
 */
export function assignOptionalBoolean(target: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === 'boolean') {
    target[key] = value;
  }
}
