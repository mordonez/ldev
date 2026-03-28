import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceResolveAdt,
  matchesAdt,
  runLiferayResourceResolveAdt,
  templateIdFromDisplayStyle,
} from '../../src/features/liferay/resource/liferay-resource-resolve-adt.js';

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

describe('liferay resource resolve-adt', () => {
  test('parses display style into template id', () => {
    expect(templateIdFromDisplayStyle('ddmTemplate_19690804')).toBe('19690804');
    expect(templateIdFromDisplayStyle('19690804')).toBe('19690804');
    expect(templateIdFromDisplayStyle(undefined, '42')).toBe('42');
  });

  test('matches by template id, key, ERC or display name', () => {
    const item = {
      templateId: 19690804,
      templateKey: 'UB_ADT_ACTIVIDADES_SEARCH',
      externalReferenceCode: 'erc-adt',
      nameCurrentValue: 'UB ADT Actividades Search',
    };

    expect(matchesAdt(item, '19690804', '')).toBe(true);
    expect(matchesAdt(item, '', 'UB_ADT_ACTIVIDADES_SEARCH')).toBe(true);
    expect(matchesAdt(item, '', 'erc-adt')).toBe(true);
    expect(matchesAdt(item, '', 'UB ADT Actividades Search')).toBe(true);
    expect(matchesAdt(item, '999', '')).toBe(false);
  });

  test('resolves an ADT for a site and widget type', async () => {
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
          url.includes('classname/fetch-class-name?value=com.liferay.portlet.display.template.PortletDisplayTemplate')
        ) {
          return new Response('{"classNameId":2001}', {status: 200});
        }
        if (
          url.includes(
            'classname/fetch-class-name?value=com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext',
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
        if (url.includes('classname/fetch-class-name?value=')) {
          return new Response('{"classNameId":9999}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceResolveAdt(
      CONFIG,
      {
        site: '/global',
        displayStyle: 'ddmTemplate_19690804',
        widgetType: 'search-results',
      },
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.searchedSites).toEqual(['/global']);
    expect(result.matches).toEqual([
      {
        siteId: 20121,
        siteFriendlyUrl: '/global',
        siteName: 'Global',
        widgetType: 'search-result-summary',
        className: 'com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext',
        templateId: '19690804',
        displayStyle: 'ddmTemplate_19690804',
        templateKey: 'UB_ADT_ACTIVIDADES_SEARCH',
        adtName: 'UB ADT Actividades Search',
        displayName: 'UB ADT Actividades Search',
        externalReferenceCode: 'erc-adt',
      },
    ]);
  });

  test('formats text output and fails clearly when not found', async () => {
    const text = formatLiferayResourceResolveAdt({
      query: {
        site: '/global',
        displayStyle: null,
        id: '42',
        name: null,
        widgetType: 'search-result-summary',
        className: null,
      },
      searchedSites: ['/global'],
      matches: [
        {
          siteId: 20121,
          siteFriendlyUrl: '/global',
          siteName: 'Global',
          widgetType: 'search-result-summary',
          className: 'com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext',
          templateId: '42',
          displayStyle: 'ddmTemplate_42',
          templateKey: 'ADT_KEY',
          adtName: 'ADT Name',
          displayName: 'ADT Name',
          externalReferenceCode: 'erc',
        },
      ],
    });

    expect(text).toContain('RESOURCE_RESOLVE_ADT');
    expect(text).toContain('matches=1');
    expect(text).toContain(
      'site=/global widgetType=search-result-summary className=com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext templateId=42',
    );

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('classname/fetch-class-name?value=')) {
          return new Response('{"classNameId":9999}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?')) {
          return new Response('[]', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(
      runLiferayResourceResolveAdt(CONFIG, {site: '/global', id: '42'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('ADT no encontrada');
  });
});
