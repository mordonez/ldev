import fs from 'fs-extra';
import JSZip from 'jszip';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {runApplySiteInitializer} from '../../src/features/liferay/site-initializer/site-initializer-apply.js';
import {
  buildSiteInitializerPlan,
  zipSiteInitializer,
} from '../../src/features/liferay/site-initializer/site-initializer-plan.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

async function createSiteInitializerCx(options: {menuKey?: string; root?: boolean} = {}): Promise<string> {
  const repoRoot = createTempDir('ldev-si-');
  const cxDir = path.join(repoRoot, 'liferay', 'client-extensions', 'facultat');
  const si = path.join(cxDir, 'site-initializer');
  await fs.outputFile(
    path.join(cxDir, 'client-extension.yaml'),
    'facultat:\n    siteExternalReferenceCode: FAC_A\n    siteName: Facultat A\n    type: siteInitializer\n',
  );
  for (const [dir, url] of [
    ['1_home', '/home'],
    ['2_about', '/about'],
  ]) {
    await fs.outputJson(path.join(si, 'layouts', dir, 'page.json'), {friendlyURL: url, name_i18n: {en_US: dir}});
    await fs.outputJson(path.join(si, 'layouts', dir, 'page-definition.json'), {
      pageElement: {pageElements: [], ...(options.root === false && dir === '2_about' ? {} : {type: 'Root'})},
    });
  }
  await fs.outputJson(path.join(si, 'site-navigation-menus.json'), [
    {name: 'Main', [options.menuKey ?? 'menuItems']: [{friendlyURL: '/home', type: 'layout'}]},
  ]);
  return repoRoot;
}

function config(repoRoot: string) {
  return {
    cwd: repoRoot,
    repoRoot,
    dockerDir: path.join(repoRoot, 'docker'),
    liferayDir: path.join(repoRoot, 'liferay'),
    files: {dockerEnv: null, liferayProfile: null},
    liferay: {
      url: 'http://localhost:8080',
      oauth2ClientId: 'id',
      oauth2ClientSecret: 's',
      scopeAliases: '',
      timeoutSeconds: 5,
    },
  };
}

/** Portal fake: one optional existing site; created sites get the given pages and menu items. */
function createSitePortal(options: {existing?: boolean; createdPages: string[]; menuItems: number}) {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
  const fetchImpl = createTestFetchImpl((url, init) => {
    const method = init?.method ?? 'GET';
    const {pathname} = new URL(url);
    calls.push(`${method} ${pathname}`);
    if (pathname === '/o/headless-admin-site/v1.0/sites/FAC_A' && method === 'GET') {
      return options.existing ? json({id: 1, externalReferenceCode: 'FAC_A'}) : json({}, 404);
    }
    if (pathname === '/o/headless-admin-site/v1.0/sites/FAC_A' && method === 'DELETE') {
      return new Response(null, {status: 204});
    }
    if (pathname === '/o/headless-admin-site/v1.0/sites/site-initializer') {
      return json({id: 7, externalReferenceCode: 'FAC_A', friendlyUrlPath: '/facultat-a', name: 'Facultat A'});
    }
    if (pathname === '/o/headless-delivery/v1.0/sites/7/site-pages') {
      return json({items: options.createdPages.map((friendlyUrlPath) => ({friendlyUrlPath})), lastPage: 1});
    }
    if (pathname === '/o/headless-delivery/v1.0/sites/7/navigation-menus') {
      return json({items: [{name: 'Main', navigationMenuItems: Array.from({length: options.menuItems}, () => ({}))}]});
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });
  return {
    calls,
    dependencies: {apiClient: createLiferayApiClient({fetchImpl}), tokenClient: createStaticTokenClient()},
  };
}

describe('site initializer plan', () => {
  test('reads pages and menus, lints silent failures and zips under site-initializer/', async () => {
    const repoRoot = await createSiteInitializerCx({menuKey: 'siteNavigationMenuItems', root: false});
    const sourceDir = path.join(repoRoot, 'liferay', 'client-extensions', 'facultat', 'site-initializer');

    const plan = await buildSiteInitializerPlan(sourceDir);

    expect(plan.defaults).toEqual({siteExternalReferenceCode: 'FAC_A', siteName: 'Facultat A'});
    expect(plan.pages.map((page) => page.friendlyUrl)).toEqual(['/home', '/about']);
    expect(plan.lint).toEqual([
      expect.objectContaining({level: 'error', file: 'layouts/2_about/page-definition.json'}),
      expect.objectContaining({level: 'warning', file: 'site-navigation-menus.json'}),
    ]);

    const zip = await JSZip.loadAsync(await zipSiteInitializer(sourceDir));
    expect(Object.keys(zip.files).filter((name) => !name.endsWith('/'))).toContain(
      'site-initializer/layouts/1_home/page.json',
    );
  });
});

describe('ldev resource apply-site-initializer', () => {
  test('refuses to touch the portal when the source has lint errors', async () => {
    const repoRoot = await createSiteInitializerCx({root: false});
    const portal = createSitePortal({createdPages: [], menuItems: 0});

    await expect(runApplySiteInitializer(config(repoRoot), {source: 'facultat'}, portal.dependencies)).rejects.toThrow(
      /pageElement.type must be "Root"/,
    );
    expect(portal.calls).toEqual([]);
  });

  test('creates the site from the client extension defaults and reads pages and menus back', async () => {
    const repoRoot = await createSiteInitializerCx();
    const portal = createSitePortal({createdPages: ['/home', '/about'], menuItems: 1});

    const result = await runApplySiteInitializer(config(repoRoot), {source: 'facultat'}, portal.dependencies);

    expect(result).toMatchObject({
      status: 'created',
      siteExternalReferenceCode: 'FAC_A',
      siteName: 'Facultat A',
      site: {id: 7},
      readBack: {pages: {missing: []}, menus: {missing: [], itemCountMismatch: []}},
    });
  });

  test('reports pages and menu items the portal silently dropped', async () => {
    const repoRoot = await createSiteInitializerCx();
    const portal = createSitePortal({createdPages: ['/home'], menuItems: 0});

    await expect(runApplySiteInitializer(config(repoRoot), {source: 'facultat'}, portal.dependencies)).rejects.toThrow(
      /page \/about missing; navigation menu Main has 0 item\(s\), 1 declared/,
    );
  });

  test('is create-only: an existing site needs --recreate, which deletes it first', async () => {
    const repoRoot = await createSiteInitializerCx();
    const portal = createSitePortal({existing: true, createdPages: ['/home', '/about'], menuItems: 1});

    await expect(
      runApplySiteInitializer(config(repoRoot), {source: 'facultat'}, portal.dependencies),
    ).rejects.toMatchObject({code: 'LIFERAY_RESOURCE_BREAKING_CHANGE'});

    const checked = await runApplySiteInitializer(
      config(repoRoot),
      {source: 'facultat', checkOnly: true},
      portal.dependencies,
    );
    expect(checked).toMatchObject({status: 'checked', action: 'blocked-existing-site'});

    const recreated = await runApplySiteInitializer(
      config(repoRoot),
      {source: 'facultat', recreate: true},
      portal.dependencies,
    );
    expect(recreated.status).toBe('recreated');
    expect(portal.calls).toContain('DELETE /o/headless-admin-site/v1.0/sites/FAC_A');
  });
});
