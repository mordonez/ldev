import path from 'node:path';

import fs from 'fs-extra';

const LOCAL_AI_GITIGNORE_MARKER = '# ldev ai install --local';
const LOCAL_AI_GITIGNORE_ENTRIES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.agents/',
  '.claude/',
  '.cursor/',
  '.gemini/',
  '.windsurf/',
  '.workspace-rules/',
  '.github/instructions/',
  '.github/copilot-instructions.md',
  '.ldev/ai/',
  '.liferay-cli.yml',
];

export async function ensureLocalAiGitignoreEntries(targetDir: string): Promise<string[]> {
  const gitignorePath = path.join(targetDir, '.gitignore');
  const exists = await fs.pathExists(gitignorePath);
  const currentContent = exists ? await fs.readFile(gitignorePath, 'utf8') : '';
  const currentLines = currentContent.split(/\r?\n/);
  const normalizedCurrentEntries = new Set(
    currentLines.map((line) => normalizeGitignoreEntryForComparison(line)).filter((line) => line.length > 0),
  );
  const missingEntries = LOCAL_AI_GITIGNORE_ENTRIES.filter(
    (entry) => !normalizedCurrentEntries.has(normalizeGitignoreEntryForComparison(entry)),
  );

  const lines = currentContent.length > 0 ? [...currentLines] : [];

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  if (lines.length > 0) {
    lines.push('');
  }
  if (!lines.includes(LOCAL_AI_GITIGNORE_MARKER)) {
    lines.push(LOCAL_AI_GITIGNORE_MARKER);
  }
  lines.push(...missingEntries);

  await fs.writeFile(gitignorePath, `${lines.join('\n')}\n`);
  return missingEntries;
}

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

export function normalizeGitignoreEntryForComparison(line: string): string {
  const withoutComment = line.replace(/\s+#.*$/, '').trim();

  if (withoutComment.length === 0 || withoutComment.startsWith('#')) {
    return '';
  }

  return withoutComment.replace(/^\/+/, '');
}
