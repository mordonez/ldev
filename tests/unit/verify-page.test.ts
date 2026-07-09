import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test, vi} from 'vitest';

import {resolveProjectContext, type ProjectContext} from '../../src/core/config/project-context.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';
import {
  resolveVerifyTarget,
  runVerifyPage,
  type VerifyPageDependencies,
} from '../../src/features/verify/verify-page.js';
import type {
  BrowserDomSnapshot,
  BrowserLoginCredentials,
  BrowserNavigationResult,
  BrowserRunner,
} from '../../src/features/verify/browser-runner-types.js';
import type {PageEvidence} from '../../src/features/liferay/inventory/liferay-inventory-evidence-contract.js';

const HEALTHY_SNAPSHOT: BrowserDomSnapshot = {
  title: 'Guest Home',
  bodyTextLength: 500,
  headingCount: 2,
  hasVisibleErrorBanner: false,
};

type FakeRunnerOverrides = Partial<{
  login: (loginUrl: string, credentials: BrowserLoginCredentials) => Promise<BrowserNavigationResult>;
  open: (url: string) => Promise<BrowserNavigationResult>;
  getConsoleErrors: () => Promise<string[]>;
  captureScreenshot: (path: string) => Promise<void>;
  getDomSnapshot: () => Promise<BrowserDomSnapshot>;
}>;

function createFakeRunner(overrides?: FakeRunnerOverrides): {runner: BrowserRunner; calls: string[]} {
  const calls: string[] = [];
  const close = vi.fn(() => {
    calls.push('close');
    return Promise.resolve();
  });

  const runner: BrowserRunner = {
    login:
      overrides?.login ??
      ((loginUrl, credentials) => {
        calls.push(`login:${loginUrl}:${credentials.email}`);
        return Promise.resolve({url: `${loginUrl}/../home`, title: 'Home', status: 200});
      }),
    open:
      overrides?.open ??
      ((url) => {
        calls.push(`open:${url}`);
        return Promise.resolve({url, title: 'Guest Home', status: 200});
      }),
    getConsoleErrors: overrides?.getConsoleErrors ?? (() => Promise.resolve([])),
    captureScreenshot:
      overrides?.captureScreenshot ??
      ((screenshotPath) => {
        calls.push(`screenshot:${screenshotPath}`);
        return Promise.resolve();
      }),
    getDomSnapshot: overrides?.getDomSnapshot ?? (() => Promise.resolve(HEALTHY_SNAPSHOT)),
    close,
  };

  return {runner, calls};
}

function createProject(): ProjectContext {
  const repoRoot = createTempRepo();
  fs.writeFileSync(path.join(repoRoot, 'docker', '.env'), ['BIND_IP=127.0.0.1', 'LIFERAY_HTTP_PORT=8080'].join('\n'));
  return resolveProjectContext({cwd: repoRoot});
}

function noEvidenceDependencies(): VerifyPageDependencies {
  return {
    fetchPageEvidence: () => Promise.resolve([]),
  };
}

describe('resolveVerifyTarget', () => {
  test('joins the portal URL with a relative friendly URL', () => {
    const target = resolveVerifyTarget('http://127.0.0.1:8080', '/web/guest/home');

    expect(target).toEqual({fullUrl: 'http://127.0.0.1:8080/web/guest/home', friendlyPath: '/web/guest/home'});
  });

  test('adds a leading slash when missing', () => {
    const target = resolveVerifyTarget('http://127.0.0.1:8080', 'web/guest/home');

    expect(target.fullUrl).toBe('http://127.0.0.1:8080/web/guest/home');
  });

  test('passes through a full URL and extracts its path for evidence lookups', () => {
    const target = resolveVerifyTarget('http://127.0.0.1:8080', 'https://example.com/web/guest/home?x=1');

    expect(target.fullUrl).toBe('https://example.com/web/guest/home?x=1');
    expect(target.friendlyPath).toBe('/web/guest/home?x=1');
  });
});

