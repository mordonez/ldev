import {isRecord} from '../../../core/utils/json.js';
import {normalizeScalarString} from '../../../core/utils/text.js';

/**
 * Minimal typed payloads for Liferay JSONWS and headless resource API responses.
 *
 * All fields are optional to accommodate legacy or partial responses.
 * Use the normalizer functions (to*) to safely extract values from raw API data.
 */

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

/** Payload from JSONWS ddm.ddmtemplate/get-templates or get-template. */
export type DdmTemplatePayload = {
  templateId?: string | number;
  templateKey?: string;
  externalReferenceCode?: string;
  nameCurrentValue?: string;
  name?: string;
  classPK?: string | number;
  classNameId?: number;
  script?: string;
  language?: string;
  type?: string;
  mode?: string;
};

/** Payload from JSONWS fragment.fragmentcollection/get-fragment-collections. */
export type FragmentCollectionPayload = {
  fragmentCollectionId?: number;
  fragmentCollectionKey?: string;
  name?: string;
  description?: string;
};

/** Payload from JSONWS fragment.fragmententry/get-fragment-entries. */
export type FragmentEntryPayload = {
  fragmentEntryId?: number;
  fragmentEntryKey?: string;
  name?: string;
  html?: string;
  css?: string;
  js?: string;
  configuration?: string;
  icon?: string;
  type?: number;
};

/** Payload from headless data-engine /data-definitions. */
export type DataDefinitionPayload = {
  id?: string | number;
  dataDefinitionKey?: string;
  name?: string | Record<string, string>;
  description?: string | Record<string, string>;
  dataDefinitionFields?: unknown[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function asStr(v: unknown): string | undefined {
  return normalizeScalarString(v);
}

function asNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Tolerant normalizers
// ---------------------------------------------------------------------------

/**
 * Tolerant parse of a raw JSONWS DDM template object.
 * Returns a typed object with undefined for any missing or non-coercible fields.
 */
export function toDdmTemplatePayload(raw: unknown): DdmTemplatePayload {
  if (!isRecord(raw)) return {};
  return {
    templateId: asStr(raw.templateId),
    templateKey: asStr(raw.templateKey),
    externalReferenceCode: asStr(raw.externalReferenceCode),
    nameCurrentValue: asStr(raw.nameCurrentValue),
    name: asStr(raw.name),
    classPK: asStr(raw.classPK),
    classNameId: asNum(raw.classNameId),
    script: typeof raw.script === 'string' ? raw.script : undefined,
    language: asStr(raw.language),
    type: asStr(raw.type),
    mode: asStr(raw.mode),
  };
}

/**
 * Tolerant parse of a raw JSONWS fragment collection object.
 */
export function toFragmentCollectionPayload(raw: unknown): FragmentCollectionPayload {
  if (!isRecord(raw)) return {};
  return {
    fragmentCollectionId: asNum(raw.fragmentCollectionId),
    fragmentCollectionKey: asStr(raw.fragmentCollectionKey),
    name: asStr(raw.name),
    description: typeof raw.description === 'string' ? raw.description : undefined,
  };
}

/**
 * Tolerant parse of a raw JSONWS fragment entry object.
 * html/css/js preserve empty strings (valid empty content).
 */
export function toFragmentEntryPayload(raw: unknown): FragmentEntryPayload {
  if (!isRecord(raw)) return {};
  return {
    fragmentEntryId: asNum(raw.fragmentEntryId),
    fragmentEntryKey: asStr(raw.fragmentEntryKey),
    name: asStr(raw.name),
    html: typeof raw.html === 'string' ? raw.html : undefined,
    css: typeof raw.css === 'string' ? raw.css : undefined,
    js: typeof raw.js === 'string' ? raw.js : undefined,
    configuration: typeof raw.configuration === 'string' ? raw.configuration : undefined,
    icon: asStr(raw.icon),
    type: asNum(raw.type),
  };
}
