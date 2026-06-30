export function pickFields(value: unknown, fields: string[]): unknown {
  if (fields.length === 0) return value;
  if (Array.isArray(value)) return value.map((item) => pickFields(item, fields));
  if (typeof value !== 'object' || value === null) return value;

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    const dot = field.indexOf('.');
    if (dot === -1) {
      if (Object.prototype.hasOwnProperty.call(obj, field)) {
        result[field] = obj[field];
      }
    } else {
      const key = field.slice(0, dot);
      const rest = field.slice(dot + 1);
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const nested = pickFields(obj[key], [rest]);
        const existing = result[key];
        if (
          existing !== undefined &&
          typeof existing === 'object' &&
          !Array.isArray(existing) &&
          nested !== null &&
          typeof nested === 'object' &&
          !Array.isArray(nested)
        ) {
          result[key] = {
            ...(existing as Record<string, unknown>),
            ...(nested as Record<string, unknown>),
          };
        } else {
          result[key] = nested;
        }
      }
    }
  }

  return result;
}
