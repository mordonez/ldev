import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/liferay/client.js';
import {formatLiferayResourceAdts, runLiferayResourceListAdts} from '../../src/features/liferay/liferay-resource-list-adts.js';
import {
  formatLiferayResourceFragments,
  runLiferayResourceListFragments,
} from '../../src/features/liferay/liferay-resource-list-fragments.js';

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

describe('liferay resource list', () => {
  test('lists ADTs and supports widget type filter', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portlet.display.template.PortletDisplayTemplate')) {
          return new Response('{"classNameId":2001}', {status: 200});
        }
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext')) {
          return new Response('{"classNameId":3001}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3001&resourceClassNameId=2001&status=0')) {
          return new Response(
            '[{"templateId":40801,"templateKey":"SEARCH_RESULTS","nameCurrentValue":"Search Results","classNameId":3001,"script":"<#-- ftl -->"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.asset.kernel.model.AssetEntry')) {
          return new Response('{"classNameId":3002}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3002&resourceClassNameId=2001&status=0')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceListAdts(
      CONFIG,
      {site: '/global', widgetType: 'search-results', includeScript: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toEqual([
      {
        adtName: 'Search Results',
        displayName: 'Search Results',
        widgetType: 'search-result-summary',
        templateId: 40801,
        templateKey: 'SEARCH_RESULTS',
        classNameId: 3001,
        script: '<#-- ftl -->',
      },
    ]);
    expect(formatLiferayResourceAdts(result)).toContain('search-result-summary\t40801\tSEARCH_RESULTS\tSearch Results');
  });

  test('lists fragment collections and fragments', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
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
      },
    });

    const result = await runLiferayResourceListFragments(CONFIG, {site: '/global'}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result).toEqual([
      {
        fragmentId: 601,
        fragmentKey: 'hero-banner',
        fragmentName: 'Hero Banner',
        collectionId: 501,
        collectionName: 'Marketing',
        collectionKey: 'marketing',
        collectionDescription: 'Marketing fragments',
        icon: 'square',
        type: 1,
      },
    ]);
    expect(formatLiferayResourceFragments(result)).toContain('601\thero-banner\tMarketing');
  });

  test('surfaces fragment listing errors clearly', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        return new Response('boom', {status: 500});
      },
    });

    await expect(
      runLiferayResourceListFragments(CONFIG, {site: '/global'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('fragment collections failed with status=500');
  });
});
