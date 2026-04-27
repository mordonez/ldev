import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';
import {
  captureProcessOutput,
  createLiferayCliRepoFixture,
  parseTestJson,
  toTestRequestUrl,
} from '../../src/testing/cli-test-helpers.js';

type InventoryPagesPayload = {
  inventoryType: string;
  siteFriendlyUrl: string;
  pageCount: number;
  pages: Array<{children?: Array<{fullUrl: string}>; targetUrl?: string}>;
};

type MinimalRegularPagePayload = {
  page: {
    type: string;
    subtype: string;
    uiType: string;
    siteFriendlyUrl: string;
    groupId: number;
    url: string;
    friendlyUrl: string;
    pageName: string;
    privateLayout: boolean;
    layoutId: number;
    plid: number;
    hidden: boolean;
  };
  summary: {
    layoutTemplateId?: string;
    targetUrl?: string;
    fragmentCount: number;
    widgetCount: number;
  };
  adminUrls: {
    view: string;
    edit: string;
    configureGeneral: string;
    configureDesign: string;
    configureSeo: string;
    configureOpenGraph: string;
    configureCustomMetaTags: string;
    translate: string;
  };
  configuration: {
    general: {
      type: string;
      name: string;
      friendlyUrl: string;
      privateLayout: boolean;
    };
  };
  components?: {
    fragments?: Array<{fragmentKey: string}>;
  };
  capabilities?: {
    componentInspectionSupported?: boolean;
  };
  layoutDetails?: unknown;
  configurationRaw?: unknown;
  fragmentEntryLinks?: unknown;
  journalArticles?: unknown;
  contentStructures?: unknown;
};

type FullRegularPagePayload = MinimalRegularPagePayload & {
  full: {
    layoutDetails?: {
      layoutTemplateId?: string;
      targetUrl?: string;
    };
    journalArticles?: Array<{articleId: string}>;
    contentStructures?: Array<{contentStructureId: number}>;
    components?: {
      fragments?: Array<{fragmentKey?: string}>;
      widgets?: Array<{
        widgetName?: string;
        portletId?: string;
        configuration?: Record<string, string>;
        elementName?: string;
        cssClasses?: string[];
        customCSS?: string;
      }>;
    };
  };
};

type MinimalDisplayPagePayload = {
  page: {
    type: string;
    subtype: string;
    contentItemType: string;
    siteFriendlyUrl: string;
    groupId: number;
    url: string;
    friendlyUrl: string;
  };
  article: {
    id: number;
    key: string;
    title: string;
    friendlyUrlPath: string;
    contentStructureId: number;
    structureKey?: string;
    externalReferenceCode?: string;
    uuid?: string;
  };
  adminUrls?: {
    edit: string;
    translate: string;
  };
  contentSummary?: {
    headline?: string;
    lead?: string;
  };
  rendering?: {
    widgetDefaultTemplate?: string;
    displayPageDefaultTemplate?: string;
    displayPageDdmTemplates?: string[];
    hasWidgetRendering: boolean;
    hasDisplayPageRendering: boolean;
  };
  taxonomy?: {
    categories: string[];
  };
  lifecycle?: {
    availableLanguages?: string[];
    dateCreated?: string;
    dateModified?: string;
    datePublished?: string;
    neverExpire?: boolean;
  };
  journalArticles?: unknown;
  contentStructures?: unknown;
};

type FullDisplayPagePayload = MinimalDisplayPagePayload & {
  full: {
    articleDetails?: {
      contentFields?: Array<{name: string; value: string}>;
      renderedContents?: Array<{contentTemplateName?: string}>;
      taxonomyCategoryBriefs?: Array<{taxonomyCategoryName?: string}>;
    };
    contentStructures?: Array<{contentStructureId: number}>;
  };
};

type SiteRootPayload = {
  page: {
    type: 'siteRoot';
    siteName?: string;
    siteFriendlyUrl: string;
    groupId: number;
    url: string;
  };
  pages: Array<{layoutId: number; friendlyUrl: string; name: string; type: string}>;
};

