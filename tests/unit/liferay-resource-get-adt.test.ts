import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceAdt,
  runLiferayResourceGetAdt,
} from '../../src/features/liferay/resource/liferay-resource-get-adt.js';

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

describe('liferay resource adt', () => {
  test('reads one ADT in detail by display style', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
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
            '[{"templateId":40801,"templateKey":"SEARCH_RESULTS","nameCurrentValue":"Search Results","classNameId":3001,"script":"<#-- ftl -->"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceGetAdt(
      CONFIG,
      {site: '/global', displayStyle: 'ddmTemplate_40801', widgetType: 'search-results'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toEqual({
      siteFriendlyUrl: '/global',
      widgetType: 'search-result-summary',
      directory: 'search_result_summary',
      className: 'com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext',
      templateId: '40801',
      displayStyle: 'ddmTemplate_40801',
      templateKey: 'SEARCH_RESULTS',
      displayName: 'Search Results',
      adtName: 'Search Results',
      classNameId: 3001,
      script: '<#-- ftl -->',
    });
    expect(formatLiferayResourceAdt(result)).toContain('RESOURCE_ADT');
    expect(formatLiferayResourceAdt(result)).toContain('directory=search_result_summary');
  });

  test('falls back to /global when ADT is not found in the specified top-level site (parentGroupId=0)', async () => {
    // Real-world case: /facultat-educacio is a top-level site (parentGroupId=0) so the
    // parentGroupId walk yields nothing. The /global fallback must kick in automatically.
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        // Resolve child site /facultat-educacio by friendly URL
        if (url.includes('/by-friendly-url-path/facultat-educacio')) {
          return new Response('{"id":15506048,"friendlyUrlPath":"/facultat-educacio","name":"Facultat d\'Educació"}', {
            status: 200,
          });
        }
        // Resolve /global (used by both the /global fallback and resolveResourceSite inside listAdts)
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        // get-group for child site: parentGroupId=0 (top-level, no explicit parent)
        if (url.includes('/api/jsonws/group/get-group?groupId=15506048')) {
          return new Response(
            '{"companyId":10157,"parentGroupId":0,"friendlyURL":"/facultat-educacio","nameCurrentValue":"Facultat d\'Educació"}',
            {status: 200},
          );
        }
        // get-group for /global (companyId lookup inside resolveResourceSite)
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
        // No ADT in /facultat-educacio
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=15506048&classNameId=3001&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response('[]', {status: 200});
        }
        // ADT found in /global
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3001&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":19690805,"templateKey":"19690804","nameCurrentValue":"UB_ADT_ACTIVIDADES_SEARCH","classNameId":3001,"script":"<#-- ftl -->"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceGetAdt(
      CONFIG,
      {site: '/facultat-educacio', displayStyle: 'ddmTemplate_19690804', widgetType: 'search-results'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.siteFriendlyUrl).toBe('/global');
    expect(result.templateId).toBe('19690805');
    expect(result.templateKey).toBe('19690804');
    expect(result.adtName).toBe('UB_ADT_ACTIVIDADES_SEARCH');
  });

  test('searches accessible sites when --site is omitted', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=200')) {
          return new Response(
            '{"items":[{"id":30100,"friendlyUrlPath":"/guest","nameCurrentValue":"Guest"}],"lastPage":1}',
            {status: 200},
          );
        }
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":30100,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=30100')) {
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
          return new Response('[]', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=30100&classNameId=3001&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":50901,"templateKey":"GUEST_SEARCH_RESULTS","nameCurrentValue":"Guest Search Results","classNameId":3001,"script":"<#-- guest -->"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceGetAdt(
      CONFIG,
      {displayStyle: 'ddmTemplate_50901', widgetType: 'search-results'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.siteFriendlyUrl).toBe('/guest');
    expect(result.templateId).toBe('50901');
    expect(result.script).toBe('<#-- guest -->');
  });
});
