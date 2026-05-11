import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {runLiferayResourceSyncTemplate} from '../../src/features/liferay/resource/liferay-resource-sync-template.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = createStaticTokenClient();

describe('liferay resource template-sync site inference', () => {
  test('infers site from template file path when site is omitted', async () => {
    const repoRoot = createTempDir('dev-cli-resource-sync-template-site-inference-');
    const templateDir = path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'actualitat');
    const templateFile = path.join(templateDir, 'BASIC.ftl');

    await fs.ensureDir(path.join(repoRoot, 'docker'));
    await fs.ensureDir(templateDir);
    await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');
    await fs.writeFile(templateFile, 'Hello from local');

    const config = {
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
    };

    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/actualitat')) {
          return new Response('{"id":30123,"friendlyUrlPath":"/actualitat","name":"Actualitat","companyId":20097}', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=30123')) {
          return new Response('{"companyId":20097}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure')) {
          return new Response('{"classNameId":1234}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":5678}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/30123/content-templates?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }
        if (
          url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=30123&classNameId=1234&templateKey=MISSING')
        ) {
          return new Response('{"status":404}', {status: 404});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-templates')) {
          return new Response('[]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await expect(
      runLiferayResourceSyncTemplate(
        config,
        {key: 'MISSING', file: templateFile},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow('does not exist and create-missing is not enabled');
  });
});
