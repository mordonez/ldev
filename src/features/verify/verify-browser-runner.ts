import {createRequire} from 'node:module';

import {CliError} from '../../core/errors.js';
import type * as PlaywrightModule from 'playwright';
import type {Browser, ConsoleMessage, Page} from 'playwright';
import type {
  BrowserDomSnapshot,
  BrowserLoginCredentials,
  BrowserNavigationResult,
  BrowserRunner,
} from './browser-runner-types.js';

const LIFERAY_LOGIN_EMAIL_SELECTOR = '#_com_liferay_login_web_portlet_LoginPortlet_login';
const LIFERAY_LOGIN_PASSWORD_SELECTOR = '#_com_liferay_login_web_portlet_LoginPortlet_password';
const LIFERAY_LOGIN_SUBMIT_SELECTOR = 'button[type=submit]';

/**
 * `playwright` is intentionally NOT a package.json dependency.
 *
 * Rationale: ldev is a globally-installed CLI. Bundling Playwright (and its
 * browser binaries) would force every install to download Chromium even for
 * users who never run `ldev verify page`. Instead we treat it as a runtime-
 * detected, optionally-installed capability: `doctor` already reports on
 * `playwright-cli` in the same spirit. Users who want `verify page` install
 * `playwright` themselves once; everyone else pays no cost.
 *
 * Because ldev runs from its own global install location, a bare
 * `import('playwright')` would resolve node_modules relative to *that*
 * location, not the Liferay project the user installed playwright into.
 * `cwd` (the project directory) is threaded through so resolution is rooted
 * where the user actually ran `npm install --save-dev playwright`.
 */
export async function createPlaywrightBrowserRunner(cwd: string): Promise<BrowserRunner> {
  const playwright = loadPlaywrightModule(cwd);
  const browser = await playwright.chromium.launch({headless: true});
  const page = await browser.newPage();
  const consoleErrors: string[] = [];

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  return {
    async login(loginUrl, credentials: BrowserLoginCredentials): Promise<BrowserNavigationResult> {
      await page.goto(loginUrl, {waitUntil: 'domcontentloaded'});
      await page.locator(LIFERAY_LOGIN_EMAIL_SELECTOR).fill(credentials.email);
      await page.locator(LIFERAY_LOGIN_PASSWORD_SELECTOR).fill(credentials.password);
      // waitForLoadState('domcontentloaded') right after click() is unreliable here: if that
      // load state is already satisfied on the pre-click page, it resolves immediately instead
      // of waiting for the login form's own navigation, so callers would race the next
      // page.goto() against Liferay's still in-flight post-login redirect (net::ERR_ABORTED).
      // Pairing the click with waitForNavigation closes that window.
      await Promise.all([
        page.waitForNavigation({waitUntil: 'domcontentloaded'}),
        page.locator(LIFERAY_LOGIN_SUBMIT_SELECTOR).first().click(),
      ]);
      return readNavigationResult(page, null);
    },

    async open(url): Promise<BrowserNavigationResult> {
      const response = await page.goto(url, {waitUntil: 'domcontentloaded'});
      return readNavigationResult(page, response ? response.status() : null);
    },

    getConsoleErrors(): Promise<string[]> {
      return Promise.resolve([...consoleErrors]);
    },

    async captureScreenshot(path): Promise<void> {
      await page.screenshot({path, fullPage: true});
    },

    getDomSnapshot(): Promise<BrowserDomSnapshot> {
      return page.evaluate(() => ({
        title: document.title,
        bodyTextLength: document.body?.innerText.trim().length ?? 0,
        headingCount: document.querySelectorAll('h1, h2, h3').length,
        hasVisibleErrorBanner: Boolean(
          document.querySelector('.alert-danger, .portlet-msg-error, [data-testid="error-boundary"]'),
        ),
      }));
    },

    async close(): Promise<void> {
      await closeQuietly(page);
      await closeBrowserQuietly(browser);
    },
  };
}

async function readNavigationResult(page: Page, status: number | null): Promise<BrowserNavigationResult> {
  return {
    url: page.url(),
    title: await page.title(),
    status,
  };
}

async function closeQuietly(page: Page): Promise<void> {
  try {
    await page.close();
  } catch {
    // Page may already be closed (e.g. navigation crashed it); nothing else to do.
  }
}

async function closeBrowserQuietly(browser: Browser): Promise<void> {
  try {
    await browser.close();
  } catch {
    // Browser may already be closed; nothing else to do.
  }
}

function loadPlaywrightModule(cwd: string): typeof PlaywrightModule {
  try {
    const require = createRequire(import.meta.url);
    const resolvedEntry = require.resolve('playwright', {paths: [cwd]});
    // A plain CJS require (not a dynamic import) here: playwright's entry point
    // re-exports a runtime object via `module.exports = require(...).inprocess.playwright`,
    // a pattern cjs-module-lexer can't follow, so ESM interop would only expose it
    // as `.default` and leave `.chromium` undefined on the namespace object.
    return require(resolvedEntry) as typeof PlaywrightModule;
  } catch {
    throw new CliError(
      "Playwright is not installed. 'ldev verify page' drives a real browser and needs it as a local dependency.\n" +
        'Install it once with: npm install --save-dev playwright && npx playwright install chromium',
      {code: 'VERIFY_BROWSER_UNAVAILABLE'},
    );
  }
}
