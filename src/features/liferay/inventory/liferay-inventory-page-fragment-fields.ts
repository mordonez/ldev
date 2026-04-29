import {isRecord, type JsonRecord} from '../../../core/utils/json.js';
import {firstNonBlank, firstString as firstStringUtil} from '../../../core/utils/text.js';

export type FragmentEditableField = {
  id: string;
  value: string;
};

export type FragmentFieldResources = {
  editableFields: FragmentEditableField[];
  mappedTemplateKeys: string[];
  mappedStructureKeys: string[];
};

export function extractFragmentFieldResources(
  fragmentFields: unknown,
  locale: string | null = null,
): FragmentFieldResources {
  const mappedResources = extractFragmentMappedResources(fragmentFields);
  return {
    editableFields: extractFragmentEditableFields(fragmentFields, locale),
    mappedTemplateKeys: mappedResources.templateKeys,
    mappedStructureKeys: mappedResources.structureKeys,
  };
}

function extractFragmentEditableFields(fragmentFields: unknown, locale: string | null): FragmentEditableField[] {
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
    const textValue = resolveFragmentTextValue(value, locale);
    if (textValue) {
      result.push({id, value: textValue.replace(/\s+/g, ' ')});
      continue;
    }

    const imageValue = resolveFragmentImageValue(value, locale);
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

function resolveFragmentTextValue(value: JsonRecord, locale: string | null): string {
  const text = asRecord(value.text);
  const i18n = asRecord(text.value_i18n);
  return firstNonBlank(
    firstStringUtil(locale ? i18n[locale] : undefined),
    firstStringUtil(i18n['ca_ES']),
    firstStringUtil(i18n['es_ES']),
    firstStringUtil(Object.values(i18n)),
    firstStringUtil(text.value),
  );
}

function resolveFragmentImageValue(value: JsonRecord, locale: string | null): string {
  const image = asRecord(value.image);
  const fragmentImage = asRecord(value.fragmentImage);
  const fragmentImageTitle = asRecord(fragmentImage.title);
  const fragmentImageDescription = asRecord(fragmentImage.description);
  const fragmentImageUrl = asRecord(fragmentImage.url);
  const fragmentImageUrlI18n = asRecord(fragmentImageUrl.value_i18n);
  return firstNonBlank(
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
}

function extractFragmentMappedResources(fragmentFields: unknown): {templateKeys: string[]; structureKeys: string[]} {
  const templateKeys = new Set<string>();
  const structureKeys = new Set<string>();
  collectMappedResourceKeys(fragmentFields, templateKeys, structureKeys);
  return {templateKeys: [...templateKeys], structureKeys: [...structureKeys]};
}

function collectMappedResourceKeys(value: unknown, templateKeys: Set<string>, structureKeys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMappedResourceKeys(item, templateKeys, structureKeys);
    }
    return;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return;
  }

  const fieldKey = firstStringUtil(record.fieldKey)?.trim();
  if (fieldKey?.startsWith('ddmTemplate_')) {
    const templateKey = fieldKey.slice('ddmTemplate_'.length).trim();
    if (templateKey) {
      templateKeys.add(templateKey);
    }
  }
  if (fieldKey?.startsWith('ddmStructure_')) {
    const structureKey = fieldKey.slice('ddmStructure_'.length).trim();
    if (structureKey) {
      structureKeys.add(structureKey);
    }
  }

  for (const nestedValue of Object.values(record)) {
    collectMappedResourceKeys(nestedValue, templateKeys, structureKeys);
  }
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}
