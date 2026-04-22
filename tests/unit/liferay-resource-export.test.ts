import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test, beforeEach} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {classNameIdLookupCache} from '../../src/features/liferay/lookup-cache.js';
import {runLiferayResourceExportStructure} from '../../src/features/liferay/resource/liferay-resource-export-structure.js';
import {
  formatLiferayResourceExportStructures,
  runLiferayResourceExportStructures,
} from '../../src/features/liferay/resource/liferay-resource-export-structures.js';
import {runLiferayResourceExportTemplate} from '../../src/features/liferay/resource/liferay-resource-export-template.js';
import {runLiferayResourceExportAdts} from '../../src/features/liferay/resource/liferay-resource-export-adts.js';
import {runLiferayResourceExportFragments} from '../../src/features/liferay/resource/liferay-resource-export-fragments.js';
import {
  formatLiferayResourceExportTemplates,
  runLiferayResourceExportTemplates,
} from '../../src/features/liferay/resource/liferay-resource-export-templates.js';
import {createStaticTokenClient, createTestFetchImpl, parseTestJson} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

beforeEach(() => {
  classNameIdLookupCache.clear();
});

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

describe('liferay resource export', () => {
  test('exports structure JSON to file and creates parent directories', async () => {
    const dir = createTempDir('dev-cli-resource-export-structure-');
    const outputPath = path.join(dir, 'nested', 'structure.json');
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    const result = await runLiferayResourceExportStructure(
      CONFIG,
      {site: '/global', key: 'BASIC-WEB-CONTENT', output: outputPath, pretty: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.outputPath).toBe(path.resolve(outputPath));
    const written = await fs.readFile(outputPath, 'utf8');
    expect(written.endsWith('\n')).toBe(true);
    expect(JSON.parse(written)).toEqual({
      dataDefinitionKey: 'BASIC-WEB-CONTENT',
      name: {en_US: 'Basic Web Content'},
    });
  });

  test('exports structure JSON sanitizing volatile p_p_auth tokens recursively', async () => {
    const dir = createTempDir('dev-cli-resource-export-structure-sanitize-');
    const outputPath = path.join(dir, 'nested', 'structure.json');
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC-WEB-CONTENT')) {
          return new Response(
            '{"id":301,"dataDefinitionKey":"BASIC-WEB-CONTENT","defaultDataLayout":{"pages":[{"title":"Link","description":"http://localhost:8080/web/guest/home?p_l_back_url=%2Fgroup%2Fguest&p_p_auth=1QcBPYiy"}]}}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await runLiferayResourceExportStructure(
      CONFIG,
      {site: '/global', key: 'BASIC-WEB-CONTENT', output: outputPath, pretty: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = parseTestJson<{defaultDataLayout: {pages: Array<{description: string}>}}>(
      await fs.readFile(outputPath, 'utf8'),
    );
    expect(written.defaultDataLayout.pages[0].description).toBe('/web/guest/home?p_l_back_url=%2Fgroup%2Fguest');
  });

  test('exports structure JSON removing volatile metadata and internal URL origins', async () => {
    const dir = createTempDir('dev-cli-resource-export-structure-stable-');
    const outputPath = path.join(dir, 'nested', 'structure.json');
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC-WEB-CONTENT')) {
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC-WEB-CONTENT',
              dateCreated: '2026-01-01T00:00:00Z',
              dateModified: '2026-01-02T00:00:00Z',
              externalReferenceCode: 'erc-123',
              siteId: 20121,
              userId: 1234,
              defaultDataLayout: {
                id: 401,
                dataDefinitionId: 301,
                dataLayoutKey: '401',
                dateCreated: '2026-01-01T00:00:00Z',
                dateModified: '2026-01-02T00:00:00Z',
                siteId: 20121,
                userId: 1234,
                dataLayoutPages: [
                  {
                    description:
                      'http://localhost:8298/o/classic-theme/css/main.css?browserId=other&amp;themeId=classic_WAR_classictheme&amp;languageId=en_US&amp;t=1774463242000',
                  },
                ],
              },
            }),
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await runLiferayResourceExportStructure(
      CONFIG,
      {site: '/global', key: 'BASIC-WEB-CONTENT', output: outputPath, pretty: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = parseTestJson<{
      id?: unknown;
      dateCreated?: unknown;
      dateModified?: unknown;
      externalReferenceCode?: unknown;
      siteId?: unknown;
      userId?: unknown;
      defaultDataLayout: {
        id?: unknown;
        dataDefinitionId?: unknown;
        dataLayoutKey?: unknown;
        dateCreated?: unknown;
        dateModified?: unknown;
        siteId?: unknown;
        userId?: unknown;
        dataLayoutPages: Array<{description: string}>;
      };
    }>(await fs.readFile(outputPath, 'utf8'));
    expect(written.id).toBeUndefined();
    expect(written.dateCreated).toBeUndefined();
    expect(written.dateModified).toBeUndefined();
    expect(written.externalReferenceCode).toBeUndefined();
    expect(written.siteId).toBeUndefined();
    expect(written.userId).toBeUndefined();
    expect(written.defaultDataLayout.id).toBeUndefined();
    expect(written.defaultDataLayout.dataDefinitionId).toBeUndefined();
    expect(written.defaultDataLayout.dataLayoutKey).toBeUndefined();
    expect(written.defaultDataLayout.dateCreated).toBeUndefined();
    expect(written.defaultDataLayout.dateModified).toBeUndefined();
    expect(written.defaultDataLayout.siteId).toBeUndefined();
    expect(written.defaultDataLayout.userId).toBeUndefined();
    expect(written.defaultDataLayout.dataLayoutPages[0].description).toBe(
      '/o/classic-theme/css/main.css?browserId=other&amp;themeId=classic_WAR_classictheme&amp;languageId=en_US',
    );
  });

  test('exports structure JSON with stable customProperties ordering', async () => {
    const dir = createTempDir('dev-cli-resource-export-structure-editor-config-');
    const outputPath = path.join(dir, 'nested', 'structure.json');
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC-WEB-CONTENT')) {
          return new Response(
            JSON.stringify({
              dataDefinitionKey: 'BASIC-WEB-CONTENT',
              dataDefinitionFields: [
                {
                  customProperties: {
                    fieldReference: 'Height',
                    placeholder: {ca_ES: ''},
                    numericInputMask: {ca_ES: ''},
                    htmlAutocompleteAttribute: '',
                    editorConfig: {
                      language: 'ca-ES',
                      extraPlugins: 'addimages,autogrow',
                      embedProviders: [],
                      title: false,
                      contentsCss: ['/o/classic-theme/css/clay.css'],
                    },
                  },
                },
              ],
            }),
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await runLiferayResourceExportStructure(
      CONFIG,
      {site: '/global', key: 'BASIC-WEB-CONTENT', output: outputPath, pretty: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = await fs.readFile(outputPath, 'utf8');
    expect(written.indexOf('"fieldReference"')).toBeLessThan(written.indexOf('"htmlAutocompleteAttribute"'));
    expect(written.indexOf('"htmlAutocompleteAttribute"')).toBeLessThan(written.indexOf('"numericInputMask"'));
    expect(written.indexOf('"numericInputMask"')).toBeLessThan(written.indexOf('"placeholder"'));
    expect(written.indexOf('"contentsCss"')).toBeLessThan(written.indexOf('"embedProviders"'));
    expect(written.indexOf('"embedProviders"')).toBeLessThan(written.indexOf('"extraPlugins"'));
    expect(written.indexOf('"extraPlugins"')).toBeLessThan(written.indexOf('"title"'));
  });

  test('exports structure JSON to default structures layout when output is omitted', async () => {
    const dir = createTempDir('dev-cli-resource-export-structure-default-');
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
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/o/data-engine/v2.0/data-definitions/31801')) {
          return new Response(
            '{"id":31801,"dataDefinitionKey":"BASIC-WEB-CONTENT","name":{"en_US":"Basic Web Content"}}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceExportStructure(
      config,
      {site: '/global', id: '31801', pretty: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const expectedPath = path.join(
      dir,
      'liferay',
      'resources',
      'journal',
      'structures',
      'global',
      'BASIC-WEB-CONTENT.json',
    );
    expect(result.outputPath).toBe(path.resolve(expectedPath));
    const written = parseTestJson<{dataDefinitionKey: string}>(await fs.readFile(expectedPath, 'utf8'));
    expect(written.dataDefinitionKey).toBe('BASIC-WEB-CONTENT');
  });

  test('exports template FTL to file with deterministic content', async () => {
    const dir = createTempDir('dev-cli-resource-export-template-');
    const outputPath = path.join(dir, 'template.ftl');
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

    const result = await runLiferayResourceExportTemplate(
      CONFIG,
      {site: '/global', id: 'NEWS_TEMPLATE', output: outputPath},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.outputPath).toBe(path.resolve(outputPath));
    const written = await fs.readFile(outputPath, 'utf8');
    expect(written).toBe('<#-- ftl -->');
  });

  test('exports template FTL removing volatile p_p_auth tokens', async () => {
    const dir = createTempDir('dev-cli-resource-export-template-sanitize-');
    const outputPath = path.join(dir, 'template.ftl');
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
            '[{"templateId":"40801","templateKey":"NEWS_TEMPLATE","externalReferenceCode":"erc-news-template","nameCurrentValue":"News Template","classPK":301,"script":"<a href=\\"http://localhost:8080/web/guest/home?p_l_back_url=%2Fgroup%2Fguest&p_p_auth=1QcBPYiy\\">link</a>"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await runLiferayResourceExportTemplate(
      CONFIG,
      {site: '/global', id: 'NEWS_TEMPLATE', output: outputPath},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = await fs.readFile(outputPath, 'utf8');
    expect(written).toBe('<a href="/web/guest/home?p_l_back_url=%2Fgroup%2Fguest">link</a>');
  });

  test('exports template FTL removing internal URL origins and volatile cache busters', async () => {
    const dir = createTempDir('dev-cli-resource-export-template-stable-');
    const outputPath = path.join(dir, 'template.ftl');
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
            '[{"templateId":"40801","templateKey":"NEWS_TEMPLATE","externalReferenceCode":"erc-news-template","nameCurrentValue":"News Template","script":"<link href=\\"http://localhost:8298/o/classic-theme/css/main.css?browserId=other&amp;themeId=classic_WAR_classictheme&amp;languageId=en_US&amp;t=1774463242000\\" />"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await runLiferayResourceExportTemplate(
      CONFIG,
      {site: '/global', id: 'NEWS_TEMPLATE', output: outputPath},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = await fs.readFile(outputPath, 'utf8');
    expect(written).toBe(
      '<link href="/o/classic-theme/css/main.css?browserId=other&amp;themeId=classic_WAR_classictheme&amp;languageId=en_US" />',
    );
  });

  test('exports template FTL to default templates layout when output is omitted', async () => {
    const dir = createTempDir('dev-cli-resource-export-template-default-');
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

    const result = await runLiferayResourceExportTemplate(
      config,
      {site: '/global', id: 'NEWS_TEMPLATE'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const expectedPath = path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'NEWS_TEMPLATE.ftl');
    expect(result.outputPath).toBe(path.resolve(expectedPath));
    expect(await fs.readFile(expectedPath, 'utf8')).toBe('<#-- ftl -->');
  });

  test('surfaces export errors from underlying getters', async () => {
    const dir = createTempDir('dev-cli-resource-export-error-');
    const outputPath = path.join(dir, 'missing.json');
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }

        return new Response('not-found', {status: 404});
      }),
    });

    await expect(
      runLiferayResourceExportStructure(
        CONFIG,
        {site: '/global', key: 'MISSING', output: outputPath},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow('structure lookup failed with status=404');
  });

  test('exports all structures of a site to the local structures layout', async () => {
    const dir = createTempDir('dev-cli-resource-export-structures-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    const result = await runLiferayResourceExportStructures(
      config,
      {site: '/global'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = parseTestJson<{dataDefinitionKey: string}>(
      await fs.readFile(
        path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global', 'BASIC-WEB-CONTENT.json'),
        'utf8',
      ),
    );
    expect(written.dataDefinitionKey).toBe('BASIC-WEB-CONTENT');
    expect(result.processed).toBe(1);
    expect(formatLiferayResourceExportStructures(result)).toContain('EXPORTED site=/global count=1');
  });

  test('exports all structures under dir/siteToken when --dir is provided', async () => {
    const dir = createTempDir('dev-cli-resource-export-structures-dir-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    const result = await runLiferayResourceExportStructures(
      config,
      {site: '/global', dir: 'custom-structures'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.siteResults[0]?.outputDir).toBe(path.join(dir, 'custom-structures', 'global'));
    expect(await fs.pathExists(path.join(dir, 'custom-structures', 'global', 'BASIC-WEB-CONTENT.json'))).toBe(true);
  });

  test('exports all structures sanitizing volatile p_p_auth tokens', async () => {
    const dir = createTempDir('dev-cli-resource-export-structures-sanitize-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
            '{"id":301,"dataDefinitionKey":"BASIC-WEB-CONTENT","defaultDataLayout":{"pages":[{"title":"Link","description":"http://localhost:8080/web/guest/home?p_l_back_url=%2Fgroup%2Fguest&p_p_auth=1QcBPYiy"}]}}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await runLiferayResourceExportStructures(config, {site: '/global'}, {apiClient, tokenClient: TOKEN_CLIENT});

    const written = parseTestJson<{defaultDataLayout: {pages: Array<{description: string}>}}>(
      await fs.readFile(
        path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global', 'BASIC-WEB-CONTENT.json'),
        'utf8',
      ),
    );
    expect(written.defaultDataLayout.pages[0].description).toBe('/web/guest/home?p_l_back_url=%2Fgroup%2Fguest');
  });

  test('exports all templates of a site to the local templates layout', async () => {
    const dir = createTempDir('dev-cli-resource-export-templates-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    const result = await runLiferayResourceExportTemplates(
      config,
      {site: '/global'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = await fs.readFile(
      path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'NEWS_TEMPLATE.ftl'),
      'utf8',
    );
    expect(written).toBe('<#-- ftl -->');
    expect(result.exported).toBe(1);
    expect(formatLiferayResourceExportTemplates(result)).toContain('EXPORTED site=/global exported=1 failed=0');
  });

  test('exports all templates under dir/siteToken when --dir is provided', async () => {
    const dir = createTempDir('dev-cli-resource-export-templates-dir-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    const result = await runLiferayResourceExportTemplates(
      config,
      {site: '/global', dir: 'custom-templates'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.siteResults[0]?.outputDir).toBe(path.join(dir, 'custom-templates', 'global'));
    expect(await fs.readFile(path.join(dir, 'custom-templates', 'global', 'NEWS_TEMPLATE.ftl'), 'utf8')).toBe(
      '<#-- ftl -->',
    );
  });

  test('exports all templates sanitizing volatile p_p_auth tokens', async () => {
    const dir = createTempDir('dev-cli-resource-export-templates-sanitize-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    await runLiferayResourceExportTemplates(config, {site: '/global'}, {apiClient, tokenClient: TOKEN_CLIENT});

    const written = await fs.readFile(
      path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'NEWS_TEMPLATE.ftl'),
      'utf8',
    );
    expect(written).toBe('<a href="/web/guest/home?p_l_back_url=%2Fgroup%2Fguest">link</a>');
  });

  test('export-structures --all-sites includes /global even when site search omits it', async () => {
    const dir = createTempDir('dev-cli-resource-export-structures-all-sites-');
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
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":10157}]', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search-count?companyId=10157')) {
          return new Response('1', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search?companyId=10157')) {
          return new Response('[{"groupId":20122,"friendlyURL":"/guest","nameCurrentValue":"Guest","site":true}]', {
            status: 200,
          });
        }
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20122,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }
        if (
          url.includes('/o/data-engine/v2.0/sites/20121/data-definitions/by-content-type/journal?page=1&pageSize=200')
        ) {
          return new Response(
            '{"items":[{"id":301,"dataDefinitionKey":"GLOBAL_STRUCTURE","name":{"en_US":"Global Structure"}}],"lastPage":1,"page":1,"pageSize":200,"totalCount":1}',
            {status: 200},
          );
        }
        if (
          url.includes('/o/data-engine/v2.0/sites/20122/data-definitions/by-content-type/journal?page=1&pageSize=200')
        ) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20122')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/GLOBAL_STRUCTURE')) {
          return new Response('{"id":301,"dataDefinitionKey":"GLOBAL_STRUCTURE","name":{"en_US":"Global Structure"}}', {
            status: 200,
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceExportStructures(
      config,
      {allSites: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    const written = parseTestJson<{dataDefinitionKey: string}>(
      await fs.readFile(
        path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global', 'GLOBAL_STRUCTURE.json'),
        'utf8',
      ),
    );
    expect(written.dataDefinitionKey).toBe('GLOBAL_STRUCTURE');
    expect(result.scannedSites).toBe(2);
    expect(result.processed).toBe(1);
  });

  test('export-adts --all-sites includes /global', async () => {
    const dir = createTempDir('dev-cli-resource-export-adts-all-sites-');
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
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }
        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":10157}]', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search-count?companyId=10157')) {
          return new Response('0', {status: 200});
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
      }),
    });

    const result = await runLiferayResourceExportAdts(config, {allSites: true}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.mode).toBe('all-sites');
    expect(result.scannedSites).toBe(1);
    expect(result.exported).toBe(1);
    expect(
      await fs.readFile(
        path.join(
          dir,
          'liferay',
          'resources',
          'templates',
          'application_display',
          'global',
          'search_result_summary',
          'SEARCH_RESULTS.ftl',
        ),
        'utf8',
      ),
    ).toBe('<#-- ftl -->');
  });

  test('export-adts writes under dir/siteToken when --dir is provided', async () => {
    const dir = createTempDir('dev-cli-resource-export-adts-dir-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
      }),
    });

    const result = await runLiferayResourceExportAdts(
      config,
      {site: '/global', dir: 'custom-adts'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.outputDir).toBe(path.join(dir, 'custom-adts', 'global'));
    expect(
      await fs.readFile(path.join(dir, 'custom-adts', 'global', 'search_result_summary', 'SEARCH_RESULTS.ftl'), 'utf8'),
    ).toBe('<#-- ftl -->');
  });

  test('export-fragments --all-sites includes /global', async () => {
    const dir = createTempDir('dev-cli-resource-export-fragments-all-sites-');
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
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }
        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":10157}]', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search-count?companyId=10157')) {
          return new Response('0', {status: 200});
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
    });

    const result = await runLiferayResourceExportFragments(
      config,
      {allSites: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('all-sites');
    expect(result.scannedSites).toBe(1);
    expect(result.fragmentCount).toBe(1);
    expect(
      await fs.readFile(
        path.join(
          dir,
          'liferay',
          'fragments',
          'sites',
          'global',
          'src',
          'marketing',
          'fragments',
          'hero-banner',
          'index.html',
        ),
        'utf8',
      ),
    ).toBe('');
  });

  test('export-fragments --all-sites does not create directories for sites without fragments', async () => {
    const dir = createTempDir('dev-cli-resource-export-fragments-no-empty-sites-');
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
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-site/v1.0/sites?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }
        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":10157}]', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search-count?companyId=10157')) {
          return new Response('1', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search?companyId=10157')) {
          return new Response(
            '[{"groupId":20122,"friendlyURL":"/cataleg-estrategies","nameCurrentValue":"Cataleg","site":true}]',
            {status: 200},
          );
        }
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-friendly-url-path/cataleg-estrategies')) {
          return new Response('{"id":20122,"friendlyUrlPath":"/cataleg-estrategies","name":"Cataleg"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20122')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20121')) {
          return new Response(
            '[{"fragmentCollectionId":501,"name":"Marketing","fragmentCollectionKey":"marketing","description":"Marketing fragments"}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20122')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=501')) {
          return new Response(
            '[{"fragmentEntryId":601,"fragmentEntryKey":"hero-banner","name":"Hero Banner","icon":"square","type":1}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceExportFragments(
      config,
      {allSites: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('all-sites');
    expect(result.scannedSites).toBe(2);
    expect(result.fragmentCount).toBe(1);
    expect(await fs.pathExists(path.join(dir, 'liferay', 'fragments', 'sites', 'cataleg-estrategies'))).toBe(false);
    expect(
      await fs.pathExists(
        path.join(dir, 'liferay', 'fragments', 'sites', 'global', 'src', 'marketing', 'fragments', 'hero-banner'),
      ),
    ).toBe(true);
  });

  test('export-fragments keeps historical project-root behavior when --dir is provided', async () => {
    const dir = createTempDir('dev-cli-resource-export-fragments-dir-');
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
      fetchImpl: createTestFetchImpl((url) => {
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
    });

    const result = await runLiferayResourceExportFragments(
      config,
      {site: '/global', dir: 'custom-fragments'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.outputDir).toBe(path.join(dir, 'custom-fragments'));
    expect(
      await fs.readFile(
        path.join(dir, 'custom-fragments', 'src', 'marketing', 'fragments', 'hero-banner', 'index.html'),
        'utf8',
      ),
    ).toBe('');
    expect(await fs.pathExists(path.join(dir, 'custom-fragments', 'global'))).toBe(false);
  });

  test('export-templates uses the same enumeration source as inventory templates', async () => {
    const dir = createTempDir('dev-cli-resource-export-templates-inventory-');
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
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response(
            '{"items":[{"id":"33954","name":"NUEVA","contentStructureId":31801,"externalReferenceCode":"NUEVA_KEY","templateScript":"hola"}],"lastPage":1,"page":1,"pageSize":200,"totalCount":1}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceExportTemplates(
      config,
      {site: '/global'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.exported).toBe(1);
    expect(
      await fs.readFile(
        path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'NUEVA_KEY.ftl'),
        'utf8',
      ),
    ).toBe('hola');
  });

  test('export-templates falls back to DDM templates when headless content templates are empty', async () => {
    const dir = createTempDir('dev-cli-resource-export-templates-ddm-');
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
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/sites/20121/content-templates?page=1&pageSize=200')) {
          return new Response('{"items":[],"lastPage":1,"page":1,"pageSize":200,"totalCount":0}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/classname/fetch-class-name?value=com.liferay.dynamic.data.mapping.model.DDMStructure',
          )
        ) {
          return new Response('{"classNameId":3001}', {status: 200});
        }
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=com.liferay.journal.model.JournalArticle')) {
          return new Response('{"classNameId":2001}', {status: 200});
        }
        if (
          url.includes(
            '/api/jsonws/ddm.ddmtemplate/get-templates?companyId=10157&groupId=20121&classNameId=3001&resourceClassNameId=2001&status=0',
          )
        ) {
          return new Response(
            '[{"templateId":"40802","templateKey":"LEGACY_NEWS","externalReferenceCode":"legacy-news","nameCurrentValue":"Legacy News","classPK":301,"script":"<#-- legacy -->"}]',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayResourceExportTemplates(
      config,
      {site: '/global', debug: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.exported).toBe(1);
    expect(result.siteResults[0]?.debug).toEqual({
      headlessCount: 1,
      ddmCount: 0,
      selectedSource: 'headless',
    });
    expect(
      await fs.readFile(
        path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'legacy-news.ftl'),
        'utf8',
      ),
    ).toBe('<#-- legacy -->');
  });

  test('format export-templates includes source diagnostics when debug is enabled', () => {
    expect(
      formatLiferayResourceExportTemplates({
        mode: 'single-site',
        scannedSites: 1,
        exported: 0,
        failed: 0,
        outputDir: '/tmp/templates',
        siteResults: [
          {
            site: '/global',
            siteToken: 'global',
            outputDir: '/tmp/templates/global',
            exported: 0,
            failed: 0,
            debug: {
              headlessCount: 0,
              ddmCount: 0,
              selectedSource: 'headless',
            },
          },
        ],
      }),
    ).toContain('DEBUG site=/global source=headless headlessCount=0');
  });
});
