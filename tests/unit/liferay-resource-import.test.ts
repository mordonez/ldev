import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test, vi} from 'vitest';

import {runLiferayResourceExportAdts} from '../../src/features/liferay/liferay-resource-export-adts.js';
import {createLiferayApiClient} from '../../src/core/http/client.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const syncAdtMock = vi.fn();

vi.mock('../../src/features/liferay/liferay-resource-sync-adt.js', () => ({
  runLiferayResourceSyncAdt: syncAdtMock,
}));

const {runLiferayResourceImportAdts} = await import('../../src/features/liferay/liferay-resource-import-adts.js');

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

describe('liferay resource import', () => {
  test('export-adts with custom dir keeps the site token in the output layout', async () => {
    const dir = createTempDir('dev-cli-resource-export-adts-site-dir-');
    const config = {
      ...CONFIG,
      repoRoot: dir,
      cwd: dir,
      dockerDir: path.join(dir, 'docker'),
      liferayDir: path.join(dir, 'liferay'),
      files: {
        dockerEnv: path.join(dir, 'docker', '.env'),
        liferayProfile: path.join(dir, '.liferay-cli.yml'),
      },
      paths: {
        structures: 'liferay/resources/journal/structures',
        templates: 'liferay/resources/journal/templates',
        adts: 'liferay/resources/templates/application_display',
        fragments: 'liferay/fragments',
      },
    };
    await fs.ensureDir(path.join(dir, 'docker'));
    await fs.writeFile(path.join(dir, 'docker', '.env'), '');

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
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=')) {
          return new Response('{"classNameId":3999}', {status: 200});
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
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3002&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response('[]', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3999&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceExportAdts(
      config,
      {site: '/global', dir: '.tmp/adts-export'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.outputDir).toBe(path.join(dir, '.tmp', 'adts-export', 'global'));
    expect(
      await fs.readFile(
        path.join(dir, '.tmp', 'adts-export', 'global', 'search_result_summary', 'SEARCH_RESULTS.ftl'),
        'utf8',
      ),
    ).toBe('<#-- ftl -->');
  });

  test('import-adts accepts a direct single-site directory without an intermediate site token folder', async () => {
    const dir = createTempDir('dev-cli-resource-import-adts-direct-dir-');
    const config = {
      ...CONFIG,
      repoRoot: dir,
      cwd: dir,
      dockerDir: path.join(dir, 'docker'),
      liferayDir: path.join(dir, 'liferay'),
      files: {
        dockerEnv: path.join(dir, 'docker', '.env'),
        liferayProfile: path.join(dir, '.liferay-cli.yml'),
      },
      paths: {
        structures: 'liferay/resources/journal/structures',
        templates: 'liferay/resources/journal/templates',
        adts: 'liferay/resources/templates/application_display',
        fragments: 'liferay/fragments',
      },
    };
    await fs.ensureDir(path.join(dir, 'docker'));
    await fs.writeFile(path.join(dir, 'docker', '.env'), '');
    const directDir = path.join(dir, '.tmp', 'adts-direct', 'search_result_summary');
    await fs.ensureDir(directDir);
    await fs.writeFile(path.join(directDir, 'SEARCH_RESULTS.ftl'), '<#-- changed -->');

    syncAdtMock.mockReset();
    syncAdtMock.mockImplementation(async () => ({
      status: 'updated',
      id: 'SEARCH_RESULTS',
      name: 'SEARCH_RESULTS',
      extra: 'search-result-summary',
      adtFile: path.join(directDir, 'SEARCH_RESULTS.ftl'),
      widgetType: 'search-result-summary',
      siteId: 20121,
      siteFriendlyUrl: '/global',
    }));

    const result = await runLiferayResourceImportAdts(config, {
      site: '/global',
      dir: '.tmp/adts-direct',
      widgetType: 'search-result-summary',
    });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(syncAdtMock).toHaveBeenCalledTimes(1);
    expect(syncAdtMock.mock.calls[0]?.[1]).toMatchObject({
      site: '/global',
      widgetType: 'search-result-summary',
      file: path.join(directDir, 'SEARCH_RESULTS.ftl'),
    });
  });
});
