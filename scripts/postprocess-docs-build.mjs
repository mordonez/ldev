import {mkdir, readdir, stat, copyFile} from 'node:fs/promises';
import path from 'node:path';

const docsDistDir = path.resolve('docs/.vitepress/dist');

async function* walkHtmlFiles(dir) {
  const entries = await readdir(dir, {withFileTypes: true});

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walkHtmlFiles(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      yield entryPath;
    }
  }
}

function shouldCreateCleanUrlDir(filePath) {
  const baseName = path.basename(filePath);

  return baseName !== 'index.html' && baseName !== '404.html';
}

async function ensureCleanUrlCopies() {
  const distStats = await stat(docsDistDir);

  if (!distStats.isDirectory()) {
    throw new Error(`Docs build output is not a directory: ${docsDistDir}`);
  }

  for await (const htmlFile of walkHtmlFiles(docsDistDir)) {
    if (!shouldCreateCleanUrlDir(htmlFile)) {
      continue;
    }

    const relativePath = path.relative(docsDistDir, htmlFile);
    const parsedPath = path.parse(relativePath);
    const targetDir = path.join(docsDistDir, parsedPath.dir, parsedPath.name);
    const targetFile = path.join(targetDir, 'index.html');

    await mkdir(targetDir, {recursive: true});
    await copyFile(htmlFile, targetFile);
  }
}

ensureCleanUrlCopies().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
