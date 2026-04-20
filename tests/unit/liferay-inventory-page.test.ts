import {afterEach, describe, expect, test, vi} from 'vitest';
import path from 'node:path';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayInventoryPage,
  resolveInventoryPageRequest,
  runLiferayInventoryPage,
} from '../../src/features/liferay/inventory/liferay-inventory-page.js';
import {validateLiferayInventoryPageResultV2} from '../../src/features/liferay/inventory/liferay-inventory-page-schema.js';

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

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('liferay inventory page', () => {
  test('resolves requests from full URLs and explicit site/friendly-url', () => {
    expect(resolveInventoryPageRequest({url: '/web/guest/home'})).toMatchObject({
      siteSlug: 'guest',
      friendlyUrl: '/home',
      privateLayout: false,
      route: 'regularPage',
    });

    expect(resolveInventoryPageRequest({url: 'https://example.test/group/guest/private-page'})).toMatchObject({
      siteSlug: 'guest',
      friendlyUrl: '/private-page',
      privateLayout: true,
      route: 'regularPage',
    });

    expect(resolveInventoryPageRequest({site: 'guest', friendlyUrl: '/w/news-article'})).toMatchObject({
      siteSlug: 'guest',
      friendlyUrl: '/w/news-article',
      route: 'displayPage',
      displayPageUrlTitle: 'news-article',
    });

    expect(resolveInventoryPageRequest({url: 'https://example.test/es/web/guest/aprende'})).toMatchObject({
      siteSlug: 'guest',
      friendlyUrl: '/aprende',
      privateLayout: false,
      route: 'regularPage',
      localeHint: 'es_ES',
    });
  });

  test('ignores absolute URL origin and keeps configured portal URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled for test'));

    const seenUrls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        seenUrls.push(url);

        if (!url.startsWith('http://localhost:8080/')) {
          throw new Error(`Unexpected portal origin ${url}`);
        }

        if (url.includes('/by-friendly-url-path/facultat-economia-empresa')) {
          return new Response(
            '{"id":15503412,"friendlyUrlPath":"/facultat-economia-empresa","name":"Facultat d’Economia i Empresa"}',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
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
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/projecte-recerca-foodcircuits')) {
          return new Response(
            '{"id":20117,"friendlyUrlPath":"/projecte-recerca-foodcircuits","name":"Projecte Recerca Foodcircuits"}',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":7144,"plid":7143,"type":"content","nameCurrentValue":"Inici","friendlyURL":"/inici","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('/site-pages/inici?fields=pageDefinition')) {
          return new Response(JSON.stringify({pageDefinition: {pageElement: {type: 'Root', pageElements: []}}}), {
            status: 200,
          });
        }

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response('[]', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return new Response('{"classNameId":20006}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
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
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false,"typeSettings":"layout-template-id=2_columns\\nurl=https://example.test"}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response('[]', {status: 200});
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

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response(
            JSON.stringify([
              {
                portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc',
                editableValues: JSON.stringify({
                  journal_content: {
                    portletPreferencesMap: {
                      articleId: ['ART-001'],
                      groupId: ['20121'],
                      ddmTemplateKey: ['TPL-1'],
                    },
                  },
                }),
              },
            ]),
            {status: 200},
          );
        }

        if (url.includes('/journal.journalarticle/get-latest-article')) {
          return new Response(
            JSON.stringify({
              id: 41001,
              articleId: 'ART-001',
              titleCurrentValue: 'Home article',
              ddmStructureKey: 'BASIC',
            }),
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
                  contentFieldValue: {data: 'Hello'},
                },
              ],
            }),
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/content-structures/301')) {
          return new Response('{"id":301,"name":"Basic Web Content"}', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return new Response('{"classNameId":20006}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();

    expect(result).toMatchObject({
      contractVersion: '2',
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
        portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc',
      },
    ]);
    expect(result.journalArticles).toEqual([
      {
        groupId: 20121,
        articleId: 'ART-001',
        title: 'Home article',
        ddmStructureKey: 'BASIC',
        ddmTemplateKey: 'TPL-1',
        contentStructureId: 301,
        contentFields: [
          {
            path: 'Headline',
            label: 'Headline',
            name: 'headline',
            type: 'string',
            value: 'Hello',
          },
        ],
      },
    ]);
    expect(result.contentStructures).toEqual([
      {
        contentStructureId: 301,
        key: 'BASIC',
        name: 'Basic Web Content',
      },
    ]);
    expect(formatLiferayInventoryPage(result)).toContain('REGULAR PAGE');
    expect(formatLiferayInventoryPage(result)).toContain('contentField Headline=Hello');
  });

  test('skips local fragment export path enrichment outside a repo', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response('[]', {status: 200});
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

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response('[]', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return new Response('{"classNameId":20006}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
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
    const [fragmentEntry] = result.fragmentEntryLinks ?? [];
    if (!fragmentEntry) {
      throw new Error('Expected fragment entry');
    }
    expect(fragmentEntry).not.toHaveProperty('fragmentExportPath');
    expect(fragmentEntry).not.toHaveProperty('fragmentSiteFriendlyUrl');
  });

  test('returns classic portlet layout composition from type settings', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            JSON.stringify([
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
            ]),
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();

    expect(result).toMatchObject({
      contractVersion: '2',
      pageType: 'regularPage',
      pageSubtype: 'portlet',
      pageUiType: 'Widget Page',
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
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/ub')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/ub","name":"UB"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Inici","friendlyURL":"/inici","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('/site-pages/inici?fields=pageDefinition')) {
          return new Response(JSON.stringify({pageDefinition: {pageElement: {type: 'Root', pageElements: []}}}), {
            status: 200,
          });
        }

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response('[]', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return new Response('{"classNameId":20006}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
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
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":"11","plid":"1011","type":"content","nameCurrentValue":"Aprende","friendlyURL":"/apren","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response('[]', {status: 200});
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
          return new Response(
            JSON.stringify({
              pageDefinition: {
                pageElement: {
                  type: 'Root',
                  pageElements: [],
                },
              },
            }),
            {status: 200},
          );
        }

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response('[]', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return new Response('{"classNameId":20006}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
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
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":"11","plid":"1011","type":"content","nameCurrentValue":"Aprende","friendlyURL":"/apren","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response('[]', {status: 200});
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
          return new Response(
            JSON.stringify({
              pageDefinition: {
                pageElement: {
                  type: 'Root',
                  pageElements: [],
                },
              },
            }),
            {status: 200},
          );
        }

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response('[]', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return new Response('{"classNameId":20006}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
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
    const tokenClient = {
      fetchClientCredentialsToken: async () => {
        tokenCalls += 1;
        return {
          accessToken: 'token-123',
          tokenType: 'Bearer',
          expiresIn: 3600,
        };
      },
    };

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('/site-pages/home?fields=pageDefinition')) {
          return new Response(
            JSON.stringify({
              pageDefinition: {
                pageElement: {
                  type: 'Root',
                  pageElements: [],
                },
              },
            }),
            {status: 200},
          );
        }

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response('[]', {status: 200});
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.kernel.model.Layout')) {
          return new Response('{"classNameId":20006}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await runLiferayInventoryPage(config, {url: '/web/guest/home'}, {apiClient, tokenClient});

    expect(tokenCalls).toBe(1);
  });

  test('includes fragment image editables when Liferay returns fragmentImage payloads', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response('[]', {status: 200});
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

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
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
      },
    ]);
    expect(formatLiferayInventoryPage(result)).toContain('[image] Demo image');
  });

  test('returns display page inventory for structured content', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

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
            {
              status: 200,
            },
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
          return new Response('{"classNameId":20006}', {status: 200});
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

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {site: 'guest', friendlyUrl: '/w/news-article'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(() => validateLiferayInventoryPageResultV2(result)).not.toThrow();

    expect(result).toMatchObject({
      contractVersion: '2',
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
      fetchImpl: async (input) => {
        const url = String(input);

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
      },
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
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        return new Response('[]', {status: 200});
      },
    });

    await expect(
      runLiferayInventoryPage(CONFIG, {url: '/web/guest/missing'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('Layout not found');
  });
});
