import fs from 'fs-extra';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';
import {captureProcessOutput, createLiferayCliRepoFixture} from '../../src/testing/cli-test-helpers.js';

describe('liferay resource smoke', () => {
  let repoRoot: string;
  let output: ReturnType<typeof captureProcessOutput>;

  beforeEach(async () => {
    repoRoot = await createLiferayCliRepoFixture('dev-cli-liferay-resource-');
    output = captureProcessOutput();
  });

  afterEach(() => {
    output.restore();
    vi.unstubAllGlobals();
  });

  test('dev-cli liferay resource structure works with fake fetch', async () => {
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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC-WEB-CONTENT')) {
          return new Response(
            '{"id":301,"dataDefinitionKey":"BASIC-WEB-CONTENT","name":{"en_US":"Basic Web Content"}}',
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
      await cli.parseAsync(['resource', 'structure', '--site', '/global', '--key', 'BASIC-WEB-CONTENT'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.key).toBe('BASIC-WEB-CONTENT');
    expect(parsed.siteFriendlyUrl).toBe('/global');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource template works with fake fetch', async () => {
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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
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
            '[{"templateId":"40801","templateKey":"NEWS_TEMPLATE","externalReferenceCode":"erc-news-template","nameCurrentValue":"News Template","classPK":301,"script":"<#-- ftl -->"}]',
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
      await cli.parseAsync(['resource', 'template', '--site', '/global', '--id', 'NEWS_TEMPLATE'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.templateKey).toBe('NEWS_TEMPLATE');
    expect(parsed.externalReferenceCode).toBe('erc-news-template');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource export-structure writes to file', async () => {
    const outputPath = path.join(repoRoot, 'exports', 'structure.json');

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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC-WEB-CONTENT')) {
          return new Response(
            '{"id":301,"dataDefinitionKey":"BASIC-WEB-CONTENT","name":{"en_US":"Basic Web Content"}}',
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
        ['resource', 'export-structure', '--site', '/global', '--key', 'BASIC-WEB-CONTENT', '--output', outputPath],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    expect(JSON.parse(output.stdout())).toEqual({outputPath: path.resolve(outputPath)});
    const written = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(written.dataDefinitionKey).toBe('BASIC-WEB-CONTENT');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource export-template writes to file', async () => {
    const outputPath = path.join(repoRoot, 'exports', 'template.ftl');

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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
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
            '[{"templateId":"40801","templateKey":"NEWS_TEMPLATE","externalReferenceCode":"erc-news-template","nameCurrentValue":"News Template","classPK":301,"script":"<#-- ftl -->"}]',
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
        ['resource', 'export-template', '--site', '/global', '--id', 'NEWS_TEMPLATE', '--output', outputPath],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    expect(JSON.parse(output.stdout())).toEqual({outputPath: path.resolve(outputPath)});
    const written = await fs.readFile(outputPath, 'utf8');
    expect(written).toBe('<#-- ftl -->');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource export-template sanitizes volatile p_p_auth tokens', async () => {
    const outputPath = path.join(repoRoot, 'exports', 'template-sanitized.ftl');

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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
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
            '[{"templateId":"40801","templateKey":"NEWS_TEMPLATE","externalReferenceCode":"erc-news-template","nameCurrentValue":"News Template","classPK":301,"script":"<a href=\\"http://localhost:8080/web/guest/home?p_l_back_url=%2Fgroup%2Fguest&p_p_auth=1QcBPYiy\\">link</a>"}]',
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
        ['resource', 'export-template', '--site', '/global', '--id', 'NEWS_TEMPLATE', '--output', outputPath],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    const written = await fs.readFile(outputPath, 'utf8');
    expect(written).toBe('<a href="/web/guest/home?p_l_back_url=%2Fgroup%2Fguest">link</a>');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource export-structures writes site-scoped files', async () => {
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
        if (
          url.includes('/o/data-engine/v2.0/sites/20121/data-definitions/by-content-type/journal?page=1&pageSize=200')
        ) {
          return new Response(
            '{"items":[{"id":301,"dataDefinitionKey":"BASIC-WEB-CONTENT","name":{"en_US":"Basic Web Content"}}],"lastPage":1,"page":1,"pageSize":200,"totalCount":1}',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC-WEB-CONTENT')) {
          return new Response(
            '{"id":301,"dataDefinitionKey":"BASIC-WEB-CONTENT","name":{"en_US":"Basic Web Content"}}',
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
      await cli.parseAsync(['resource', 'export-structures', '--site', '/global', '--format', 'json'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.processed).toBe(1);
    const written = JSON.parse(
      await fs.readFile(
        path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global', 'BASIC-WEB-CONTENT.json'),
        'utf8',
      ),
    );
    expect(written.dataDefinitionKey).toBe('BASIC-WEB-CONTENT');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource export-templates writes site-scoped files', async () => {
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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response(
            '{"items":[{"id":"40801","name":"News Template","contentStructureId":301,"externalReferenceCode":"NEWS_TEMPLATE","templateScript":"<#-- ftl -->"}],"lastPage":1,"page":1,"pageSize":200,"totalCount":1}',
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
      await cli.parseAsync(['resource', 'export-templates', '--site', '/global', '--format', 'json'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.exported).toBe(1);
    const written = await fs.readFile(
      path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'global', 'NEWS_TEMPLATE.ftl'),
      'utf8',
    );
    expect(written).toBe('<#-- ftl -->');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource export-templates sanitizes volatile p_p_auth tokens', async () => {
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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response(
            '{"items":[{"id":"40801","name":"News Template","contentStructureId":301,"externalReferenceCode":"NEWS_TEMPLATE","templateScript":"<a href=\\"http://localhost:8080/web/guest/home?p_l_back_url=%2Fgroup%2Fguest&p_p_auth=1QcBPYiy\\">link</a>"}],"lastPage":1,"page":1,"pageSize":200,"totalCount":1}',
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
      await cli.parseAsync(['resource', 'export-templates', '--site', '/global', '--format', 'json'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const written = await fs.readFile(
      path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'global', 'NEWS_TEMPLATE.ftl'),
      'utf8',
    );
    expect(written).toBe('<a href="/web/guest/home?p_l_back_url=%2Fgroup%2Fguest">link</a>');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource adts works with fake fetch', async () => {
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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.portlet.display.template.PortletDisplayTemplate',
          )
        ) {
          return new Response('{"classNameId":2001}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext',
          )
        ) {
          return new Response('{"classNameId":3001}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3001&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":40801,"templateKey":"SEARCH_RESULTS","nameCurrentValue":"Search Results","classNameId":3001}]',
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
        ['resource', 'adts', '--site', '/global', '--widget-type', 'search-results', '--format', 'json'],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed[0].templateKey).toBe('SEARCH_RESULTS');
    expect(parsed[0].widgetType).toBe('search-result-summary');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource resolve-adt works with fake fetch', async () => {
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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.portlet.display.template.PortletDisplayTemplate',
          )
        ) {
          return new Response('{"classNameId":2001}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext',
          )
        ) {
          return new Response('{"classNameId":3001}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3001&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"19690804","templateKey":"UB_ADT_ACTIVIDADES_SEARCH","externalReferenceCode":"erc-adt","nameCurrentValue":"UB ADT Actividades Search"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=')) {
          return new Response('{"classNameId":9999}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?')) {
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
      await cli.parseAsync(
        [
          'resource',
          'resolve-adt',
          '--display-style',
          'ddmTemplate_19690804',
          '--site',
          '/global',
          '--widget-type',
          'search-results',
          '--format',
          'json',
        ],
        {from: 'user'},
      );
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].templateId).toBe('19690804');
    expect(parsed.matches[0].widgetType).toBe('search-result-summary');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource fragments works with fake fetch', async () => {
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
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20121')) {
          return new Response(
            '[{"fragmentCollectionId":501,"name":"Marketing","fragmentCollectionKey":"marketing","description":"Marketing fragments"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=501')) {
          return new Response(
            '[{"fragmentEntryId":601,"fragmentEntryKey":"hero-banner","name":"Hero Banner","icon":"square","type":1}]',
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
      await cli.parseAsync(['resource', 'fragments', '--site', '/global', '--format', 'json'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed[0].fragmentKey).toBe('hero-banner');
    expect(parsed[0].collectionName).toBe('Marketing');
    expect(output.stderr()).toBe('');
  });

  test('dev-cli liferay resource import-fragments works with fake fetch', async () => {
    const fragmentDir = path.join(
      repoRoot,
      'liferay',
      'fragments',
      'sites',
      'global',
      'src',
      'marketing',
      'fragments',
      'hero-banner',
    );
    await fs.ensureDir(fragmentDir);
    await fs.writeFile(
      path.join(repoRoot, 'liferay', 'fragments', 'sites', 'global', 'src', 'marketing', 'collection.json'),
      '{"name":"Marketing"}',
    );
    await fs.writeFile(
      path.join(fragmentDir, 'fragment.json'),
      '{"name":"Hero Banner","icon":"square","type":"section"}',
    );
    await fs.writeFile(path.join(fragmentDir, 'index.html'), '<div>banner</div>');
    await fs.writeFile(path.join(fragmentDir, 'index.css'), '.banner{}');
    await fs.writeFile(path.join(fragmentDir, 'index.js'), 'console.log("banner");');
    await fs.writeFile(path.join(fragmentDir, 'configuration.json'), '{}');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/o/oauth2/token')) {
          return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {
            status: 200,
          });
        }
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20121')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/add-fragment-collection')) {
          return new Response('{"fragmentCollectionId":501,"fragmentCollectionKey":"marketing"}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=501')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/add-fragment-entry')) {
          const form = new URLSearchParams(String(init?.body ?? ''));
          expect(form.get('fragmentEntryKey')).toBe('hero-banner');
          return new Response('{"fragmentEntryId":601}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    );

    const originalCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      const cli = createCli();
      cli.exitOverride();
      await cli.parseAsync(['resource', 'import-fragments', '--site', '/global', '--format', 'json'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
    }

    const parsed = JSON.parse(output.stdout());
    expect(parsed.summary.importedFragments).toBe(1);
    expect(parsed.summary.errors).toBe(0);
    expect(parsed.fragmentResults[0].fragment).toBe('hero-banner');
    expect(output.stderr()).toBe('');
  });
});
