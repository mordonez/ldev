import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {setTimeout as delay} from 'node:timers/promises';
import {execa} from 'execa';

const previewHost = 'localhost';
const previewPort = 4173 + Math.floor(Math.random() * 1000);
const previewUrl = `http://${previewHost}:${previewPort}/ldev/`;
const previewBuildPath = 'docs/.vitepress/dist/index.html';
const requiredCleanUrls = [
  '/ldev/getting-started/quickstart',
  '/ldev/reference/configuration',
  '/ldev/commands',
  '/ldev/troubleshooting',
];

/**
 * @param {string[]} args
 */
function runNpm(args) {
  return execa('npm', args, {
    cwd: process.cwd(),
    env: process.env,
    reject: false,
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

/**
 * @param {string | URL} url
 * @param {number} [timeoutMs]
 */
async function waitForPreview(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  const urlText = String(url);

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Preview is not ready yet.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for docs preview at ${urlText}`);
}

async function getCriticalAssetUrls() {
  const html = await readFile(previewBuildPath, 'utf8');
  /** @type {string[]} */
  const assetUrls = [];
  const appScriptMatch = html.match(/<script type="module" src="([^"]+)"/);

  if (appScriptMatch?.[1]) {
    assetUrls.push(appScriptMatch[1]);
  }

  for (const match of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) {
    assetUrls.push(match[1]);
  }

  return assetUrls;
}

/**
 * @param {string | URL} baseUrl
 * @param {number} [timeoutMs]
 */
async function waitForCriticalAssets(baseUrl, timeoutMs = 30_000) {
  const assetUrls = await getCriticalAssetUrls();
  const startedAt = Date.now();
  const baseUrlText = String(baseUrl);

  while (Date.now() - startedAt < timeoutMs) {
    let allReady = true;

    for (const assetUrl of assetUrls) {
      try {
        const response = await fetch(new URL(assetUrl, baseUrl));

        if (!response.ok) {
          allReady = false;
          break;
        }
      } catch {
        allReady = false;
        break;
      }
    }

    if (allReady) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for docs assets at ${baseUrlText}`);
}

/**
 * @param {string | URL} baseUrl
 */
async function assertRequiredRoutes(baseUrl) {
  const baseUrlText = String(baseUrl);

  for (const route of requiredCleanUrls) {
    const response = await fetch(new URL(route, baseUrl), {
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Required docs route failed: ${route} returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('text/html')) {
      throw new Error(
        `Required docs route failed: ${route} from ${baseUrlText} returned non-HTML content type "${contentType}"`,
      );
    }
  }
}

async function run() {
  if (!existsSync(previewBuildPath)) {
    throw new Error(`Built docs not found at ${previewBuildPath}. Run "npm run docs:build" first.`);
  }

  const preview = runNpm([
    'exec',
    '--',
    'vitepress',
    'preview',
    'docs',
    '--host',
    previewHost,
    '--port',
    String(previewPort),
  ]);

  try {
    await waitForPreview(previewUrl);
    await waitForCriticalAssets(previewUrl);
    await assertRequiredRoutes(previewUrl);

    const checker = await runNpm([
      'exec',
      '--',
      'linkinator',
      previewUrl,
      '--recurse',
      '--check-fragments',
      '--check-css',
      '--timeout',
      '5000',
      '--skip',
      '^mailto:',
      '--skip',
      '^tel:',
      '--skip',
      '^javascript:',
      '--skip',
      `^https?://(?!${previewHost}:${previewPort}/ldev/)`,
    ]);

    if (checker.exitCode !== 0) {
      throw new Error(`Link checking failed with exit code ${checker.exitCode ?? 'unknown'}`);
    }
  } finally {
    preview.kill('SIGTERM');
    await delay(250);

    if (!preview.killed) {
      preview.kill('SIGKILL');
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
