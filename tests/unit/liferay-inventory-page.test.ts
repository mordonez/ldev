import {afterEach, describe, expect, test, vi} from 'vitest';
import path from 'node:path';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayInventoryPage,
  projectLiferayInventoryPageJson,
  resolveInventoryPageRequest,
  runLiferayInventoryPage,
} from '../../src/features/liferay/inventory/liferay-inventory-page.js';
import {
  isRegularPageRequest,
  isSiteRootRequest,
  privateLayoutForInventoryPageRequest,
} from '../../src/features/liferay/inventory/liferay-inventory-page-url.js';
import {validateLiferayInventoryPageResultV2} from '../../src/features/liferay/inventory/liferay-inventory-page-schema.js';
import {createStaticTokenClient, createTestFetchImpl, createTokenClient} from '../../src/testing/cli-test-helpers.js';

function siteResp(id: number, friendlyUrlPath: string, name: string) {
  return new Response(JSON.stringify({id, friendlyUrlPath, name}), {status: 200});
}

function layoutsResp(layouts: unknown[]) {
  return new Response(JSON.stringify(layouts), {status: 200});
}

function pageDefinitionResp(pageElements: unknown[] = []) {
  return new Response(JSON.stringify({pageDefinition: {pageElement: {type: 'Root', pageElements}}}), {status: 200});
}

function classNameIdResp(classNameId = 20006) {
  return new Response(JSON.stringify({classNameId}), {status: 200});
}

function groupResp(companyId: number, friendlyURL: string, nameCurrentValue: string, parentGroupId = 0) {
  return new Response(JSON.stringify({companyId, parentGroupId, friendlyURL, nameCurrentValue}), {status: 200});
}

const CONFIG = {
  cwd: '/tmp/repo',
  repoRoot: '/tmp/repo',
  dockerDir: '/tmp/repo/docker',
  liferayDir: '/tmp/repo/liferay',
  files: {
    dockerEnv: '/tmp/repo/docker/.env',
    liferayProfile: '/tmp/repo/.liferay-cli.yml',
  },
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'scope-a',
    timeoutSeconds: 30,
  },
};

const REMOTE_ONLY_CONFIG = {
  ...CONFIG,
  cwd: '/tmp',
  repoRoot: null,
  dockerDir: null,
  liferayDir: null,
  files: {
    dockerEnv: null,
    liferayProfile: null,
  },
};

const EXPECTED_GUEST_STRUCTURE_EXPORT_PATH = path.resolve(
  CONFIG.repoRoot,
  'liferay/resources/journal/structures',
  'guest',
  'NEWS.json',
);

const EXPECTED_GUEST_TEMPLATE_EXPORT_PATH = path.resolve(
  CONFIG.repoRoot,
  'liferay/resources/journal/templates',
  'guest',
  'NEWS_TEMPLATE.ftl',
);

