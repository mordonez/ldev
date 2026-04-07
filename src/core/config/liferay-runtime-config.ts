export function resolveRuntimeStringConfig(options: {
  envValue?: string;
  localProfileValue?: string;
  dockerEnvValue?: string;
  fallbackValue: string;
}): string {
  return (
    firstNonEmptyString(options.envValue, options.localProfileValue, options.dockerEnvValue) ?? options.fallbackValue
  );
}

export function resolveRuntimeNumberConfig(options: {
  envValue?: string;
  localProfileValue?: string;
  dockerEnvValue?: string;
  fallbackValue: number;
}): number {
  return firstPositiveInt(options.envValue, options.localProfileValue, options.dockerEnvValue) ?? options.fallbackValue;
}

function firstNonEmptyString(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

function firstPositiveInt(...values: Array<string | undefined>): number | null {
  for (const value of values) {
    if (value === undefined || value.trim() === '') {
      continue;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}
