import fs from 'node:fs/promises';
import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import type {ProjectContext} from '../../core/config/project-context.js';
import {CliError} from '../../core/errors.js';
import type {PageEvidence} from '../liferay/inventory/liferay-inventory-evidence-contract.js';
import {extractPageEvidence} from '../liferay/inventory/liferay-inventory-page-evidence.js';
import {runLiferayInventoryPage} from '../liferay/inventory/liferay-inventory-page.js';
import type {BrowserLoginCredentials, BrowserRunner} from './browser-runner-types.js';
import {createPlaywrightBrowserRunner} from './verify-browser-runner.js';
import {evaluateDomSanity} from './verify-page-dom-checks.js';
import type {
  VerifyDomSanityResult,
  VerifyLoginResult,
  VerifyNavigationResult,
  VerifyConsoleErrorsResult,
  VerifyPageReport,
  VerifyResourceCatalogResult,
  VerifyScreenshotResult,
} from './verify-page-types.js';
import {
  collectLocalResourceCatalog,
  diffEvidenceAgainstCatalog,
  type LocalResourceCatalog,
} from './verify-resource-catalog.js';

export type VerifyPageOptions = {
  /** Friendly URL path (e.g. /web/guest/home) or a full http(s) URL. */
  url: string;
  credentials: BrowserLoginCredentials;
  screenshotPath?: string;
  skipLogin?: boolean;
};

export type VerifyPageDependencies = {
  createRunner?: () => Promise<BrowserRunner> | BrowserRunner;
  fetchPageEvidence?: (config: AppConfig, friendlyPath: string) => Promise<PageEvidence[]>;
  resolveLocalCatalog?: (project: ProjectContext) => LocalResourceCatalog;
};

export type VerifyTarget = {
  fullUrl: string;
  friendlyPath: string;
};

export function resolveVerifyTarget(portalUrl: string, urlOption: string): VerifyTarget {
  const trimmed = urlOption.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    return {fullUrl: trimmed, friendlyPath: `${parsed.pathname}${parsed.search}`};
  }

  const friendlyPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return {fullUrl: `${portalUrl.replace(/\/+$/, '')}${friendlyPath}`, friendlyPath};
}

export async function runVerifyPage(
  project: ProjectContext,
  options: VerifyPageOptions,
  dependencies?: VerifyPageDependencies,
): Promise<VerifyPageReport> {
  const portalUrl = project.env.portalUrl;
  if (!portalUrl) {
    throw new CliError(
      'Cannot resolve a portal URL for this project. Configure liferay.url, run inside a repo, or pass a full --url.',
      {code: 'VERIFY_PORTAL_URL_MISSING'},
    );
  }

  const target = resolveVerifyTarget(portalUrl, options.url);
  const screenshotPath = options.screenshotPath ?? defaultScreenshotPath(project.cwd, target.friendlyPath);
  const createRunner = dependencies?.createRunner ?? createPlaywrightBrowserRunner;

  let login: VerifyLoginResult = options.skipLogin
    ? {status: 'skipped', detail: 'Login skipped (--skip-login).'}
    : {status: 'fail', detail: 'Login was not attempted.'};
  let consoleErrorsResult: VerifyConsoleErrorsResult = {status: 'skipped', errors: []};
  let screenshot: VerifyScreenshotResult = {status: 'skipped', path: null, detail: 'Screenshot was not attempted.'};
  let domSanity: VerifyDomSanityResult = {status: 'skipped', checks: []};
  let navigation: VerifyNavigationResult;

  const runner = await createRunner();
  try {
    if (!options.skipLogin) {
      try {
        const result = await runner.login(`${portalUrl.replace(/\/+$/, '')}/c/portal/login`, options.credentials);
        login = {
          status: 'pass',
          detail: `Logged in as ${options.credentials.email}; landed on ${result.url}.`,
        };
      } catch (error) {
        login = {status: 'fail', detail: `Login failed: ${errorMessage(error)}`};
      }
    }

    try {
      const result = await runner.open(target.fullUrl);
      navigation = {
        status: 'pass',
        url: result.url,
        title: result.title,
        httpStatus: result.status,
        detail: `Navigated to ${result.url} (status ${result.status ?? 'n/a'}).`,
      };
    } catch (error) {
      navigation = {
        status: 'fail',
        url: target.fullUrl,
        title: null,
        httpStatus: null,
        detail: `Navigation failed: ${errorMessage(error)}`,
      };
    }

    if (navigation.status === 'pass') {
      try {
        const errors = await runner.getConsoleErrors();
        consoleErrorsResult = {status: errors.length === 0 ? 'pass' : 'fail', errors};
      } catch (error) {
        consoleErrorsResult = {status: 'fail', errors: [errorMessage(error)]};
      }

      try {
        await fs.mkdir(path.dirname(screenshotPath), {recursive: true});
        await runner.captureScreenshot(screenshotPath);
        screenshot = {status: 'pass', path: screenshotPath, detail: `Screenshot saved to ${screenshotPath}.`};
      } catch (error) {
        screenshot = {status: 'fail', path: null, detail: `Screenshot failed: ${errorMessage(error)}`};
      }

      try {
        const snapshot = await runner.getDomSnapshot();
        domSanity = evaluateDomSanity(snapshot);
      } catch (error) {
        domSanity = {
          status: 'fail',
          checks: [{id: 'dom-snapshot', status: 'fail', detail: `DOM snapshot failed: ${errorMessage(error)}`}],
        };
      }
    }
  } finally {
    await runner.close().catch(() => undefined);
  }

  const resourceCatalog = await resolveResourceCatalogResult(project, target.friendlyPath, dependencies);

  const ok = [
    login.status,
    navigation.status,
    consoleErrorsResult.status,
    screenshot.status,
    domSanity.status,
    resourceCatalog.status,
  ].every((status) => status !== 'fail');

  return {
    ok,
    url: target.fullUrl,
    login,
    navigation,
    consoleErrors: consoleErrorsResult,
    screenshot,
    domSanity,
    resourceCatalog,
  };
}

async function resolveResourceCatalogResult(
  project: ProjectContext,
  friendlyPath: string,
  dependencies?: VerifyPageDependencies,
): Promise<VerifyResourceCatalogResult> {
  const fetchPageEvidence = dependencies?.fetchPageEvidence ?? defaultFetchPageEvidence;
  const resolveLocalCatalog = dependencies?.resolveLocalCatalog ?? collectLocalResourceCatalog;

  try {
    const evidence = await fetchPageEvidence(project.config, friendlyPath);
    const catalog = resolveLocalCatalog(project);
    return diffEvidenceAgainstCatalog(evidence, catalog);
  } catch (error) {
    return {
      status: 'skipped',
      detail: `Resource catalog comparison skipped: ${errorMessage(error)}`,
      diffs: [],
    };
  }
}

async function defaultFetchPageEvidence(config: AppConfig, friendlyPath: string): Promise<PageEvidence[]> {
  const pageResult = await runLiferayInventoryPage(config, {url: friendlyPath});
  return extractPageEvidence(pageResult);
}

function defaultScreenshotPath(cwd: string, friendlyPath: string): string {
  const slug =
    friendlyPath
      .replace(/^\/+/, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'home';
  return path.join(cwd, '.tmp', 'verify', `${slug}-${Date.now()}.png`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
