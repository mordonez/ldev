const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function pickFields(value: unknown, fields: string[]): unknown {
  if (fields.length === 0) return value;
  if (Array.isArray(value)) return value.map((item) => pickFields(item, fields));
  if (typeof value !== 'object' || value === null) return value;

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Group requested fields by head key so each key is projected exactly once;
  // a bare key selects the whole value and subsumes its dotted sub-fields.
  const bareKeys = new Set<string>();
  const nestedByKey = new Map<string, string[]>();

  for (const field of fields) {
    const dot = field.indexOf('.');
    const key = dot === -1 ? field : field.slice(0, dot);
    if (UNSAFE_KEYS.has(key)) continue;
    if (dot === -1) {
      bareKeys.add(key);
    } else {
      const rests = nestedByKey.get(key) ?? [];
      rests.push(field.slice(dot + 1));
      nestedByKey.set(key, rests);
    }
  }

  for (const key of bareKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }

  for (const [key, rests] of nestedByKey) {
    if (bareKeys.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = pickFields(obj[key], rests);
    }
  }

  return result;
}