describe('runVerifyPage', () => {
  test('reports an overall pass when every step succeeds', async () => {
    const project = createProject();
    const {runner, calls} = createFakeRunner();

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.ok).toBe(true);
    expect(report.login.status).toBe('pass');
    expect(report.navigation.status).toBe('pass');
    expect(report.consoleErrors).toEqual({status: 'pass', errors: []});
    expect(report.screenshot.status).toBe('pass');
    expect(report.domSanity.status).toBe('pass');
    expect(report.resourceCatalog.status).toBe('skipped');
    expect(calls[0]).toMatch(/^login:/);
    expect(calls[1]).toBe('open:http://localhost:8080/web/guest/home');
    expect(calls).toContain('close');
  });

  test('skips login when --skip-login is set', async () => {
    const project = createProject();
    const {runner, calls} = createFakeRunner();

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}, skipLogin: true},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.login).toEqual({status: 'skipped', detail: 'Login skipped (--skip-login).'});
    expect(calls.some((call) => call.startsWith('login:'))).toBe(false);
    expect(report.navigation.status).toBe('pass');
  });

  test('marks the report as failed and still navigates when login throws', async () => {
    const project = createProject();
    const {runner} = createFakeRunner({
      login: () => Promise.reject(new Error('invalid credentials')),
    });

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'bad@liferay.com', password: 'wrong'}},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.login.status).toBe('fail');
    expect(report.login.detail).toContain('invalid credentials');
    expect(report.navigation.status).toBe('pass');
    expect(report.ok).toBe(false);
  });

  test('skips console/screenshot/dom checks and fails overall when navigation throws', async () => {
    const project = createProject();
    const {runner} = createFakeRunner({
      open: () => Promise.reject(new Error('net::ERR_CONNECTION_REFUSED')),
    });

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.navigation.status).toBe('fail');
    expect(report.consoleErrors.status).toBe('skipped');
    expect(report.screenshot.status).toBe('skipped');
    expect(report.domSanity.status).toBe('skipped');
    expect(report.ok).toBe(false);
  });

  test('fails overall when console errors are captured', async () => {
    const project = createProject();
    const {runner} = createFakeRunner({
      getConsoleErrors: () => Promise.resolve(['TypeError: something is not a function']),
    });

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.consoleErrors).toEqual({status: 'fail', errors: ['TypeError: something is not a function']});
    expect(report.ok).toBe(false);
  });

  test('fails overall when the DOM sanity checks detect a visible error banner', async () => {
    const project = createProject();
    const {runner} = createFakeRunner({
      getDomSnapshot: () => Promise.resolve({...HEALTHY_SNAPSHOT, hasVisibleErrorBanner: true}),
    });

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.domSanity.status).toBe('fail');
    expect(report.ok).toBe(false);
  });

  test('always closes the runner even when a step throws', async () => {
    const project = createProject();
    const {runner, calls} = createFakeRunner({
      getDomSnapshot: () => Promise.reject(new Error('page crashed')),
    });

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.domSanity.status).toBe('fail');
    expect(calls).toContain('close');
  });

  test('writes the screenshot under the project cwd by default', async () => {
    const project = createProject();
    const {runner} = createFakeRunner();

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.screenshot.path).toMatch(/\.tmp[\\/]verify[\\/]web-guest-home-\d+\.png$/);
    expect(fs.existsSync(path.dirname(report.screenshot.path ?? ''))).toBe(true);
  });

  test('honors an explicit screenshot path', async () => {
    const project = createProject();
    const {runner} = createFakeRunner();
    const screenshotPath = path.join(project.cwd, 'custom', 'shot.png');

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}, screenshotPath},
      {createRunner: () => runner, ...noEvidenceDependencies()},
    );

    expect(report.screenshot.path).toBe(screenshotPath);
  });

  test('reports a resource catalog diff when rendered evidence is missing locally', async () => {
    const project = createProject();
    fs.mkdirSync(path.join(project.cwd, 'liferay', 'resources', 'journal', 'structures'), {recursive: true});
    fs.writeFileSync(path.join(project.cwd, 'liferay', 'resources', 'journal', 'structures', 'article.json'), '{}');
    const {runner} = createFakeRunner();
    const evidence: PageEvidence[] = [
      {
        resourceType: 'structure',
        key: 'missing-structure',
        kind: 'contentStructure',
        detail: 'structure missing-structure',
        source: 'contentStructure',
      },
    ];

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, fetchPageEvidence: () => Promise.resolve(evidence)},
    );

    expect(report.resourceCatalog.status).toBe('fail');
    expect(report.resourceCatalog.diffs).toEqual([
      expect.objectContaining({resourceType: 'structure', key: 'missing-structure'}),
    ]);
    expect(report.ok).toBe(false);
  });

  test('skips the resource catalog step when evidence cannot be fetched', async () => {
    const project = createProject();
    const {runner} = createFakeRunner();

    const report = await runVerifyPage(
      project,
      {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
      {createRunner: () => runner, fetchPageEvidence: () => Promise.reject(new Error('offline'))},
    );

    expect(report.resourceCatalog.status).toBe('skipped');
    expect(report.resourceCatalog.detail).toContain('offline');
    expect(report.ok).toBe(true);
  });

  test('throws a clear error when no portal URL can be resolved', async () => {
    const project = createProject();
    const projectWithoutPortalUrl: ProjectContext = {...project, env: {...project.env, portalUrl: null}};
    const {runner} = createFakeRunner();

    await expect(
      runVerifyPage(
        projectWithoutPortalUrl,
        {url: '/web/guest/home', credentials: {email: 'test@liferay.com', password: 'test'}},
        {createRunner: () => runner, ...noEvidenceDependencies()},
      ),
    ).rejects.toThrow(/Cannot resolve a portal URL/);
  });
});
