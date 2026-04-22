import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceTemplate,
  runLiferayResourceGetTemplate,
} from '../../src/features/liferay/resource/liferay-resource-get-template.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';

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

const TOKEN_CLIENT = createStaticTokenClient();

describe('liferay resource get-template', () => {
  test('matches template by id, key, erc and name', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    await expect(
      runLiferayResourceGetTemplate(CONFIG, {site: '/global', id: '40801'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).resolves.toMatchObject({templateId: '40801'});

    await expect(
      runLiferayResourceGetTemplate(
        CONFIG,
        {site: '/global', id: 'NEWS_TEMPLATE'},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).resolves.toMatchObject({templateKey: 'NEWS_TEMPLATE'});

    await expect(
      runLiferayResourceGetTemplate(
        CONFIG,
        {site: '/global', id: 'erc-news-template'},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).resolves.toMatchObject({externalReferenceCode: 'erc-news-template'});

    const result = await runLiferayResourceGetTemplate(
      CONFIG,
      {site: '/global', id: 'News Template'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.name).toBe('News Template');
    expect(formatLiferayResourceTemplate(result)).toContain('templateKey=NEWS_TEMPLATE');
  });

  test('falls back to company-level templates and errors when missing', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
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
          return new Response('[]', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=0&classNameId=1001&resourceClassNameId=1002&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"50001","templateKey":"GLOBAL_TEMPLATE","externalReferenceCode":"erc-global-template","nameCurrentValue":"Global Template","classPK":301,"script":"<#-- global -->"}]',
            {status: 200},
          );
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates')) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceGetTemplate(
      CONFIG,
      {site: '/global', id: 'GLOBAL_TEMPLATE'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.templateKey).toBe('GLOBAL_TEMPLATE');

    await expect(
      runLiferayResourceGetTemplate(CONFIG, {site: '/global', id: 'MISSING'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('Template not found');
  });

  test('falls back to global when a template is not found in the specified site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":30100,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=30100')) {
          return new Response(
            '{"companyId":10157,"parentGroupId":0,"friendlyURL":"/guest","nameCurrentValue":"Guest"}',
            {
              status: 200,
            },
          );
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response(
            '{"companyId":10157,"parentGroupId":0,"friendlyURL":"/global","nameCurrentValue":"Global"}',
            {
              status: 200,
            },
          );
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
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=30100')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121')) {
          return new Response(
            '[{"templateId":"50001","templateKey":"GLOBAL_TEMPLATE","externalReferenceCode":"erc-global-template","nameCurrentValue":"Global Template","classPK":301,"script":"<#-- global -->"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceGetTemplate(
      CONFIG,
      {site: '/guest', id: 'GLOBAL_TEMPLATE'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.siteFriendlyUrl).toBe('/global');
    expect(result.templateKey).toBe('GLOBAL_TEMPLATE');
  });
});
