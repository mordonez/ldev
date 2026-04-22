import {isRecord} from '../../../core/utils/json.js';
import {normalizeLiferayTemplateScript} from './liferay-resource-template-normalize.js';

export function normalizeLiferayStructurePayload<T>(payload: T): T {
  return normalizeValue(payload, []) as T;
}

function normalizeValue(value: unknown, path: string[]): unknown {
  if (typeof value === 'string') {
    return normalizeLiferayTemplateScript(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, path));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !shouldOmitKey(path, key))
        .map(([key, nestedValue]) => [key, normalizeValue(nestedValue, [...path, key])]),
    );
  }

  return value;
}

function shouldOmitKey(path: string[], key: string): boolean {
  if (path.length === 0) {
    return ROOT_VOLATILE_KEYS.has(key);
  }

  if (path.length === 1 && path[0] === 'defaultDataLayout') {
    return DEFAULT_DATA_LAYOUT_VOLATILE_KEYS.has(key);
  }

  return false;
}

const ROOT_VOLATILE_KEYS = new Set(['id', 'siteId', 'userId', 'dateCreated', 'dateModified', 'externalReferenceCode']);
const DEFAULT_DATA_LAYOUT_VOLATILE_KEYS = new Set([
  'id',
  'siteId',
  'userId',
  'dateCreated',
  'dateModified',
  'dataDefinitionId',
  'dataLayoutKey',
  'externalReferenceCode',
]);
