import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/liferay/client.js';
import {
  formatLiferayInventoryPage,
  resolveInventoryPageRequest,
  runLiferayInventoryPage,
} from '../../src/features/liferay/liferay-inventory-page.js';

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

    expect(
      resolveInventoryPageRequest({site: 'guest', friendlyUrl: '/w/news-article'}),
    ).toMatchObject({
      siteSlug: 'guest',
      friendlyUrl: '/w/news-article',
      route: 'displayPage',
      displayPageUrlTitle: 'news-article',
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
          return new Response(JSON.stringify({
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
          }), {status: 200});
        }

        if (url.includes('/fragment.fragmententrylink/get-fragment-entry-links')) {
          return new Response(JSON.stringify([
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
          ]), {status: 200});
        }

        if (url.includes('/journal.journalarticle/get-latest-article')) {
          return new Response(JSON.stringify({
            id: 41001,
            articleId: 'ART-001',
            titleCurrentValue: 'Home article',
            ddmStructureKey: 'BASIC',
          }), {status: 200});
        }

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(JSON.stringify({
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
          }), {status: 200});
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
        name: 'Basic Web Content',
      },
    ]);
    expect(formatLiferayInventoryPage(result)).toContain('REGULAR PAGE');
    expect(formatLiferayInventoryPage(result)).toContain('contentField Headline=Hello');
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

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(JSON.stringify({
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
          }), {status: 200});
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
    });
    if (result.pageType !== 'displayPage') {
      throw new Error('Expected display page');
    }
    expect(result.articleProperties?.contentFields).toEqual([
      {
        path: 'Headline',
        label: 'Headline',
        name: 'headline',
        type: 'string',
        value: 'News title',
      },
    ]);
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