describe('liferay inventory smoke', () => {
  let repoRoot: string;
  let output: ReturnType<typeof captureProcessOutput>;

  beforeEach(async () => {
    repoRoot = await createLiferayCliRepoFixture('dev-cli-liferay-inventory-');
    output = captureProcessOutput();
  });

  afterEach(() => {
    output.restore();
    vi.unstubAllGlobals();
  });

  test('dev-cli liferay inventory sites works with fake fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

        if (url.endsWith('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":20116}]', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search-count')) {
          return new Response('"1"', {status: 200});
        }

        if (url.includes('/api/jsonws/group/search')) {
          return new Response('[{"groupId":101,"friendlyURL":"/guest","nameCurrentValue":"Guest","site":true}]', {
            status: 200,
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'sites'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    expect(output.stdout()).toContain('id=101');
    expect(output.stdout()).toContain('site=/guest');
    expect(output.stdout()).toContain('total=1');
    expect(output.stdout()).toContain('inventory pages --site /guest');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory pages lists a hierarchy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false},{"layoutId":12,"plid":1012,"type":"portlet","nameCurrentValue":"Tools","friendlyURL":"/tools","hidden":true,"typeSettings":"url=https://example.test"}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=11')) {
          return new Response(
            '[{"layoutId":21,"plid":2021,"type":"content","nameCurrentValue":"Child","friendlyURL":"/child","hidden":false}]',
            {status: 200},
          );
        }

        if (url.includes('parentLayoutId=12') || url.includes('parentLayoutId=21')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'pages', '--site', '/guest', '--format', 'json'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = parseTestJson<InventoryPagesPayload>(output.stdout());
    expect(parsed.inventoryType).toBe('pages');
    expect(parsed.siteFriendlyUrl).toBe('/guest');
    expect(parsed.pageCount).toBe(3);
    const firstChildPage = parsed.pages[0]?.children?.[0];
    expect(firstChildPage).toBeDefined();
    expect(firstChildPage?.fullUrl).toBe('/web/guest/child');
    expect(parsed.pages[1].targetUrl).toBe('https://example.test');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory structures --site works with fake fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (url.includes('/data-definitions/by-content-type/journal?page=1&pageSize=200')) {
          return new Response(
            '{"items":[{"id":301,"dataDefinitionKey":"BASIC","name":{"en_US":"Basic"}}],"lastPage":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'structures', '--site', '/global'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    expect(output.stdout()).toContain('id=301');
    expect(output.stdout()).toContain('key=BASIC');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory templates --site works with fake fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

        if (url.includes('/o/headless-admin-site/v1.0/sites/20121')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }

        if (url.includes('/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response(
            '{"items":[{"id":"40801","name":"News Template","contentStructureId":301}],"lastPage":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'templates', '--site', '20121'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    expect(output.stdout()).toContain('key=40801');
    expect(output.stdout()).toContain('structureId=301');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory page --url works for a regular page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

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
                      type: 'Widget',
                      name: 'Main journal widget',
                      cssClasses: ['widget-shell', 'widget-shell-primary'],
                      customCSS: '.widget-shell-primary { color: red; }',
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
            '{"id":41001,"articleId":"ART-001","titleCurrentValue":"Home article","ddmStructureKey":"BASIC"}',
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(
            '{"id":41001,"contentStructureId":301,"contentFields":[{"label":"Headline","name":"headline","dataType":"string","contentFieldValue":{"data":"Hello"}}]}',
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
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'page', '--url', '/web/guest/home'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    expect(output.stdout()).toContain('REGULAR PAGE');
    expect(output.stdout()).toContain('friendlyUrl=/home');
    expect(output.stdout()).toContain('contentField Headline=Hello');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory page --json returns the site root contract for a site home url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('parentLayoutId=0')) {
          return new Response(
            '[{"layoutId":11,"plid":1011,"type":"content","nameCurrentValue":"Home","friendlyURL":"/home","hidden":false}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'page', '--url', '/web/guest/', '--json'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = parseTestJson<SiteRootPayload>(output.stdout());
    expect(parsed).toMatchObject({
      page: {
        type: 'siteRoot',
        siteFriendlyUrl: '/guest',
        groupId: 20121,
        url: '/web/guest/',
      },
      pages: [{layoutId: 11, friendlyUrl: '/home', name: 'Home', type: 'content'}],
    });
    expect(parsed).not.toHaveProperty('full');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory page --json returns the minimal regular page contract by default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

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
                      name: 'Main journal widget',
                      cssClasses: ['widget-shell', 'widget-shell-primary'],
                      customCSS: '.widget-shell-primary { color: red; }',
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
            '{"id":41001,"articleId":"ART-001","titleCurrentValue":"Home article","ddmStructureKey":"BASIC"}',
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(
            '{"id":41001,"contentStructureId":301,"contentFields":[{"label":"Headline","name":"headline","dataType":"string","contentFieldValue":{"data":"Hello"}}]}',
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
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'page', '--url', '/web/guest/home', '--json'], {from: 'user'});
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = parseTestJson<MinimalRegularPagePayload>(output.stdout());
    expect(parsed.page).toMatchObject({
      type: 'regularPage',
      subtype: 'content',
      uiType: 'Content Page',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/home',
      friendlyUrl: '/home',
      pageName: 'Home',
      privateLayout: false,
      layoutId: 11,
      plid: 1011,
      hidden: false,
    });
    expect(parsed.summary).toMatchObject({
      layoutTemplateId: '2_columns',
      targetUrl: 'https://example.test',
      fragmentCount: 1,
      widgetCount: 1,
    });
    expect(parsed.configuration.general).toMatchObject({
      type: 'content',
      name: 'Home',
      friendlyUrl: '/home',
      privateLayout: false,
    });
    expect(parsed.components?.fragments).toEqual([{fragmentKey: 'banner'}]);
    expect(parsed.capabilities).toEqual({componentInspectionSupported: true});
    expect(parsed).not.toHaveProperty('layoutDetails');
    expect(parsed).not.toHaveProperty('configurationRaw');
    expect(parsed).not.toHaveProperty('fragmentEntryLinks');
    expect(parsed).not.toHaveProperty('journalArticles');
    expect(parsed).not.toHaveProperty('contentStructures');
    expect(parsed).not.toHaveProperty('full');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory page --json --full returns the regular page minimal contract plus inspection details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

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
                      name: 'Main journal widget',
                      cssClasses: ['widget-shell', 'widget-shell-primary'],
                      customCSS: '.widget-shell-primary { color: red; }',
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
            '{"id":41001,"articleId":"ART-001","titleCurrentValue":"Home article","ddmStructureKey":"BASIC"}',
            {status: 200},
          );
        }

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(
            '{"id":41001,"contentStructureId":301,"contentFields":[{"label":"Headline","name":"headline","dataType":"string","contentFieldValue":{"data":"Hello"}}]}',
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
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['liferay', 'inventory', 'page', '--url', '/web/guest/home', '--json', '--full'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = parseTestJson<FullRegularPagePayload>(output.stdout());
    expect(parsed.page).toMatchObject({type: 'regularPage', pageName: 'Home'});
    expect(parsed.full.layoutDetails).toEqual({
      layoutTemplateId: '2_columns',
      targetUrl: 'https://example.test',
    });
    expect(parsed.full.components?.fragments).toMatchObject([{fragmentKey: 'banner'}]);
    expect(parsed.full.components?.widgets).toMatchObject([
      {
        widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
        elementName: 'Main journal widget',
        cssClasses: ['widget-shell', 'widget-shell-primary'],
        customCSS: '.widget-shell-primary { color: red; }',
      },
    ]);
    expect(parsed.full.journalArticles).toMatchObject([{articleId: 'ART-001'}]);
    expect(parsed.full.contentStructures).toMatchObject([{contentStructureId: 301}]);
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory page --json returns the minimal display page contract by default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

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
            '{"id":41001,"resourcePrimKey":41001,"articleId":"ART-001","titleCurrentValue":"News article","ddmStructureKey":"NEWS","ddmTemplateKey":"NEWS_TEMPLATE","contentStructureId":301}',
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

        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure',
          )
        ) {
          return new Response('{"classNameId":1001}', {status: 200});
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
              title: 'News title from Liferay',
              description: '<p>Top-level Liferay description&nbsp;only</p>',
              contentStructureId: 301,
              externalReferenceCode: 'sample-erc-001',
              uuid: 'sample-uuid-001',
              availableLanguages: ['en-US', 'es-ES'],
              dateCreated: '2026-01-30T10:26:12Z',
              dateModified: '2026-04-19T21:53:09Z',
              datePublished: '2026-01-30T10:26:00Z',
              neverExpire: true,
              renderedContents: [
                {
                  contentTemplateName: 'NEWS_ARTICLE_DETAIL',
                  renderedContentURL:
                    '/o/headless-delivery/v1.0/structured-contents/41001/rendered-content-by-display-page/news_article_detail',
                  markedAsDefault: true,
                },
              ],
              taxonomyCategoryBriefs: [{taxonomyCategoryName: 'Category A'}, {taxonomyCategoryName: 'Category B'}],
              contentFields: [
                {
                  label: 'Headline',
                  name: 'headline',
                  dataType: 'string',
                  contentFieldValue: {data: 'News title'},
                },
                {
                  label: 'Lead',
                  name: 'lead',
                  dataType: 'string',
                  contentFieldValue: {data: 'Short lead extracted from content'},
                },
                {
                  label: 'Body',
                  name: 'body',
                  dataType: 'string',
                  contentFieldValue: {data: '<p>Short editorial preview for readers.</p>'},
                },
                {
                  label: 'Featured Image',
                  name: 'featuredImage',
                  dataType: 'image',
                  contentFieldValue: {
                    image: {
                      title: 'sample-image.jpg',
                      contentUrl: '/documents/sample-image.jpg',
                    },
                  },
                },
              ],
            }),
            {status: 200},
          );
        }

        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":1002}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(
        ['liferay', 'inventory', 'page', '--site', 'guest', '--friendly-url', '/w/news-article', '--format', 'json'],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = parseTestJson<MinimalDisplayPagePayload>(output.stdout());
    expect(parsed.page).toMatchObject({
      type: 'displayPage',
      subtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/w/news-article',
      friendlyUrl: '/w/news-article',
    });
    expect(parsed.article).toMatchObject({
      id: 41001,
      key: 'ART-001',
      title: 'News article',
      friendlyUrlPath: 'news-article',
      contentStructureId: 301,
      structureKey: 'NEWS',
      externalReferenceCode: 'sample-erc-001',
      uuid: 'sample-uuid-001',
    });
    expect(parsed.contentSummary).toEqual({
      headline: 'News article',
      lead: 'Top-level Liferay description only',
    });
    expect(JSON.stringify(parsed.contentSummary)).not.toContain('Short lead extracted from content');
    expect(parsed.rendering).toEqual({
      widgetDefaultTemplate: 'NEWS_TEMPLATE',
      displayPageDefaultTemplate: 'NEWS_ARTICLE_DETAIL',
      displayPageDdmTemplates: ['NEWS_TEMPLATE_DETAIL'],
      hasWidgetRendering: true,
      hasDisplayPageRendering: true,
    });
    expect(parsed.taxonomy).toEqual({categories: ['Category A', 'Category B']});
    expect(parsed.lifecycle).toEqual({
      availableLanguages: ['en-US', 'es-ES'],
      dateCreated: '2026-01-30T10:26:12Z',
      dateModified: '2026-04-19T21:53:09Z',
      datePublished: '2026-01-30T10:26:00Z',
      neverExpire: true,
    });
    expect(parsed).not.toHaveProperty('journalArticles');
    expect(parsed).not.toHaveProperty('contentStructures');
    expect(parsed).not.toHaveProperty('full');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory page --json --full returns the display page minimal contract plus article details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        await Promise.resolve();
        const url = toTestRequestUrl(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }

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
            '{"id":41001,"resourcePrimKey":41001,"articleId":"ART-001","titleCurrentValue":"News article","ddmStructureKey":"NEWS","ddmTemplateKey":"NEWS_TEMPLATE","contentStructureId":301}',
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
              externalReferenceCode: 'sample-erc-001',
              uuid: 'sample-uuid-001',
              renderedContents: [
                {
                  contentTemplateName: 'NEWS_ARTICLE_DETAIL',
                  renderedContentURL:
                    '/o/headless-delivery/v1.0/structured-contents/41001/rendered-content-by-display-page/news_article_detail',
                  markedAsDefault: true,
                },
              ],
              taxonomyCategoryBriefs: [{taxonomyCategoryName: 'Category A'}, {taxonomyCategoryName: 'Category B'}],
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
          return new Response('{"id":301,"name":"News"}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(
        ['liferay', 'inventory', 'page', '--site', 'guest', '--friendly-url', '/w/news-article', '--json', '--full'],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = parseTestJson<FullDisplayPagePayload>(output.stdout());
    expect(parsed.page).toMatchObject({type: 'displayPage', friendlyUrl: '/w/news-article'});
    expect(parsed.full.articleDetails?.contentFields).toMatchObject([{name: 'headline', value: 'News title'}]);
    expect(parsed.full.articleDetails?.renderedContents).toMatchObject([{contentTemplateName: 'NEWS_ARTICLE_DETAIL'}]);
    expect(parsed.full.articleDetails?.taxonomyCategoryBriefs).toMatchObject([
      {taxonomyCategoryName: 'Category A'},
      {taxonomyCategoryName: 'Category B'},
    ]);
    expect(parsed.full.contentStructures).toMatchObject([{contentStructureId: 301}]);
    expect(output.stderr()).toBe('');
  });
});
