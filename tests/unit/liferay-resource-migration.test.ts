import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceMigrationRun,
  formatLiferayResourceMigrationPipeline,
  runLiferayResourceMigrationPipeline,
  runLiferayResourceMigrationRun,
} from '../../src/features/liferay/resource/liferay-resource-migration.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

async function createRepoFixture() {
  const repoRoot = createTempDir('dev-cli-resource-migration-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');

  const structureFile = path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global', 'BASIC.json');
  await fs.writeJson(structureFile, {
    dataDefinitionKey: 'BASIC',
    dataDefinitionFields: [{name: 'newField', customProperties: {fieldReference: 'newField'}}],
  });
  await fs.writeJson(
    path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global', 'FIELDSET-NEW.json'),
    {
      dataDefinitionKey: 'FIELDSET-NEW',
      dataDefinitionFields: [{name: 'childField', customProperties: {fieldReference: 'childField'}}],
    },
  );

  const migrationFile = path.join(repoRoot, 'liferay', 'resources', 'journal', 'migration-descriptor.json');
  await fs.writeJson(migrationFile, {
    site: '/global',
    structureKey: 'BASIC',
    introduce: {
      mappings: [{source: 'oldField', target: 'newField'}],
    },
  });

  return {
    migrationFile,
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

describe('liferay resource migration-run', () => {
  test('executes a migration descriptor through structure-sync', async () => {
    const {config, migrationFile} = await createRepoFixture();
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              dataDefinitionFields: [{name: 'oldField', customProperties: {fieldReference: 'oldField'}}],
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
          return new Response('{"id":301}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/content-structures/301/structured-contents')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceMigrationRun(
      config,
      {migrationFile},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('updated');
    expect(result.migrationApplied).toBe(true);
    expect(formatLiferayResourceMigrationRun(result)).toContain('updated\tBASIC\t301');
    expect(formatLiferayResourceMigrationRun(result)).toContain('stage=introduce');
  });

  test('pipeline syncs dependent structures and derives cleanup from descriptor', async () => {
    const {config, migrationFile} = await createRepoFixture();
    await fs.writeJson(migrationFile, {
      site: '/global',
      structureKey: 'BASIC',
      dependentStructures: ['FIELDSET-NEW'],
      templates: false,
      introduce: {
        mappings: [{source: 'oldField', target: 'fieldset[].newField', cleanupSource: true}],
        articleIds: ['ARTICLE-001'],
      },
    });

    const calls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${url}`);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"groupId":20121,"friendlyURL":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":1,"webId":"liferay.com"}]', {status: 200});
        }
        if (url.includes('/by-data-definition-key/FIELDSET-NEW')) {
          return new Response('{"id":""}', {status: 404});
        }
        if (url.includes('/sites/20121/data-definitions/by-content-type/journal') && method === 'POST') {
          return new Response('{"id":999}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              dataDefinitionFields: [{name: 'oldField', customProperties: {fieldReference: 'oldField'}}],
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
          return new Response('{"id":301}', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/content-structures/301/structured-contents')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceMigrationPipeline(
      config,
      {migrationFile, runCleanup: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.dependentStructureResults).toEqual([{key: 'FIELDSET-NEW', status: 'created', id: '999'}]);
    expect(result.cleanupRun).toBe(true);
    expect(formatLiferayResourceMigrationPipeline(result)).toContain('cleanupRun=true');
  });

  test('pipeline preserves rootFolderIds from the descriptor plan', async () => {
    const {config, migrationFile} = await createRepoFixture();
    await fs.writeJson(migrationFile, {
      site: '/global',
      structureKey: 'BASIC',
      templates: false,
      introduce: {
        mappings: [{source: 'oldField', target: 'newField'}],
        rootFolderIds: [123],
      },
    });

    const calls: string[] = [];
    let persistedFields: Array<Record<string, unknown>> = [
      {name: 'oldField', contentFieldValue: {data: 'legacy value'}},
    ];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${url}`);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              dataDefinitionFields: [{name: 'oldField', customProperties: {fieldReference: 'oldField'}}],
            }),
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=20121&parentFolderId=123')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/structured-content-folders/123/structured-contents')) {
          return new Response(
            '{"items":[{"id":700,"key":"ARTICLE-001","contentStructureId":"301","structuredContentFolderId":123}],"lastPage":1}',
            {status: 200},
          );
        }
        if (url.includes('/o/headless-delivery/v1.0/structured-contents/700?')) {
          return new Response(
            JSON.stringify({
              id: 700,
              key: 'ARTICLE-001',
              contentStructureId: '301',
              structuredContentFolderId: 123,
              title: 'Article',
              contentFields: persistedFields,
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/700')) {
          const body = JSON.parse(String(init?.body ?? '{}'));
          persistedFields = body.contentFields;
          return new Response('{"id":700}', {status: 200});
        }
        if (url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
          return new Response('{"id":301}', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceMigrationPipeline(
      config,
      {migrationFile},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.structureStatus).toBe('updated');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/api/jsonws/journal.journalfolder/get-folders?groupId=20121&parentFolderId=123'),
        expect.stringContaining('/o/headless-delivery/v1.0/structured-content-folders/123/structured-contents'),
      ]),
    );
    expect(calls).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('/o/headless-delivery/v1.0/content-structures/301/structured-contents'),
      ]),
    );
  });

  test('cleanup preserves descriptor scope when introduce returns no migrated articleIds', async () => {
    const {config, migrationFile} = await createRepoFixture();
    await fs.writeJson(migrationFile, {
      site: '/global',
      structureKey: 'BASIC',
      templates: false,
      introduce: {
        mappings: [{source: 'oldField', target: 'newField', cleanupSource: true}],
        rootFolderIds: [123],
      },
    });

    const calls: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${url}`);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              dataDefinitionFields: [{name: 'oldField', customProperties: {fieldReference: 'oldField'}}],
            }),
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/journal.journalfolder/get-folders?groupId=20121&parentFolderId=123')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/o/headless-delivery/v1.0/structured-content-folders/123/structured-contents')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }
        if (url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
          return new Response('{"id":301}', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceMigrationPipeline(
      config,
      {migrationFile, runCleanup: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.cleanupRun).toBe(true);
    expect(calls.filter((call) => call.includes('/structured-content-folders/123/structured-contents')).length).toBe(3);
  });

  test('cleanup fails closed when introduce returns no migrated articleIds and no scope is declared', async () => {
    const {config, migrationFile} = await createRepoFixture();
    await fs.writeJson(migrationFile, {
      site: '/global',
      structureKey: 'BASIC',
      templates: false,
      introduce: {
        mappings: [{source: 'oldField', target: 'newField', cleanupSource: true}],
      },
    });

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              dataDefinitionFields: [{name: 'oldField', customProperties: {fieldReference: 'oldField'}}],
            }),
            {status: 200},
          );
        }
        if (url.includes('/o/headless-delivery/v1.0/content-structures/301/structured-contents')) {
          return new Response('{"items":[],"lastPage":1}', {status: 200});
        }
        if (url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
          return new Response('{"id":301}', {status: 200});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(
      runLiferayResourceMigrationPipeline(
        config,
        {migrationFile, runCleanup: true},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow(
      'Cleanup stage unsafe: no migrated articleIds were produced and the descriptor does not declare articleIds, folderIds or rootFolderIds.',
    );
  });
});
