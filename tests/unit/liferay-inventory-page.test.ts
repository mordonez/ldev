import {afterEach, describe, expect, test, vi} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayInventoryPage,
  resolveInventoryPageRequest,
  runLiferayInventoryPage,
} from '../../src/features/liferay/inventory/liferay-inventory-page.js';

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

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

afterEach(() => {
  vi.restoreAllMocks();
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

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayInventoryPage(
      CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toMatchObject({
      pageType: 'regularPage',
      pageSubtype: 'content',
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

    expect(result.fragmentEntryLinks).toEqual([
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

    expect(result).toMatchObject({
      pageType: 'displayPage',
      url: '/web/guest/w/news-article',
      article: {
        id: 41001,
        key: 'ART-001',
        title: 'News article',
      },
      journalArticles: [
        {
          articleId: 'ART-001',
          siteFriendlyUrl: '/guest',
          ddmStructureKey: 'NEWS',
          ddmTemplateKey: 'NEWS_TEMPLATE',
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
        },
      ],
    });
    if (result.pageType !== 'displayPage') {
      throw new Error('Expected display page');
    }
    expect('articleProperties' in result).toBe(false);
    expect(formatLiferayInventoryPage(result)).toContain('DISPLAY PAGE');
    expect(formatLiferayInventoryPage(result)).toContain('contentField Headline=News title');
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
