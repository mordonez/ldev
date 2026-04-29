import {isRecord, type JsonRecord} from '../../../core/utils/json.js';
import {firstNonBlank, firstString as firstStringUtil, normalizeScalarString} from '../../../core/utils/text.js';
import type {HeadlessPageElementPayload} from '../page-layout/liferay-site-page-shared.js';
import {extractFragmentFieldResources, type FragmentEditableField} from './liferay-inventory-page-fragment-fields.js';

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
  taxonomyCategoryBriefs?: TaxonomyCategoryBriefPayload[];
  renderedContents?: RenderedContentPayload[];
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

type ContentField = JsonRecord & {
  name?: unknown;
  label?: unknown;
  dataType?: unknown;
  contentFieldValue?: unknown;
  nestedContentFields?: unknown;
};

type ContentFieldValue = JsonRecord;

export type JournalArticlePayload = JsonRecord;
export type ContentStructurePayload = JsonRecord;
export type FragmentEntryLink = JsonRecord;
export type RenderedContentPayload = JsonRecord;
export type DisplayPageTemplatePayload = JsonRecord;
export type TaxonomyCategoryBriefPayload = JsonRecord;

export type PageFragmentEntry = {
  type: 'fragment' | 'widget';
  fragmentKey?: string;
  fragmentSiteFriendlyUrl?: string;
  fragmentExportPath?: string;
  widgetName?: string;
  portletId?: string;
  configuration?: Record<string, string>;
  editableFields?: FragmentEditableField[];
  mappedTemplateKeys?: string[];
  mappedStructureKeys?: string[];
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
  locale: string | null = null,
): PageFragmentEntry[] {
  const result: PageFragmentEntry[] = [];
  collectPageElementsRecursive(pageElement, result, locale);

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
      const fragmentFields = extractFragmentFieldResources(definition.fragmentFields, locale);
      result.push({
        type: 'fragment',
        fragmentKey: key,
        configuration: recordToStringMap(asRecord(definition.fragmentConfig)),
        ...(fragmentFields.editableFields.length > 0 ? {editableFields: fragmentFields.editableFields} : {}),
        ...(fragmentFields.mappedTemplateKeys.length > 0
          ? {mappedTemplateKeys: fragmentFields.mappedTemplateKeys}
          : {}),
        ...(fragmentFields.mappedStructureKeys.length > 0
          ? {mappedStructureKeys: fragmentFields.mappedStructureKeys}
          : {}),
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
    if (!isRecord(item)) {
      continue;
    }
    const field = item as ContentField;
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

function summarizeContentFieldValue(contentFieldValue: ContentFieldValue): string {
  const data = firstStringUtil(contentFieldValue.data) ?? '';
  if (data !== '') {
    return data.replace(/\s+/g, ' ').trim();
  }
  if (Object.keys(contentFieldValue).length > 0) {
    return JSON.stringify(contentFieldValue);
  }
  return '';
}

function inferContentFieldType(contentFieldValue: ContentFieldValue): string {
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

export function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function asArrayOfRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function recordToStringMap(value: JsonRecord): Record<string, string> | undefined {
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
export function assignOptionalString(target: JsonRecord, key: string, value: string | undefined): void {
  if (value) {
    target[key] = value;
  }
}

/**
 * Assign optional numeric property to object if value is finite and > 0.
 */
export function assignOptionalNumber(target: JsonRecord, key: string, value: number | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    target[key] = value;
  }
}

/**
 * Assign optional numeric property to object if value is finite.
 */
export function assignOptionalFiniteNumber(target: JsonRecord, key: string, value: number | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value;
  }
}

/**
 * Assign optional boolean property to object if value is boolean.
 */
export function assignOptionalBoolean(target: JsonRecord, key: string, value: unknown): void {
  if (typeof value === 'boolean') {
    target[key] = value;
  }
}
