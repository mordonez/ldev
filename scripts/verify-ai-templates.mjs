import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const posix = path.posix;

const bootstrapLiteral = 'ldev ai bootstrap --intent=develop --cache=60 --json';
const bootstrapFiles = [
  'templates/ai/install/AGENTS.md',
  'templates/ai/install/AGENTS.workspace.md',
  'templates/ai/project/.cursorrules',
  'templates/ai/project/.gemini/GEMINI.md',
  'templates/ai/project/.github/copilot-instructions.md',
];

const forbiddenLiterals = [
  'env.portalUrl',
  'liferay.oauth2Configured',
  '/tmp/_issue_brief.md',
  '/tmp/_solution_plan.md',
];

const skillRoots = ['templates/ai/skills', 'templates/ai/project/skills'];

async function walk(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const entries = await readdir(absoluteDir, {withFileTypes: true});
  /** @type {string[]} */
  const files = [];

  for (const entry of entries) {
    const entryRelativePath = posix.join(relativeDir.replaceAll('\\', '/'), entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(entryRelativePath)));
      continue;
    }

    files.push(entryRelativePath);
  }

  return files;
}

function mapSourceToInstalled(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const parts = normalized.split('/');

  if (parts[0] !== 'templates' || parts[1] !== 'ai') {
    return null;
  }

  if (parts[2] === 'skills' && parts.length >= 5) {
    return posix.join('.agents', 'skills', parts[3], ...parts.slice(4));
  }

  if (parts[2] === 'project' && parts[3] === 'skills' && parts.length >= 6) {
    return posix.join('.agents', 'skills', `project-${parts[4]}`, ...parts.slice(5));
  }

  return null;
}

function extractInlineRelativePaths(content) {
  const matches = content.matchAll(/`((?:\.\.\/|\.\/|references\/)[^`\s]+)`/g);
  /** @type {string[]} */
  const references = [];

  for (const match of matches) {
    const candidate = match[1];

    if (!candidate.includes('/')) {
      continue;
    }

    references.push(candidate);
  }

  return references;
}

async function verifyBootstrapFiles() {
  let hasFailures = false;

  for (const relativePath of bootstrapFiles) {
    const content = await readFile(path.join(repoRoot, relativePath), 'utf8');

    if (!content.includes(bootstrapLiteral)) {
      console.error(`✗ Missing bootstrap literal in ${relativePath}`);
      hasFailures = true;
      continue;
    }

    console.log(`✓ Bootstrap literal present in ${relativePath}`);
  }

  return !hasFailures;
}

async function verifyForbiddenLiterals() {
  const aiFiles = await walk('templates/ai');
  let hasFailures = false;

  for (const relativePath of aiFiles) {
    const content = await readFile(path.join(repoRoot, relativePath), 'utf8');

    for (const forbiddenLiteral of forbiddenLiterals) {
      if (!content.includes(forbiddenLiteral)) {
        continue;
      }

      console.error(`✗ Forbidden literal "${forbiddenLiteral}" found in ${relativePath}`);
      hasFailures = true;
    }
  }

  if (!hasFailures) {
    console.log('✓ No forbidden AI template literals found');
  }

  return !hasFailures;
}

async function verifyInstalledRelativePaths() {
  const sourceFiles = (await Promise.all(skillRoots.map((root) => walk(root)))).flat();
  const installedFiles = new Set(
    sourceFiles.map(mapSourceToInstalled).filter((value) => value !== null),
  );

  let hasFailures = false;

  for (const relativePath of sourceFiles) {
    if (!relativePath.endsWith('.md')) {
      continue;
    }

    const installedSourcePath = mapSourceToInstalled(relativePath);

    if (!installedSourcePath) {
      continue;
    }

    const content = await readFile(path.join(repoRoot, relativePath), 'utf8');
    const references = extractInlineRelativePaths(content);

    for (const reference of references) {
      const resolvedInstalledPath = posix.normalize(
        posix.join(posix.dirname(installedSourcePath), reference),
      );

      if (installedFiles.has(resolvedInstalledPath)) {
        continue;
      }

      console.error(
        `✗ Broken installed relative reference in ${relativePath}: ${reference} -> ${resolvedInstalledPath}`,
      );
      hasFailures = true;
    }
  }

  if (!hasFailures) {
    console.log('✓ Installed relative references resolve correctly for skill markdown files');
  }

  return !hasFailures;
}

async function main() {
  console.log('Verifying AI templates...\n');

  const checks = await Promise.all([
    verifyBootstrapFiles(),
    verifyForbiddenLiterals(),
    verifyInstalledRelativePaths(),
  ]);

  if (checks.every(Boolean)) {
    console.log('\nAI template verification passed');
    return;
  }

  console.error('\nAI template verification failed');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});