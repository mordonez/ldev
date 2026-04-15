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
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function asNum(v: unknown): number | undefined {
  if (v == null) return undefined;
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
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    templateId: asStr(r.templateId),
    templateKey: asStr(r.templateKey),
    externalReferenceCode: asStr(r.externalReferenceCode),
    nameCurrentValue: asStr(r.nameCurrentValue),
    name: asStr(r.name),
    classPK: asStr(r.classPK),
    classNameId: asNum(r.classNameId),
    script: r.script != null ? String(r.script) : undefined,
    language: asStr(r.language),
    type: asStr(r.type),
    mode: asStr(r.mode),
  };
}

/**
 * Tolerant parse of a raw JSONWS fragment collection object.
 */
export function toFragmentCollectionPayload(raw: unknown): FragmentCollectionPayload {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    fragmentCollectionId: asNum(r.fragmentCollectionId),
    fragmentCollectionKey: asStr(r.fragmentCollectionKey),
    name: asStr(r.name),
    description: r.description != null ? String(r.description) : undefined,
  };
}

/**
 * Tolerant parse of a raw JSONWS fragment entry object.
 * html/css/js preserve empty strings (valid empty content).
 */
export function toFragmentEntryPayload(raw: unknown): FragmentEntryPayload {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    fragmentEntryId: asNum(r.fragmentEntryId),
    fragmentEntryKey: asStr(r.fragmentEntryKey),
    name: asStr(r.name),
    html: r.html != null ? String(r.html) : undefined,
    css: r.css != null ? String(r.css) : undefined,
    js: r.js != null ? String(r.js) : undefined,
    configuration: r.configuration != null ? String(r.configuration) : undefined,
    icon: asStr(r.icon),
    type: asNum(r.type),
  };
}
