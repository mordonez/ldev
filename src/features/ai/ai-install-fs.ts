import path from 'node:path';

import fs from 'fs-extra';

export async function copyAiTemplatePath(
  source: string,
  destination: string,
  options: {overwrite?: boolean} = {},
): Promise<void> {
  if ((await fs.pathExists(destination)) && options.overwrite === false) {
    return;
  }

  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await copyAiTemplateDirectory(source, destination, options);
    return;
  }

  await fs.ensureDir(path.dirname(destination));
  const buffer = await fs.readFile(source);
  if (isProbablyBinary(buffer)) {
    await fs.copy(source, destination, {overwrite: options.overwrite ?? true});
    return;
  }

  await fs.writeFile(destination, normalizeTextLineEndings(buffer.toString('utf8')));
  await fs.chmod(destination, stat.mode);
}

export async function copyAiTemplateDirectory(
  sourceDir: string,
  destinationDir: string,
  options: {overwrite?: boolean},
): Promise<void> {
  await fs.ensureDir(destinationDir);
  const entries = await fs.readdir(sourceDir, {withFileTypes: true});

  for (const entry of entries) {
    await copyAiTemplatePath(path.join(sourceDir, entry.name), path.join(destinationDir, entry.name), options);
  }
}

export async function writeTextFileLf(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, normalizeTextLineEndings(content));
}

export function normalizeTextLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

export function isProbablyBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}
