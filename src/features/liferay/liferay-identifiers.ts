/**
 * Unified identifier matching for Liferay resource lookups.
 *
 * Provides single-source-of-truth predicates and normalizers for matching
 * templates, ADTs, and inventory items by id, key, name, or ERC.
 *
 * Precedence order (highest → lowest):
 *   DDM template: templateId | templateKey | externalReferenceCode | nameCurrentValue | name
 *   ADT row:      templateId | ddmTemplate_<id> | templateKey | displayName | adtName
 *   Inventory:    id | externalReferenceCode | name
 *   ADT input:    --id > --display-style (strips ddmTemplate_) > --key > --name
 */

import {LiferayErrors} from './errors/index.js';
import type {DdmTemplatePayload} from './portal/template-queries.js';

// ---------------------------------------------------------------------------
// DDM Template matching
// ---------------------------------------------------------------------------

/**
 * Matches a DDM template item (from JSONWS `listDdmTemplates`) against an identifier.
 * Fields checked: templateId, templateKey, externalReferenceCode, nameCurrentValue, name.
 */
export function matchesDdmTemplate(item: DdmTemplatePayload, identifier: string): boolean {
  return (
    identifier === String(item.templateId ?? '') ||
    identifier === String(item.templateKey ?? '') ||
    identifier === String(item.externalReferenceCode ?? '') ||
    identifier === String(item.nameCurrentValue ?? '') ||
    identifier === String(item.name ?? '')
  );
}

// ---------------------------------------------------------------------------
// ADT row matching
// ---------------------------------------------------------------------------

export type AdtRowShape = {
  templateId: number | string;
  templateKey: string;
  displayName: string;
  adtName: string;
};

/**
 * Matches an ADT row against an identifier.
 * Fields checked: templateId (as string), ddmTemplate_<templateId>, templateKey, displayName, adtName.
 */
export function matchesAdtRow(item: AdtRowShape, identifier: string): boolean {
  const templateId = String(item.templateId);
  return (
    identifier === templateId ||
    identifier === `ddmTemplate_${templateId}` ||
    identifier === item.templateKey ||
    identifier === item.displayName ||
    identifier === item.adtName
  );
}

// ---------------------------------------------------------------------------
// Inventory template matching (headless-delivery /content-templates)
// ---------------------------------------------------------------------------

export type InventoryTemplateShape = {
  id: string;
  externalReferenceCode?: string;
  name?: string;
};

/**
 * Matches an inventory template item (from headless-delivery `/content-templates`)
 * against an identifier.
 * Fields checked: id, externalReferenceCode, name.
 */
export function matchesInventoryTemplate(item: InventoryTemplateShape, identifier: string): boolean {
  return identifier === item.id || identifier === item.externalReferenceCode || identifier === item.name;
}

// ---------------------------------------------------------------------------
// ADT identifier normalization
// ---------------------------------------------------------------------------

export type AdtIdentifierOptions = {
  displayStyle?: string;
  id?: string;
  key?: string;
  name?: string;
};

/**
 * Normalizes multi-field ADT command input to a single canonical identifier string.
 * Precedence: id > displayStyle (strips `ddmTemplate_` prefix) > key > name.
 * Throws if no usable value is found.
 */
export function normalizeAdtIdentifier(options: AdtIdentifierOptions): string {
  if (options.id?.trim()) {
    return options.id.trim();
  }
  if (options.displayStyle?.trim()) {
    const trimmed = options.displayStyle.trim();
    return trimmed.startsWith('ddmTemplate_') ? trimmed.slice('ddmTemplate_'.length) : trimmed;
  }
  if (options.key?.trim()) {
    return options.key.trim();
  }
  if (options.name?.trim()) {
    return options.name.trim();
  }

  throw LiferayErrors.resourceError('adt requires --display-style, --id, --key, or --name');
}
