import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/liferay/client.js';
import {
  formatLiferayResourceSyncAdt,
  runLiferayResourceSyncAdt,
} from '../../src/features/liferay/liferay-resource-sync-adt.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

async function createRepoFixture() {
  const repoRoot = createTempDir('dev-cli-resource-sync-adt-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'templates', 'application_display', 'global', 'search_result_summary'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');

  const adtFile = path.join(
    repoRoot,
    'liferay',
    'resources',
    'templates',
    'application_display',
    'global',
    'search_result_summary',
    'UB_ADT.ftl',
  );
  await fs.writeFile(adtFile, 'ADT local script');

  return {
    adtFile,
    config: {
      cwd: repoRoot,
      repoRoot,
      dockerDir: path.join(repoRoot, 'docker'),
      liferayDir: path.join(repoRoot, 'liferay'),
      files: {
        dockerEnv: path.join(repoRoot, 'docker', '.env'),
        liferayProfile: null,
      },
      liferay: {
        url: 'http://localhost:8080',
        oauth2ClientId: 'client-id',
        oauth2ClientSecret: 'client-secret',
        scopeAliases: 'scope-a',
        timeoutSeconds: 30,
      },
      paths: {
        structures: 'liferay/resources/journal/structures',
        templates: 'liferay/resources/journal/templates',
        adts: 'liferay/resources/templates/application_display',
        fragments: 'liferay/fragments',
      },
    },
  };
}

describe('liferay resource adt-sync', () => {
  test('creates a missing ADT from a local file', async () => {
    const {config, adtFile} = await createRepoFixture();
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global","companyId":20097}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":20097}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.portlet.display.template.PortletDisplayTemplate')) {
          return new Response('{"classNameId":777}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.portal.search.web.internal.result.display.context.SearchResultSummaryDisplayContext')) {
          return new Response('{"classNameId":888}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/add-template')) {
          const form = new URLSearchParams(String(init?.body ?? ''));
          expect(form.get('groupId')).toBe('20121');
          expect(form.get('script')).toBe('ADT local script');
          expect(form.get('classNameId')).toBe('888');
          expect(form.get('resourceClassNameId')).toBe('777');
          return new Response('{"templateId":"991","templateKey":"UB_ADT"}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncAdt(
      config,
      {site: '/global', file: adtFile, createMissing: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('created');
    expect(result.id).toBe('UB_ADT');
    expect(result.widgetType).toBe('search-result-summary');
    expect(formatLiferayResourceSyncAdt(result)).toContain('created\tsearch-result-summary\tUB_ADT\tUB_ADT');
  });
});
