import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceSyncTemplate,
  runLiferayResourceSyncTemplate,
} from '../../src/features/liferay/resource/liferay-resource-sync-template.js';
import {createStaticTokenClient, createTestFetchImpl, toTestRequestBody} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = createStaticTokenClient();

async function createRepoFixture() {
  const repoRoot = createTempDir('dev-cli-resource-sync-template-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'global'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');

  const templateFile = path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'global', 'BASIC.ftl');
  await fs.writeFile(templateFile, 'Hello from local');

  return {
    repoRoot,
    templateFile,
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

describe('liferay resource template-sync', () => {
  test('throws when template is missing and createMissing is not enabled', async () => {
    const {config, templateFile} = await createRepoFixture();
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global","companyId":20097}', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":20097}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure')) {
          return new Response('{"classNameId":1234}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":5678}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }
        if (
          url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=MISSING')
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
        {site: '/global', key: 'MISSING', file: templateFile},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow('does not exist and create-missing is not enabled');
  });

  test('updates an existing template and verifies the resulting hash', async () => {
    const {config, templateFile} = await createRepoFixture();
    const calls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global","companyId":20097}', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":20097}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure')) {
          return new Response('{"classNameId":1234}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":5678}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=BASIC')) {
          return new Response('{"templateId":"T-100","templateKey":"BASIC","classPK":"301"}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=20097&groupId=20121&classNameId=1234&resourceClassNameId=5678&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"T-100","templateKey":"T-100","externalReferenceCode":"BASIC","nameCurrentValue":"BASIC","name":"BASIC","script":"Hello from local","classPK":"301"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=T-100')) {
          return new Response('{"templateId":"T-100","classPK":"301"}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/update-template')) {
          const form = new URLSearchParams(toTestRequestBody(init?.body));
          expect(form.get('templateId')).toBe('T-100');
          expect(form.get('script')).toBe('Hello from local');
          return new Response('{"templateId":"T-100"}', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceSyncTemplate(
      config,
      {site: '/global', key: 'BASIC', file: templateFile},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('updated');
    expect(result.id).toBe('BASIC');
    expect(formatLiferayResourceSyncTemplate(result)).toContain('updated\tBASIC\tBASIC');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('POST http://localhost:8080/api/jsonws/ddm.ddmtemplate/update-template'),
      ]),
    );
  });

  test('resolves a content-template inventory id to the matching ddm template key', async () => {
    const {config, templateFile} = await createRepoFixture();
    const calls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global","companyId":20097}', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":20097}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure')) {
          return new Response('{"classNameId":1234}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":5678}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response(
            '{"items":[{"id":"33954","name":"NUEVA","contentStructureId":301,"templateScript":"Hello from local"}],"lastPage":1,"page":1,"pageSize":200,"totalCount":1}',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=33954')) {
          return new Response('{"templateId":"33955","templateKey":"33954","classPK":"301"}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=20097&groupId=20121&classNameId=1234&resourceClassNameId=5678&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"33955","templateKey":"33954","externalReferenceCode":"33954","nameCurrentValue":"NUEVA","name":"NUEVA","script":"Hello from local","classPK":"301"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/update-template')) {
          const form = new URLSearchParams(toTestRequestBody(init?.body));
          expect(form.get('templateId')).toBe('33955');
          expect(form.get('script')).toBe('Hello from local');
          return new Response('{"templateId":"33955"}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=33955')) {
          return new Response(
            '{"cacheable":true,"templateId":"33955","templateKey":"33954","script":"Hello from local"}',
            {status: 200},
          );
        }
        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceSyncTemplate(
      config,
      {site: '/global', key: '33954', file: templateFile},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('updated');
    expect(result.id).toBe('33954');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'GET http://localhost:8080/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200',
        ),
        expect.stringContaining(
          'GET http://localhost:8080/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=33954',
        ),
        expect.stringContaining('POST http://localhost:8080/api/jsonws/ddm.ddmtemplate/update-template'),
      ]),
    );
  });

  test('treats export then import as idempotent when runtime only differs by volatile normalized tokens', async () => {
    const {config, templateFile} = await createRepoFixture();
    await fs.writeFile(templateFile, '<a href="/web/guest/home?p_l_back_url=%2Fgroup%2Fguest">link</a>');

    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global","companyId":20097}', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":20097}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure')) {
          return new Response('{"classNameId":1234}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":5678}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=BASIC')) {
          return new Response('{"templateId":"T-100","templateKey":"BASIC","classPK":"301"}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=20097&groupId=20121&classNameId=1234&resourceClassNameId=5678&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"T-100","templateKey":"BASIC","externalReferenceCode":"BASIC","nameCurrentValue":"BASIC","name":"BASIC","script":"<a href=\\"http://localhost:8080/web/guest/home?p_l_back_url=%2Fgroup%2Fguest&p_p_auth=1QcBPYiy\\">link</a>","classPK":"301"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/update-template')) {
          const form = new URLSearchParams(toTestRequestBody(init?.body));
          expect(form.get('script')).toBe('<a href="/web/guest/home?p_l_back_url=%2Fgroup%2Fguest">link</a>');
          return new Response('{"templateId":"T-100"}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=T-100')) {
          return new Response(
            '{"templateId":"T-100","templateKey":"BASIC","script":"<a href=\\"http://localhost:8080/web/guest/home?p_l_back_url=%2Fgroup%2Fguest&p_p_auth=1QcBPYiy\\">link</a>"}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceSyncTemplate(
      config,
      {site: '/global', key: 'BASIC', file: templateFile},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('updated');
  });

  test('does not corrupt FreeMarker boolean operators during normalization-based hash verification', async () => {
    const {config, templateFile} = await createRepoFixture();
    await fs.writeFile(
      templateFile,
      '<#if (imagen.getData())?? && imagen.getData() != ""><img src="${imagen.getData()}" /></#if>',
    );

    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, _init) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global","companyId":20097}', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":20097}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure')) {
          return new Response('{"classNameId":1234}', {status: 200});
        }
        if (url.includes('/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":5678}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=BASIC')) {
          return new Response('{"templateId":"T-100","templateKey":"BASIC","classPK":"301"}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=20097&groupId=20121&classNameId=1234&resourceClassNameId=5678&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"T-100","templateKey":"BASIC","externalReferenceCode":"BASIC","nameCurrentValue":"BASIC","name":"BASIC","script":"<#if (imagen.getData())?? && imagen.getData() != \\"\\" ><img src=\\"${imagen.getData()}\\" /></#if>","classPK":"301"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/update-template')) {
          return new Response('{"templateId":"T-100"}', {status: 200});
        }
        if (url.includes('/api/jsonws/ddm.ddmtemplate/get-template?groupId=20121&classNameId=1234&templateKey=T-100')) {
          return new Response(
            '{"templateId":"T-100","templateKey":"BASIC","script":"<#if (imagen.getData())?? && imagen.getData() != \\"\\" ><img src=\\"${imagen.getData()}\\" /></#if>"}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceSyncTemplate(
      config,
      {site: '/global', key: 'BASIC', file: templateFile},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('updated');
  });
});