const TOKEN_CLIENT = createStaticTokenClient();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('liferay inventory page', () => {
  test('resolves requests from full URLs and explicit site/friendly-url', () => {
    expect(resolveInventoryPageRequest({url: '/web/guest/home'})).toMatchObject({
      kind: 'publicRegularPage',
      site: 'guest',
      friendlyUrl: '/home',
    });

    expect(resolveInventoryPageRequest({url: 'https://example.test/group/guest/private-page'})).toMatchObject({
      kind: 'privateRegularPage',
      site: 'guest',
      friendlyUrl: '/private-page',
    });

    expect(resolveInventoryPageRequest({site: 'guest', friendlyUrl: '/w/news-article'})).toMatchObject({
      kind: 'webContentDisplayPage',
      site: 'guest',
      friendlyUrl: '/w/news-article',
      urlTitle: 'news-article',
    });

    expect(resolveInventoryPageRequest({url: 'https://example.test/es/web/guest/aprende'})).toMatchObject({
      kind: 'publicRegularPage',
      site: 'guest',
      friendlyUrl: '/aprende',
      localeHint: 'es_ES',
    });

    expect(resolveInventoryPageRequest({url: '/web/guest'})).toMatchObject({
      kind: 'publicSiteRoot',
      site: 'guest',
      resolveHomeRedirect: true,
    });

    expect(resolveInventoryPageRequest({url: '/group/guest'})).toMatchObject({
      kind: 'privateSiteRoot',
      site: 'guest',
      resolveHomeRedirect: true,
    });

    expect(resolveInventoryPageRequest({site: 'guest', friendlyUrl: '/'})).toMatchObject({
      kind: 'publicSiteRoot',
      site: 'guest',
      resolveHomeRedirect: false,
    });
  });

  test('narrowing helpers correctly classify InventoryPageRequest kinds', () => {
    const publicRoot = resolveInventoryPageRequest({url: '/web/guest'});
    const privateRoot = resolveInventoryPageRequest({url: '/group/guest'});
    const publicPage = resolveInventoryPageRequest({url: '/web/guest/home'});
    const privatePage = resolveInventoryPageRequest({url: '/group/guest/home'});
    const displayPage = resolveInventoryPageRequest({site: 'guest', friendlyUrl: '/w/my-article'});
    const portalHome = resolveInventoryPageRequest({url: '/'});

    expect(isSiteRootRequest(publicRoot)).toBe(true);
    expect(isSiteRootRequest(privateRoot)).toBe(true);
    expect(isSiteRootRequest(publicPage)).toBe(false);
    expect(isSiteRootRequest(displayPage)).toBe(false);
    expect(isSiteRootRequest(portalHome)).toBe(false);

    expect(isRegularPageRequest(publicPage)).toBe(true);
    expect(isRegularPageRequest(privatePage)).toBe(true);
    expect(isRegularPageRequest(publicRoot)).toBe(false);
    expect(isRegularPageRequest(displayPage)).toBe(false);
    expect(isRegularPageRequest(portalHome)).toBe(false);

    // privateLayoutForInventoryPageRequest excludes portalHome and webContentDisplayPage at the type level;
    // use inline objects to give TypeScript the narrowed type it needs.
    expect(
      privateLayoutForInventoryPageRequest({kind: 'publicSiteRoot', site: 'guest', resolveHomeRedirect: false}),
    ).toBe(false);
    expect(
      privateLayoutForInventoryPageRequest({kind: 'privateSiteRoot', site: 'guest', resolveHomeRedirect: false}),
    ).toBe(true);
    expect(privateLayoutForInventoryPageRequest({kind: 'publicRegularPage', site: 'guest', friendlyUrl: '/home'})).toBe(
      false,
    );
    expect(
      privateLayoutForInventoryPageRequest({kind: 'privateRegularPage', site: 'guest', friendlyUrl: '/home'}),
    ).toBe(true);
  });

  test('rejects display-page URL without a site segment', () => {
    expect(() => resolveInventoryPageRequest({url: '/w/some-article'})).toThrow(
      'Display pages (paths starting with /w/) require a site.',
    );
  });

  test('treats bare /w/ path as a regular page (no urlTitle)', () => {
    expect(resolveInventoryPageRequest({site: 'guest', friendlyUrl: '/w/'})).toMatchObject({
      kind: 'publicRegularPage',
      site: 'guest',
      friendlyUrl: '/w/',
    });
  });

  test('decodes percent-encoded display page url titles', () => {
    expect(resolveInventoryPageRequest({url: '/web/ub/w/%C3%88xit-de-les-seleccions'})).toMatchObject({
      kind: 'webContentDisplayPage',
      site: 'ub',
      friendlyUrl: '/w/%C3%88xit-de-les-seleccions',
      urlTitle: 'Èxit-de-les-seleccions',
    });
  });

  test('ignores absolute URL origin and keeps configured portal URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled for test'));

    const seenUrls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        seenUrls.push(url);

        if (!url.startsWith('http://localhost:8080/')) {
          throw new Error(`Unexpected portal origin ${url}`);
        }

        if (url.includes('/by-friendly-url-path/facultat-economia-empresa')) {
          return siteResp(15503412, '/facultat-economia-empresa', 'Facultat d’Economia i Empresa');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([]);
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: 'http://127.0.0.1:8240/web/facultat-economia-empresa'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toMatchObject({
      pageType: 'siteRoot',
      siteFriendlyUrl: '/facultat-economia-empresa',
      url: '/web/facultat-economia-empresa/',
    });
    expect(seenUrls.every((url) => url.startsWith('http://localhost:8080/'))).toBe(true);
  });

  test('resolves site root URLs through the runtime redirect when --url points to the site home', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 302,
        headers: {location: 'http://localhost:8080/web/projecte-recerca-foodcircuits/inici'},
      }),
    );

    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/projecte-recerca-foodcircuits')) {
          return siteResp(20117, '/projecte-recerca-foodcircuits', 'Projecte Recerca Foodcircuits');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {
              layoutId: 7144,
              plid: 7143,
              type: 'content',
              nameCurrentValue: 'Inici',
              friendlyURL: '/inici',
              hidden: false,
            },
          ]);
        }

        if (url.includes('/site-pages/inici?fields=pageDefinition')) {
          return pageDefinitionResp();
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/projecte-recerca-foodcircuits/'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toMatchObject({
      pageType: 'regularPage',
      siteFriendlyUrl: '/projecte-recerca-foodcircuits',
      url: '/web/projecte-recerca-foodcircuits/inici',
      friendlyUrl: '/inici',
      pageName: 'Inici',
    });
  });

  test('returns regular page inventory for a resolved layout', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {
              layoutId: 11,
              plid: 1011,
              type: 'content',
              nameCurrentValue: 'Home',
              friendlyURL: '/home',
              hidden: false,
              typeSettings: 'layout-template-id=2_columns\nurl=https://example.test',
            },
          ]);
        }

        if (url.includes('parentLayoutId=11')) {
          return layoutsResp([]);
        }

        if (url.includes('/site-pages/home?fields=pageDefinition')) {
          return new Response(
            JSON.stringify({
              pageDefinition: {
                pageElement: {
                  type: 'Root',
                  pageElements: [
                    {
                      type: 'Fragment',
                      definition: {
                        fragment: {key: 'banner'},
                      },
                    },
                    {
                      type: 'Widget',
                      definition: {
                        widgetInstance: {
                          widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
                        },
                      },
                    },
                  ],
                },
              },
            }),
            {status: 200},
          );
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();

    expect(result).toMatchObject({
      pageType: 'regularPage',
      pageSubtype: 'content',
      pageUiType: 'Content Page',
      pageName: 'Home',
      groupId: 20121,
      url: '/web/guest/home',
      layout: {
        layoutId: 11,
        plid: 1011,
      },
      layoutDetails: {
        layoutTemplateId: '2_columns',
        targetUrl: 'https://example.test',
      },
      adminUrls: {
        view: 'http://localhost:8080/web/guest/home',
        edit: 'http://localhost:8080/web/guest/home?p_l_mode=edit',
        configureGeneral:
          'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&p_r_p_selPlid=1011&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_mvcRenderCommandName=%2Flayout_admin%2Fedit_layout&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_groupId=20121&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=false&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationCategoryKey=general&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationEntryKey=general',
        configureDesign:
          'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&p_r_p_selPlid=1011&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_mvcRenderCommandName=%2Flayout_admin%2Fedit_layout&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_groupId=20121&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=false&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationCategoryKey=general&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationEntryKey=design',
        configureSeo:
          'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&p_r_p_selPlid=1011&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_mvcRenderCommandName=%2Flayout_admin%2Fedit_layout&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_groupId=20121&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=false&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationCategoryKey=general&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationEntryKey=seo',
        configureOpenGraph:
          'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&p_r_p_selPlid=1011&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_mvcRenderCommandName=%2Flayout_admin%2Fedit_layout&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_groupId=20121&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=false&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationCategoryKey=general&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationEntryKey=open-graph',
        configureCustomMetaTags:
          'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet&p_p_lifecycle=0&p_p_state=maximized&p_r_p_selPlid=1011&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_mvcRenderCommandName=%2Flayout_admin%2Fedit_layout&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_groupId=20121&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=false&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationCategoryKey=general&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_screenNavigationEntryKey=custom-meta-tags',
        translate:
          'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_translation_web_internal_portlet_TranslationPortlet&p_p_lifecycle=0&p_p_state=maximized&_com_liferay_translation_web_internal_portlet_TranslationPortlet_mvcRenderCommandName=%2Ftranslation%2Ftranslate&_com_liferay_translation_web_internal_portlet_TranslationPortlet_classNameId=20006&_com_liferay_translation_web_internal_portlet_TranslationPortlet_classPK=1011&_com_liferay_translation_web_internal_portlet_TranslationPortlet_portletResource=com_liferay_layout_admin_web_portlet_GroupPagesPortlet',
      },
      componentInspectionSupported: true,
    });
    if (result.pageType !== 'regularPage') {
      throw new Error('Expected regular page');
    }
    expect(result.fragmentEntryLinks).toEqual([
      {type: 'fragment', fragmentKey: 'banner'},
      {
        type: 'widget',
        widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
      },
    ]);
    expect(result.journalArticles).toEqual([]);
    expect(result.contentStructures).toEqual([]);
    expect(formatLiferayInventoryPage(result)).toContain('REGULAR PAGE');
  });

  test('accepts widget ADT evidence in validated page results', () => {
    const result = {
      pageType: 'regularPage',
      pageSubtype: 'content',
      pageUiType: 'Content Page',
      siteName: 'UB',
      siteFriendlyUrl: '/ub',
      groupId: 20121,
      url: '/web/ub/rss',
      friendlyUrl: '/rss',
      pageName: 'RSS',
      privateLayout: false,
      layout: {
        layoutId: 11,
        plid: 1011,
        friendlyUrl: '/rss',
        type: 'content',
        hidden: false,
      },
      layoutDetails: {},
      adminUrls: {
        view: '',
        edit: '',
        configureGeneral: '',
        configureDesign: '',
        configureSeo: '',
        configureOpenGraph: '',
        configureCustomMetaTags: '',
        translate: '',
      },
      evidence: [
        {
          resourceType: 'adt',
          key: 'ddmTemplate_40801',
          kind: 'widgetAdt',
          detail: 'widgetName=asset-publisher index=0 displayStyle=ddmTemplate_40801',
          source: 'fragmentEntryLink',
        },
      ],
    };

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();
  });

  test('skips local fragment export path enrichment outside a repo', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {layoutId: 11, plid: 1011, type: 'content', nameCurrentValue: 'Home', friendlyURL: '/home', hidden: false},
          ]);
        }

        if (url.includes('parentLayoutId=11')) {
          return layoutsResp([]);
        }

        if (url.includes('/site-pages/home?fields=pageDefinition')) {
          return new Response(
            JSON.stringify({
              pageDefinition: {
                pageElement: {
                  type: 'Root',
                  pageElements: [
                    {
                      type: 'Fragment',
                      definition: {
                        fragment: {key: 'banner'},
                      },
                    },
                  ],
                },
              },
            }),
            {status: 200},
          );
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      REMOTE_ONLY_CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();
    if (result.pageType !== 'regularPage') {
      throw new Error('Expected regular page');
    }

    expect(result.fragmentEntryLinks).toEqual([{type: 'fragment', fragmentKey: 'banner'}]);
    const fragmentEntries = result.fragmentEntryLinks;
    if (!fragmentEntries) {
      throw new Error('Expected fragment entries');
    }
    const fragmentEntry = fragmentEntries[0];
    expect(fragmentEntry).toBeDefined();
    expect(fragmentEntry).not.toHaveProperty('fragmentExportPath');
    expect(fragmentEntry).not.toHaveProperty('fragmentSiteFriendlyUrl');
  });

  test('returns classic portlet layout composition from type settings', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {
              layoutId: 11,
              plid: 1011,
              type: 'portlet',
              nameCurrentValue: 'Home',
              friendlyURL: '/home',
              hidden: false,
              typeSettings:
                'layout-template-id=home\ncolumn-top=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_top\ncolumn-fluid=com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_main\ncolumn-fluid-customizable=false\n',
            },
          ]);
        }

        if (url.includes('parentLayoutId=11')) {
          return layoutsResp([]);
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();

    expect(result).toMatchObject({
      pageType: 'regularPage',
      pageSubtype: 'portlet',
      pageUiType: 'Widget Page',
      pageSummary: {
        layoutTemplateId: 'home',
        fragmentCount: 0,
        widgetCount: 2,
      },
      portlets: [
        {
          columnId: 'column-top',
          position: 0,
          portletName: 'com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet',
          instanceId: 'top',
          configuration: {
            columnId: 'column-top',
            position: '0',
            layoutTemplateId: 'home',
          },
        },
        {
          columnId: 'column-fluid',
          position: 0,
          portletName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
          instanceId: 'main',
        },
      ],
    });
    expect(formatLiferayInventoryPage(result)).toContain('PORTLETS (2)');
    expect(formatLiferayInventoryPage(result)).toContain('columnId=column-fluid');
  });

  test('resolves portal root through the runtime redirect', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 302,
        headers: {location: 'http://localhost:8080/web/ub/inici'},
      }),
    );

    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/ub')) {
          return siteResp(20121, '/ub', 'UB');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {
              layoutId: 11,
              plid: 1011,
              type: 'content',
              nameCurrentValue: 'Inici',
              friendlyURL: '/inici',
              hidden: false,
            },
          ]);
        }

        if (url.includes('/site-pages/inici?fields=pageDefinition')) {
          return pageDefinitionResp();
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(CONFIG, {url: '/'}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result).toMatchObject({
      pageType: 'regularPage',
      siteFriendlyUrl: '/ub',
      url: '/web/ub/inici',
      friendlyUrl: '/inici',
      pageName: 'Inici',
    });
  });

  test('resolves localized friendly URLs via headless site-pages fallback', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {
              layoutId: '11',
              plid: '1011',
              type: 'content',
              nameCurrentValue: 'Aprende',
              friendlyURL: '/apren',
              hidden: false,
            },
          ]);
        }

        if (url.includes('parentLayoutId=11')) {
          return layoutsResp([]);
        }

        if (url.includes('/o/headless-delivery/v1.0/sites/20121/site-pages?page=1&pageSize=100')) {
          expect((init?.headers as Record<string, string>)['Accept-Language']).toBe('es-ES');
          return new Response(
            JSON.stringify({
              items: [{id: 1011, friendlyUrlPath: '/aprende'}],
              lastPage: 1,
            }),
            {status: 200},
          );
        }

        if (url.includes('/site-pages/apren?fields=pageDefinition')) {
          return pageDefinitionResp();
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/es/web/guest/aprende'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toMatchObject({
      pageType: 'regularPage',
      friendlyUrl: '/apren',
      matchedLocale: 'es_ES',
      requestedFriendlyUrl: '/aprende',
      pageName: 'Aprende',
    });
  });

  test('resolves localized friendly URLs without a locale prefix via locale probing fallback', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {
              layoutId: '11',
              plid: '1011',
              type: 'content',
              nameCurrentValue: 'Aprende',
              friendlyURL: '/apren',
              hidden: false,
            },
          ]);
        }

        if (url.includes('parentLayoutId=11')) {
          return layoutsResp([]);
        }

        if (url.includes('/o/headless-delivery/v1.0/sites/20121/site-pages?page=1&pageSize=100')) {
          const language = (init?.headers as Record<string, string>)['Accept-Language'];
          if (language === 'es-ES') {
            return new Response(
              JSON.stringify({
                items: [{id: 1011, friendlyUrlPath: '/aprende'}],
                lastPage: 1,
              }),
              {status: 200},
            );
          }
          return new Response(JSON.stringify({items: [], lastPage: 1}), {status: 200});
        }

        if (url.includes('/site-pages/apren?fields=pageDefinition')) {
          return pageDefinitionResp();
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/guest/aprende'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toMatchObject({
      pageType: 'regularPage',
      friendlyUrl: '/apren',
      matchedLocale: 'es_ES',
      requestedFriendlyUrl: '/aprende',
      pageName: 'Aprende',
    });
  });

  test('reuses the access token during page inventory instead of fetching it twice', async () => {
    let tokenCalls = 0;
    const config = {
      ...CONFIG,
      liferay: {
        ...CONFIG.liferay,
        oauth2ClientId: 'client-id-token-cache',
      },
    };
    const tokenClient = createTokenClient(() => {
      tokenCalls += 1;
      return {
        accessToken: 'token-123',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };
    });

    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {layoutId: 11, plid: 1011, type: 'content', nameCurrentValue: 'Home', friendlyURL: '/home', hidden: false},
          ]);
        }

        if (url.includes('/site-pages/home?fields=pageDefinition')) {
          return pageDefinitionResp();
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await runLiferayInventoryPage(config, {url: '/web/guest/home'}, {apiClient, tokenClient});

    expect(tokenCalls).toBe(1);
  });

  test('includes fragment image editables when Liferay returns fragmentImage payloads', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('parentLayoutId=0')) {
          return layoutsResp([
            {layoutId: 11, plid: 1011, type: 'content', nameCurrentValue: 'Home', friendlyURL: '/home', hidden: false},
          ]);
        }

        if (url.includes('parentLayoutId=11')) {
          return layoutsResp([]);
        }

        if (url.includes('/site-pages/home?fields=pageDefinition')) {
          return new Response(
            JSON.stringify({
              pageDefinition: {
                pageElement: {
                  type: 'Root',
                  pageElements: [
                    {
                      type: 'Fragment',
                      definition: {
                        fragment: {key: 'ub-frg-articulo'},
                        fragmentConfig: {displayImage: 'true'},
                        fragmentFields: [
                          {
                            id: 'image',
                            value: {
                              fragmentImage: {
                                title: {value: 'Demo image'},
                                url: {
                                  value_i18n: {
                                    ca_ES: 'http://localhost/documents/demo.png',
                                  },
                                },
                              },
                            },
                          },
                          {
                            id: 'intro-paragraph',
                            value: {
                              text: {
                                value_i18n: {
                                  ca_ES: 'Intro',
                                },
                              },
                            },
                          },
                          {
                            id: 'mapped-title',
                            value: {
                              html: {
                                mapping: {
                                  fieldKey: 'ddmTemplate_NEWS_TEMPLATE_DETAIL',
                                  itemReference: {
                                    contextSource: 'DisplayPageItem',
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            }),
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    if (result.pageType !== 'regularPage') {
      throw new Error('Expected regular page');
    }

    expect(result.fragmentEntryLinks).toMatchObject([
      {
        type: 'fragment',
        fragmentKey: 'ub-frg-articulo',
        configuration: {displayImage: 'true'},
        editableFields: [
          {id: 'image', value: 'Demo image'},
          {id: 'intro-paragraph', value: 'Intro'},
        ],
        mappedTemplateKeys: ['NEWS_TEMPLATE_DETAIL'],
      },
    ]);
    expect(formatLiferayInventoryPage(result)).toContain('[image] Demo image');
  });

  test('returns display page inventory for structured content', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        if (url.includes('/structured-contents?')) {
          return new Response(
            '{"items":[{"id":41001,"key":"ART-001","title":"News article","friendlyUrlPath":"news-article","contentStructureId":301}],"lastPage":1}',
            {status: 200},
          );
        }

        if (url.includes('/journal.journalarticle/get-article-by-url-title')) {
          return new Response(
            JSON.stringify({
              id: 41001,
              resourcePrimKey: 41001,
              articleId: 'ART-001',
              titleCurrentValue: 'News article',
              ddmStructureKey: 'NEWS',
              ddmTemplateKey: 'NEWS_TEMPLATE',
              contentStructureId: 301,
            }),
            {status: 200},
          );
        }

        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return groupResp(10157, '/guest', 'Guest');
        }

        if (url.includes('/by-friendly-url-path/global')) {
          return siteResp(20122, '/global', 'Global');
        }

        if (
          url.includes(
            '/o/data-engine/v2.0/sites/20121/data-definitions/by-content-type/journal/by-data-definition-key/NEWS',
          )
        ) {
          return new Response('{"id":301,"dataDefinitionKey":"NEWS","name":{"en_US":"News"}}', {status: 200});
        }

        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure',
          )
        ) {
          return new Response('{"classNameId":1001}', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":1002}', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return classNameIdResp();
        }

        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121')) {
          return new Response(
            '[{"templateId":"40801","templateKey":"NEWS_TEMPLATE","externalReferenceCode":"NEWS_TEMPLATE","nameCurrentValue":"News Template","classPK":301,"script":"<#-- ftl -->"}]',
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-admin-content/v1.0/sites/20121/display-page-templates?pageSize=200')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  displayPageTemplateKey: 'news_article_detail',
                  title: 'NEWS_ARTICLE_DETAIL',
                  pageDefinition: {
                    pageElement: {
                      type: 'Root',
                      pageElements: [
                        {
                          type: 'Fragment',
                          definition: {
                            fragmentFields: [
                              {
                                id: 'element-html',
                                value: {
                                  html: {
                                    mapping: {
                                      fieldKey: 'ddmTemplate_NEWS_TEMPLATE_DETAIL',
                                      itemReference: {
                                        contextSource: 'DisplayPageItem',
                                      },
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }),
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(
            JSON.stringify({
              id: 41001,
              contentStructureId: 301,
              siteId: 20121,
              priority: 0,
              renderedContents: [
                {
                  contentTemplateId: 'news_article_detail',
                  contentTemplateName: 'NEWS_ARTICLE_DETAIL',
                  markedAsDefault: true,
                  renderedContentURL:
                    'http://localhost:8080/o/headless-delivery/v1.0/structured-contents/41001/rendered-content-by-display-page/news_article_detail',
                },
              ],
              contentFields: [
                {
                  label: 'Headline',
                  name: 'headline',
                  dataType: 'string',
                  contentFieldValue: {data: 'News title'},
                },
              ],
            }),
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/content-structures/301')) {
          return new Response('{"id":301,"dataDefinitionKey":"NEWS","name":"News"}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {site: 'guest', friendlyUrl: '/w/news-article'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();

    expect(result).toMatchObject({
      pageType: 'displayPage',
      contentItemType: 'WebContent',
      url: '/web/guest/w/news-article',
      article: {
        id: 41001,
        key: 'ART-001',
        title: 'News article',
      },
      adminUrls: {
        edit: 'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_journal_web_portlet_JournalPortlet&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_com_liferay_journal_web_portlet_JournalPortlet_mvcRenderCommandName=/journal/edit_article&_com_liferay_journal_web_portlet_JournalPortlet_articleId=ART-001&_com_liferay_journal_web_portlet_JournalPortlet_groupId=20121',
        translate:
          'http://localhost:8080/group/guest/~/control_panel/manage?p_p_id=com_liferay_translation_web_internal_portlet_TranslationPortlet&p_p_lifecycle=0&p_p_state=maximized&_com_liferay_translation_web_internal_portlet_TranslationPortlet_mvcRenderCommandName=%2Ftranslation%2Ftranslate&_com_liferay_translation_web_internal_portlet_TranslationPortlet_classNameId=1002&_com_liferay_translation_web_internal_portlet_TranslationPortlet_classPK=41001&_com_liferay_translation_web_internal_portlet_TranslationPortlet_portletResource=com_liferay_journal_web_portlet_JournalPortlet',
      },
      journalArticles: [
        {
          articleId: 'ART-001',
          siteFriendlyUrl: '/guest',
          ddmStructureKey: 'NEWS',
          ddmTemplateKey: 'NEWS_TEMPLATE',
          displayPageDefaultTemplate: 'NEWS_ARTICLE_DETAIL',
          displayPageTemplateCandidates: ['NEWS_ARTICLE_DETAIL'],
          displayPageDdmTemplates: ['NEWS_TEMPLATE_DETAIL'],
          priority: 0,
          ddmStructureSiteFriendlyUrl: '/guest',
          ddmTemplateSiteFriendlyUrl: '/guest',
          contentFields: [
            {
              path: 'Headline',
              label: 'Headline',
              name: 'headline',
              type: 'string',
              value: 'News title',
            },
          ],
        },
      ],
      contentStructures: [
        {
          contentStructureId: 301,
          key: 'NEWS',
          siteFriendlyUrl: '/guest',
          exportPath: EXPECTED_GUEST_STRUCTURE_EXPORT_PATH,
        },
      ],
    });
    if (result.pageType !== 'displayPage') {
      throw new Error('Expected display page');
    }
    expect(result.journalArticles?.[0]?.structureExportPath).toBe(EXPECTED_GUEST_STRUCTURE_EXPORT_PATH);
    expect(result.journalArticles?.[0]?.templateExportPath).toBe(EXPECTED_GUEST_TEMPLATE_EXPORT_PATH);
    expect('articleProperties' in result).toBe(false);
    expect(formatLiferayInventoryPage(result)).toContain('DISPLAY PAGE');
    expect(formatLiferayInventoryPage(result)).toContain('contentField Headline=News title');
  });

  test('skips local structure and template export path enrichment outside a repo', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('/structured-contents?')) {
          return new Response(
            '{"items":[{"id":41001,"key":"ART-001","title":"News article","friendlyUrlPath":"news-article","contentStructureId":301}],"lastPage":1}',
            {status: 200},
          );
        }

        if (url.includes('/journal.journalarticle/get-article-by-url-title')) {
          return new Response(
            JSON.stringify({
              id: 41001,
              resourcePrimKey: 41001,
              articleId: 'ART-001',
              titleCurrentValue: 'News article',
              ddmStructureKey: 'NEWS',
              ddmTemplateKey: 'NEWS_TEMPLATE',
              contentStructureId: 301,
            }),
            {status: 200},
          );
        }

        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response(
            '{"companyId":10157,"parentGroupId":0,"friendlyURL":"/guest","nameCurrentValue":"Guest"}',
            {status: 200},
          );
        }

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20122,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (
          url.includes(
            '/o/data-engine/v2.0/sites/20121/data-definitions/by-content-type/journal/by-data-definition-key/NEWS',
          )
        ) {
          return new Response('{"id":301,"dataDefinitionKey":"NEWS","name":{"en_US":"News"}}', {status: 200});
        }

        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121')) {
          return new Response(
            '[{"templateId":"40801","templateKey":"NEWS_TEMPLATE","externalReferenceCode":"NEWS_TEMPLATE","nameCurrentValue":"News Template","classPK":301,"script":"<#-- ftl -->"}]',
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(
            JSON.stringify({
              id: 41001,
              contentStructureId: 301,
              priority: 0,
              contentFields: [
                {
                  label: 'Headline',
                  name: 'headline',
                  dataType: 'string',
                  contentFieldValue: {data: 'News title'},
                },
              ],
            }),
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/content-structures/301')) {
          return new Response('{"id":301,"dataDefinitionKey":"NEWS","name":"News"}', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":1002}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayInventoryPage(
      REMOTE_ONLY_CONFIG,
      {site: 'guest', friendlyUrl: '/w/news-article'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();
    if (result.pageType !== 'displayPage') {
      throw new Error('Expected display page');
    }

    expect(result.journalArticles?.[0]).toMatchObject({
      articleId: 'ART-001',
      ddmStructureKey: 'NEWS',
      ddmTemplateKey: 'NEWS_TEMPLATE',
      ddmStructureSiteFriendlyUrl: '/guest',
      ddmTemplateSiteFriendlyUrl: '/guest',
    });
    expect(result.journalArticles?.[0]).not.toHaveProperty('structureExportPath');
    expect(result.journalArticles?.[0]).not.toHaveProperty('templateExportPath');
    expect(result.contentStructures?.[0]).toMatchObject({
      contentStructureId: 301,
      key: 'NEWS',
      siteFriendlyUrl: '/guest',
    });
    expect(result.contentStructures?.[0]).not.toHaveProperty('exportPath');
  });

  test('fails clearly when layout cannot be resolved', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return siteResp(20121, '/guest', 'Guest');
        }

        return layoutsResp([]);
      }),
    });

    await expect(
      runLiferayInventoryPage(CONFIG, {url: '/web/guest/missing'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('Layout not found');
  });

  test('projectLiferayInventoryPageJson keeps full widget metadata in full regular-page output', () => {
    const projected = projectLiferayInventoryPageJson(
      {
        pageType: 'regularPage',
        pageSubtype: 'content',
        pageUiType: 'Content Page',
        siteName: 'Guest',
        siteFriendlyUrl: '/guest',
        groupId: 20121,
        url: '/web/guest/home',
        friendlyUrl: '/home',
        pageName: 'Home',
        privateLayout: false,
        layout: {
          layoutId: 11,
          plid: 1011,
          friendlyUrl: '/home',
          type: 'content',
          hidden: false,
        },
        layoutDetails: {},
        adminUrls: {
          view: 'http://localhost:8080/web/guest/home',
          edit: 'http://localhost:8080/web/guest/home?p_l_mode=edit',
          configureGeneral: 'http://localhost:8080/group/guest/general',
          configureDesign: 'http://localhost:8080/group/guest/design',
          configureSeo: 'http://localhost:8080/group/guest/seo',
          configureOpenGraph: 'http://localhost:8080/group/guest/open-graph',
          configureCustomMetaTags: 'http://localhost:8080/group/guest/custom-meta-tags',
          translate: 'http://localhost:8080/group/guest/translate',
        },
        fragmentEntryLinks: [
          {
            type: 'widget',
            widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
            portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc',
            configuration: {articleId: 'ART-001'},
            elementName: 'Main journal widget',
            cssClasses: ['widget-shell', 'widget-shell-primary'],
            customCSS: '.widget-shell-primary { color: red; }',
          },
        ],
      },
      {full: true},
    );

    if (!('page' in projected) || projected.page.type !== 'regularPage') {
      throw new Error('Expected full regular-page widget output');
    }

    const regularProjected = projected as Extract<
      ReturnType<typeof projectLiferayInventoryPageJson>,
      {page: {type: 'regularPage'}}
    >;

    if (!regularProjected.full?.components?.widgets) {
      throw new Error('Expected full regular-page widget output');
    }

    expect(regularProjected.full.components.widgets).toMatchObject([
      {
        widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
        portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc',
        configuration: {articleId: 'ART-001'},
        elementName: 'Main journal widget',
        cssClasses: ['widget-shell', 'widget-shell-primary'],
        customCSS: '.widget-shell-primary { color: red; }',
      },
    ]);
  });

  test('projectLiferayInventoryPageJson exposes classic portlet composition in default output', () => {
    const projected = projectLiferayInventoryPageJson({
      pageType: 'regularPage',
      pageSubtype: 'portlet',
      pageUiType: 'Widget Page',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/home',
      friendlyUrl: '/home',
      pageName: 'Home',
      privateLayout: false,
      pageSummary: {
        layoutTemplateId: 'home',
        fragmentCount: 0,
        widgetCount: 2,
      },
      layout: {
        layoutId: 11,
        plid: 1011,
        friendlyUrl: '/home',
        type: 'portlet',
        hidden: false,
      },
      layoutDetails: {layoutTemplateId: 'home'},
      adminUrls: {
        view: 'http://localhost:8080/web/guest/home',
        edit: 'http://localhost:8080/web/guest/home?p_l_mode=edit',
        configureGeneral: 'http://localhost:8080/group/guest/general',
        configureDesign: 'http://localhost:8080/group/guest/design',
        configureSeo: 'http://localhost:8080/group/guest/seo',
        configureOpenGraph: 'http://localhost:8080/group/guest/open-graph',
        configureCustomMetaTags: 'http://localhost:8080/group/guest/custom-meta-tags',
        translate: 'http://localhost:8080/group/guest/translate',
      },
      componentInspectionSupported: false,
      portlets: [
        {
          columnId: 'column-top',
          position: 0,
          portletId: 'com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_top',
          portletName: 'com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet',
          instanceId: 'top',
          configuration: {columnId: 'column-top', position: '0', layoutTemplateId: 'home'},
        },
        {
          columnId: 'column-fluid',
          position: 0,
          portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_main',
          portletName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
          instanceId: 'main',
          configuration: {columnId: 'column-fluid', position: '0', layoutTemplateId: 'home'},
        },
      ],
    });

    if (!('page' in projected) || projected.page.type !== 'regularPage') {
      throw new Error('Expected regular-page output');
    }

    const regularProjected = projected as Extract<
      ReturnType<typeof projectLiferayInventoryPageJson>,
      {page: {type: 'regularPage'}}
    >;

    expect(regularProjected.summary).toMatchObject({
      layoutTemplateId: 'home',
      fragmentCount: 0,
      widgetCount: 2,
    });
    expect(regularProjected.components?.portlets).toEqual([
      {
        columnId: 'column-top',
        position: 0,
        portletId: 'com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_top',
        portletName: 'com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet',
        instanceId: 'top',
        configuration: {columnId: 'column-top', position: '0', layoutTemplateId: 'home'},
      },
      {
        columnId: 'column-fluid',
        position: 0,
        portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_main',
        portletName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
        instanceId: 'main',
        configuration: {columnId: 'column-fluid', position: '0', layoutTemplateId: 'home'},
      },
    ]);
    expect(regularProjected.full).toBeUndefined();
  });

  test('projectLiferayInventoryPageJson keeps cheap regular-page content breadcrumbs in default output', () => {
    const projected = projectLiferayInventoryPageJson({
      pageType: 'regularPage',
      pageSubtype: 'content',
      pageUiType: 'Content Page',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/home',
      friendlyUrl: '/home',
      pageName: 'Home',
      privateLayout: false,
      layout: {
        layoutId: 11,
        plid: 1011,
        friendlyUrl: '/home',
        type: 'content',
        hidden: false,
      },
      layoutDetails: {},
      adminUrls: {
        view: 'http://localhost:8080/web/guest/home',
        edit: 'http://localhost:8080/web/guest/home?p_l_mode=edit',
        configureGeneral: 'http://localhost:8080/group/guest/general',
        configureDesign: 'http://localhost:8080/group/guest/design',
        configureSeo: 'http://localhost:8080/group/guest/seo',
        configureOpenGraph: 'http://localhost:8080/group/guest/open-graph',
        configureCustomMetaTags: 'http://localhost:8080/group/guest/custom-meta-tags',
        translate: 'http://localhost:8080/group/guest/translate',
      },
      fragmentEntryLinks: [
        {
          type: 'fragment',
          fragmentKey: 'banner',
          fragmentSiteFriendlyUrl: '/global',
          fragmentExportPath: 'C:\\repo\\liferay\\fragments\\banner',
          contentSummary: 'title=Welcome',
        },
      ],
      journalArticles: [
        {
          groupId: 20122,
          siteFriendlyUrl: '/global',
          siteName: 'Global',
          articleId: 'ART-001',
          title: 'Home article',
          ddmStructureKey: 'BASIC',
          ddmStructureSiteFriendlyUrl: '/global',
          structureExportPath: 'C:\\repo\\liferay\\resources\\journal\\structures\\global\\BASIC.json',
          contentStructureId: 301,
          ddmTemplateKey: 'BASIC_DETAIL',
          ddmTemplateSiteFriendlyUrl: '/global',
          templateExportPath: 'C:\\repo\\liferay\\resources\\journal\\templates\\global\\BASIC_DETAIL.ftl',
          contentFields: [{path: 'Body', label: 'Body', name: 'body', type: 'string', value: 'Long body'}],
        },
      ],
    });

    if (!('page' in projected) || projected.page.type !== 'regularPage') {
      throw new Error('Expected regular-page output');
    }

    const regularProjected = projected as Extract<
      ReturnType<typeof projectLiferayInventoryPageJson>,
      {page: {type: 'regularPage'}}
    >;

    expect(regularProjected.components?.fragments).toEqual([
      {
        fragmentKey: 'banner',
        fragmentSiteFriendlyUrl: '/global',
        fragmentExportPath: 'C:\\repo\\liferay\\fragments\\banner',
        contentSummary: 'title=Welcome',
      },
    ]);
    expect(regularProjected.contentRefs).toEqual([
      {
        articleId: 'ART-001',
        title: 'Home article',
        groupId: 20122,
        siteFriendlyUrl: '/global',
        siteName: 'Global',
        structureKey: 'BASIC',
        structureSiteFriendlyUrl: '/global',
        structureExportPath: 'C:\\repo\\liferay\\resources\\journal\\structures\\global\\BASIC.json',
        contentStructureId: 301,
        templateKey: 'BASIC_DETAIL',
        templateSiteFriendlyUrl: '/global',
        templateExportPath: 'C:\\repo\\liferay\\resources\\journal\\templates\\global\\BASIC_DETAIL.ftl',
      },
    ]);
    expect(JSON.stringify(regularProjected.contentRefs)).not.toContain('Long body');
  });

  test('projectLiferayInventoryPageJson derives display-page default template only from display-page rendered contents', () => {
    const projected = projectLiferayInventoryPageJson(
      {
        pageType: 'displayPage',
        pageSubtype: 'journalArticle',
        contentItemType: 'WebContent',
        siteName: 'Guest',
        siteFriendlyUrl: '/guest',
        groupId: 20121,
        url: '/web/guest/w/news-article',
        friendlyUrl: '/w/news-article',
        article: {
          id: 41001,
          key: 'ART-001',
          title: 'News article',
          friendlyUrlPath: 'news-article',
          contentStructureId: 301,
        },
        journalArticles: [
          {
            groupId: 20121,
            siteId: 20121,
            siteFriendlyUrl: '/guest',
            siteName: 'Guest',
            articleId: 'ART-001',
            title: 'News article',
            ddmStructureKey: 'NEWS',
            ddmStructureSiteFriendlyUrl: '/global',
            structureExportPath: 'C:\\repo\\liferay\\resources\\journal\\structures\\global\\NEWS.json',
            contentStructureId: 301,
            ddmTemplateKey: 'NEWS_WIDGET_TEMPLATE',
            ddmTemplateSiteFriendlyUrl: '/global',
            templateExportPath: 'C:\\repo\\liferay\\resources\\journal\\templates\\global\\NEWS_WIDGET_TEMPLATE.ftl',
            widgetDefaultTemplate: 'NEWS_WIDGET_TEMPLATE',
            renderedContents: [
              {
                contentTemplateName: 'NEWS_WIDGET_TEMPLATE',
                renderedContentURL:
                  'http://localhost:8080/o/headless-delivery/v1.0/structured-contents/41001/rendered-content/NEWS_WIDGET_TEMPLATE',
                markedAsDefault: true,
              },
              {
                contentTemplateName: 'NEWS_ARTICLE_DETAIL',
                renderedContentURL:
                  'http://localhost:8080/o/headless-delivery/v1.0/structured-contents/41001/rendered-content-by-display-page/news_article_detail',
                markedAsDefault: true,
              },
            ],
          },
        ],
        contentStructures: [],
      },
      {full: false},
    );

    if (!('rendering' in projected) || !projected.rendering) {
      throw new Error('Expected display-page rendering block');
    }

    expect(projected.rendering).toMatchObject({
      widgetDefaultTemplate: 'NEWS_WIDGET_TEMPLATE',
      displayPageDefaultTemplate: 'NEWS_ARTICLE_DETAIL',
      hasWidgetRendering: true,
      hasDisplayPageRendering: true,
    });
    expect(projected.article).toMatchObject({
      groupId: 20121,
      siteId: 20121,
      siteFriendlyUrl: '/guest',
      siteName: 'Guest',
      structureKey: 'NEWS',
      structureSiteFriendlyUrl: '/global',
      structureExportPath: 'C:\\repo\\liferay\\resources\\journal\\structures\\global\\NEWS.json',
      templateKey: 'NEWS_WIDGET_TEMPLATE',
      templateSiteFriendlyUrl: '/global',
      templateExportPath: 'C:\\repo\\liferay\\resources\\journal\\templates\\global\\NEWS_WIDGET_TEMPLATE.ftl',
    });
  });

  test('projectLiferayInventoryPageJson keeps display summaries on Liferay article fields', () => {
    const projected = projectLiferayInventoryPageJson({
      pageType: 'displayPage',
      pageSubtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteName: 'Facultat',
      siteFriendlyUrl: '/facultat',
      groupId: 27528220,
      url: '/web/facultat/w/news',
      friendlyUrl: '/w/news',
      article: {
        id: 48218747,
        key: '48218745',
        title: '20260204-La Dra. Mirèia Guil Egea guanya el premi',
        friendlyUrlPath: 'news',
        contentStructureId: 2685187,
      },
      journalArticles: [
        {
          articleId: '48218745',
          title: '20260204-La Dra. Mirèia Guil Egea guanya el premi',
          ddmStructureKey: 'UB_STR_NOVEDAD',
          description: '<p>Top-level Liferay description&nbsp;only</p>',
          contentFields: [
            {
              path: 'Títol',
              label: 'Títol',
              name: 'titulo',
              type: 'string',
              value: 'La Dra. Mirèia Guil Egea guanya el XXIX Premi 2025',
            },
            {
              path: 'Descripció',
              label: 'Descripció',
              name: 'descripcion',
              type: 'string',
              value: '<p>Investigadora del&nbsp;Programa de doctorat</p>',
            },
          ],
        },
      ],
    });

    if (!('contentSummary' in projected) || !projected.contentSummary) {
      throw new Error('Expected display-page content summary');
    }

    expect(projected.contentSummary).toMatchObject({
      headline: '20260204-La Dra. Mirèia Guil Egea guanya el premi',
      lead: 'Top-level Liferay description only',
    });
    expect(JSON.stringify(projected.contentSummary)).not.toContain('XXIX Premi');
  });

  test('projectLiferayInventoryPageJson decodes HTML entities only once in display summaries', () => {
    const projected = projectLiferayInventoryPageJson({
      pageType: 'displayPage',
      pageSubtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/w/news',
      friendlyUrl: '/w/news',
      article: {
        id: 41001,
        key: 'ART-001',
        title: 'AT&amp;T &amp;lt;safe&amp;gt;',
        friendlyUrlPath: 'news',
        contentStructureId: 301,
      },
      journalArticles: [
        {
          articleId: 'ART-001',
          title: 'AT&amp;T &amp;lt;safe&amp;gt;',
          ddmStructureKey: 'NEWS',
          description: '<p>Fish &amp;amp; Chips &amp;lt;b&amp;gt;literal&amp;lt;/b&amp;gt;</p>',
        },
      ],
    });

    if (!('contentSummary' in projected) || !projected.contentSummary) {
      throw new Error('Expected display-page content summary');
    }

    expect(projected.contentSummary).toMatchObject({
      headline: 'AT&T &lt;safe&gt;',
      lead: 'Fish &amp; Chips &lt;b&gt;literal&lt;/b&gt;',
    });
  });

  test('projectLiferayInventoryPageJson normalizes site-root output into the page envelope', () => {
    const projected = projectLiferayInventoryPageJson({
      pageType: 'siteRoot',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/',
      pages: [{layoutId: 11, friendlyUrl: '/home', name: 'Home', type: 'content'}],
    });

    expect(projected).toMatchObject({
      page: {
        type: 'siteRoot',
        siteName: 'Guest',
        siteFriendlyUrl: '/guest',
        groupId: 20121,
        url: '/web/guest/',
      },
      pages: [{layoutId: 11, friendlyUrl: '/home', name: 'Home', type: 'content'}],
    });
    expect(projected).not.toHaveProperty('pageType');
  });
});
