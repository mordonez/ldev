import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';
import {captureProcessOutput, createLiferayCliRepoFixture} from '../../src/testing/cli-test-helpers.js';

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
        const url = String(input);

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
        const url = String(input);

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

    const parsed = JSON.parse(output.stdout());
    expect(parsed.inventoryType).toBe('pages');
    expect(parsed.siteFriendlyUrl).toBe('/guest');
    expect(parsed.pageCount).toBe(3);
    expect(parsed.pages[0].children[0].fullUrl).toBe('/web/guest/child');
    expect(parsed.pages[1].targetUrl).toBe('https://example.test');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay inventory structures --site works with fake fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

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
        const url = String(input);

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
        const url = String(input);

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

  test('dev-cli liferay inventory page supports json output for a display page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

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

        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/41001')) {
          return new Response(
            '{"id":41001,"contentStructureId":301,"contentFields":[{"label":"Headline","name":"headline","dataType":"string","contentFieldValue":{"data":"News title"}}]}',
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
      await cli.parseAsync(
        ['liferay', 'inventory', 'page', '--site', 'guest', '--friendly-url', '/w/news-article', '--format', 'json'],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.pageType).toBe('displayPage');
    expect(parsed.article.key).toBe('ART-001');
    expect(parsed.journalArticles[0].contentFields[0].value).toBe('News title');
    expect(output.stderr()).toBe('');
  });
});
