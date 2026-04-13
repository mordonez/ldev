import path from 'node:path';

export function parseComposeFiles(configured: string | undefined): string[] {
  if (!configured || configured.trim() === '') {
    return ['docker-compose.yml'];
  }

  const files = configured
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter((value) => value !== '');

  return [...new Set(files)];
}

export function hasComposeFile(files: string[], expectedName: string): boolean {
  return files.some((file) => path.basename(file) === expectedName);
}

export function addComposeFileIfMissing(files: string[], composeFile: string): void {
  if (!hasComposeFile(files, composeFile)) {
    files.push(composeFile);
  }
}
