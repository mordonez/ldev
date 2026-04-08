import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {setTimeout as delay} from 'node:timers/promises';

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

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function spawnNpm(args, options = {}) {
  return spawn(getNpmCommand(), args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    ...options,
  });
}

async function waitForPreview(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

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

  throw new Error(`Timed out waiting for docs preview at ${url}`);
}

async function getCriticalAssetUrls() {
  const html = await readFile(previewBuildPath, 'utf8');
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

async function waitForCriticalAssets(baseUrl, timeoutMs = 30_000) {
  const assetUrls = await getCriticalAssetUrls();
  const startedAt = Date.now();

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

  throw new Error(`Timed out waiting for docs assets at ${baseUrl}`);
}

async function assertRequiredRoutes(baseUrl) {
  for (const route of requiredCleanUrls) {
    const response = await fetch(new URL(route, baseUrl), {
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Required docs route failed: ${route} returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('text/html')) {
      throw new Error(`Required docs route failed: ${route} returned non-HTML content type "${contentType}"`);
    }
  }
}

async function run() {
  if (!existsSync(previewBuildPath)) {
    throw new Error(`Built docs not found at ${previewBuildPath}. Run "npm run docs:build" first.`);
  }

  const preview = spawnNpm([
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

    await new Promise((resolve, reject) => {
      const checker = spawnNpm([
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

      checker.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Link checking failed with exit code ${code ?? 'unknown'}`));
      });
      checker.on('error', reject);
    });
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
