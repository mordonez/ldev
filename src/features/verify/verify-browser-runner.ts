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
 */
export async function createPlaywrightBrowserRunner(): Promise<BrowserRunner> {
  const playwright = await loadPlaywrightModule();
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
      await page.locator(LIFERAY_LOGIN_SUBMIT_SELECTOR).first().click();
      await page.waitForLoadState('domcontentloaded');
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

async function loadPlaywrightModule(): Promise<typeof PlaywrightModule> {
  try {
    return await import('playwright');
  } catch {
    throw new CliError(
      "Playwright is not installed. 'ldev verify page' drives a real browser and needs it as a local dependency.\n" +
        'Install it once with: npm install --save-dev playwright && npx playwright install chromium',
      {code: 'VERIFY_BROWSER_UNAVAILABLE'},
    );
  }
}
