import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test, vi} from 'vitest';

import {runLiferayResourceExportAdts} from '../../src/features/liferay/resource/liferay-resource-export-adts.js';
import {createLiferayApiClient} from '../../src/core/http/client.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const syncAdtMock = vi.fn();
const syncTemplateMock = vi.fn();
const syncStructureMock = vi.fn();

vi.mock('../../src/features/liferay/resource/liferay-resource-sync-adt.js', () => ({
  runLiferayResourceSyncAdt: syncAdtMock,
}));

vi.mock('../../src/features/liferay/resource/liferay-resource-sync-template.js', () => ({
  runLiferayResourceSyncTemplate: syncTemplateMock,
}));

vi.mock('../../src/features/liferay/resource/liferay-resource-sync-structure.js', () => ({
  runLiferayResourceSyncStructure: syncStructureMock,
}));

const {runLiferayResourceImportAdts} =
  await import('../../src/features/liferay/resource/liferay-resource-import-adts.js');
const {runLiferayResourceImportTemplates} =
  await import('../../src/features/liferay/resource/liferay-resource-import-templates.js');
const {runLiferayResourceImportStructures} =
  await import('../../src/features/liferay/resource/liferay-resource-import-structures.js');

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
      apply: true,
      widgetType: 'search-result-summary',
    });

    expect(result.mode).toBe('single-site');
    expect(result.site).toBe('/global');
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(syncAdtMock).toHaveBeenCalledTimes(1);
    expect(syncAdtMock.mock.calls[0]?.[1]).toMatchObject({
      site: '/global',
      widgetType: 'search-result-summary',
      file: path.join(directDir, 'SEARCH_RESULTS.ftl'),
    });
  });

  test('import-templates requires an explicit template filter, --apply or --all-sites guardrail', async () => {
    const dir = createTempDir('dev-cli-resource-import-templates-guardrail-');
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
    await fs.ensureDir(path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global'));
    await fs.writeFile(path.join(dir, 'docker', '.env'), '');
    await fs.writeFile(
      path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'BASIC.ftl'),
      'template',
    );

    await expect(runLiferayResourceImportTemplates(config, {site: '/global'})).rejects.toThrow(
      '--template <key> (repeatable), --apply for the resolved site, or --all-sites',
    );
  });

  test('import-adts requires an explicit selector, --apply or --all-sites guardrail', async () => {
    const dir = createTempDir('dev-cli-resource-import-adts-guardrail-');
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

    await expect(runLiferayResourceImportAdts(config, {site: '/global'})).rejects.toThrow(
      '--adt <key> (repeatable), --widget-type, --class-name, --apply for the resolved site, or --all-sites',
    );
  });

  test('import-templates limits the import to the selected template keys', async () => {
    const dir = createTempDir('dev-cli-resource-import-templates-filter-');
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
    await fs.ensureDir(path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global'));
    await fs.writeFile(path.join(dir, 'docker', '.env'), '');
    const basic = path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'BASIC.ftl');
    const featured = path.join(dir, 'liferay', 'resources', 'journal', 'templates', 'global', 'FEATURED.ftl');
    await fs.writeFile(basic, 'basic');
    await fs.writeFile(featured, 'featured');

    syncTemplateMock.mockReset();
    syncTemplateMock.mockImplementation(async (_config, options) => ({
      status: 'updated',
      id: options.key,
      name: options.key,
      extra: '',
      templateFile: options.file,
      siteId: 20121,
      siteFriendlyUrl: '/global',
    }));

    const result = await runLiferayResourceImportTemplates(config, {
      site: '/global',
      templateKeys: ['FEATURED'],
    });

    expect(result.mode).toBe('single-site');
    expect(result.site).toBe('/global');
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(syncTemplateMock).toHaveBeenCalledTimes(1);
    expect(syncTemplateMock.mock.calls[0]?.[1]).toMatchObject({
      site: '/global',
      key: 'FEATURED',
      file: featured,
    });
  });

  test('import-templates with custom dir keeps the site token layout under the override directory', async () => {
    const dir = createTempDir('dev-cli-resource-import-templates-custom-dir-');
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
    const templateDir = path.join(dir, '.tmp', 'templates-import', 'global');
    await fs.ensureDir(templateDir);
    const featured = path.join(templateDir, 'FEATURED.ftl');
    await fs.writeFile(featured, 'featured');

    syncTemplateMock.mockReset();
    syncTemplateMock.mockImplementation(async (_config, options) => ({
      status: 'updated',
      id: options.key,
      name: options.key,
      extra: '',
      templateFile: options.file,
      siteId: 20121,
      siteFriendlyUrl: '/global',
    }));

    const result = await runLiferayResourceImportTemplates(config, {
      site: '/global',
      dir: '.tmp/templates-import',
      templateKeys: ['FEATURED'],
    });

    expect(result.baseDir).toBe(path.join(dir, '.tmp', 'templates-import'));
    expect(result.processed).toBe(1);
    expect(syncTemplateMock.mock.calls[0]?.[1]).toMatchObject({
      site: '/global',
      key: 'FEATURED',
      file: featured,
    });
  });

  test('import-structures requires an explicit selector, --apply or --all-sites guardrail', async () => {
    const dir = createTempDir('dev-cli-resource-import-structures-guardrail-');
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

    await expect(runLiferayResourceImportStructures(config, {site: '/global'})).rejects.toThrow(
      '--structure <key> (repeatable), --apply for the resolved site, or --all-sites',
    );
  });

  test('import-structures fails fast by default with entry context', async () => {
    const dir = createTempDir('dev-cli-resource-import-structures-fail-fast-');
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
    await fs.ensureDir(path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global'));
    await fs.writeFile(path.join(dir, 'docker', '.env'), '');
    await fs.writeJson(path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global', 'BROKEN.json'), {
      name: 'broken',
    });

    syncStructureMock.mockReset();
    syncStructureMock.mockRejectedValue(new Error('portal timeout'));

    await expect(runLiferayResourceImportStructures(config, {site: '/global', apply: true})).rejects.toThrow(
      "Import failed for structure 'BROKEN' in site '/global': portal timeout",
    );
    expect(syncStructureMock).toHaveBeenCalledTimes(1);
  });

  test('import-structures continue-on-error collects detailed failures', async () => {
    const dir = createTempDir('dev-cli-resource-import-structures-continue-');
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
    await fs.ensureDir(path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global'));
    await fs.writeFile(path.join(dir, 'docker', '.env'), '');
    const brokenFile = path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global', 'BROKEN.json');
    const okFile = path.join(dir, 'liferay', 'resources', 'journal', 'structures', 'global', 'OK.json');
    await fs.writeJson(brokenFile, {name: 'broken'});
    await fs.writeJson(okFile, {name: 'ok'});

    syncStructureMock.mockReset();
    syncStructureMock.mockImplementation(async (_config, options) => {
      if (options.key === 'BROKEN') {
        throw new Error('portal timeout');
      }
      return {
        status: 'updated',
        id: '123',
        key: options.key,
        siteId: 20121,
        siteFriendlyUrl: '/global',
        structureFile: options.file,
        removedFieldReferences: [],
      };
    });

    const result = await runLiferayResourceImportStructures(config, {
      site: '/global',
      apply: true,
      continueOnError: true,
    });

    expect(result.mode).toBe('single-site');
    expect(result.site).toBe('/global');
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      {
        site: '/global',
        entry: 'BROKEN',
        file: brokenFile,
        message: 'portal timeout',
      },
    ]);
    expect(syncStructureMock).toHaveBeenCalledTimes(2);
    expect(syncStructureMock.mock.calls[1]?.[1]).toMatchObject({
      key: 'OK',
      file: okFile,
    });
  });

  test('import-structures with custom dir keeps the site token layout under the override directory', async () => {
    const dir = createTempDir('dev-cli-resource-import-structures-custom-dir-');
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
    const structuresDir = path.join(dir, '.tmp', 'structures-import', 'global');
    await fs.ensureDir(structuresDir);
    const okFile = path.join(structuresDir, 'OK.json');
    await fs.writeJson(okFile, {name: 'ok'});

    syncStructureMock.mockReset();
    syncStructureMock.mockImplementation(async (_config, options) => ({
      status: 'updated',
      id: '123',
      key: options.key,
      siteId: 20121,
      siteFriendlyUrl: '/global',
      structureFile: options.file,
      removedFieldReferences: [],
    }));

    const result = await runLiferayResourceImportStructures(config, {
      site: '/global',
      dir: '.tmp/structures-import',
      structureKeys: ['OK'],
    });

    expect(result.baseDir).toBe(path.join(dir, '.tmp', 'structures-import'));
    expect(result.processed).toBe(1);
    expect(syncStructureMock.mock.calls[0]?.[1]).toMatchObject({
      site: '/global',
      key: 'OK',
      file: okFile,
    });
  });
});
