import fs from 'node:fs';

export function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

export function upsertEnvFileValues(currentContent: string, values: Record<string, string>): string {
  const lines =
    currentContent === ''
      ? []
      : currentContent.split(/\r?\n/).filter((line, index, array) => {
          return !(index === array.length - 1 && line === '');
        });
  const nextLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      return true;
    }

    const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
    return !(key in values);
  });

  for (const [key, value] of Object.entries(values)) {
    nextLines.push(`${key}=${value}`);
  }

  return nextLines.filter((line, index, array) => !(index === array.length - 1 && line === '')).join('\n');
}
