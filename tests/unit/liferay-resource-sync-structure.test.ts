import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import type {AppConfig} from '../../src/core/config/schema.js';
import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceSyncStructure,
  runLiferayResourceSyncStructure,
} from '../../src/features/liferay/resource/liferay-resource-sync-structure.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

async function createRepoFixture(): Promise<{
  repoRoot: string;
  config: AppConfig;
  structureFile: string;
  migrationPlanFile: string;
}> {
  const repoRoot = createTempDir('dev-cli-resource-sync-structure-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');

  const structureFile = path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global', 'BASIC.json');
  await fs.writeJson(structureFile, {
    dataDefinitionKey: 'BASIC',
    dataDefinitionFields: [{name: 'newField', customProperties: {fieldReference: 'newField'}}],
  });

  const migrationPlanFile = path.join(repoRoot, 'liferay', 'resources', 'journal', 'migrations.json');
  await fs.writeJson(migrationPlanFile, {
    mappings: [{source: 'oldField', target: 'newField'}],
  });

  return {
    repoRoot,
    structureFile,
    migrationPlanFile,
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

describe('liferay resource structure-sync', () => {
  test('throws when structure is missing and createMissing is not enabled', async () => {
    const {config} = await createRepoFixture();
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response('{"message":"Not Found"}', {status: 404});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(
      runLiferayResourceSyncStructure(config, {site: '/global', key: 'BASIC'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('does not exist and create-missing is not enabled');
  });

  test('returns checked_missing when structure is missing and checkOnly is enabled with createMissing', async () => {
    const {config} = await createRepoFixture();
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response('{"message":"Not Found"}', {status: 404});
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncStructure(
      config,
      {site: '/global', key: 'BASIC', checkOnly: true, createMissing: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('checked_missing');
    expect(result.id).toBe('');
    expect(result.removedFieldReferences).toEqual([]);
  });

  test('blocks breaking changes without migration-plan or allow-breaking-change', async () => {
    const {config} = await createRepoFixture();
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
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(
      runLiferayResourceSyncStructure(config, {site: '/global', key: 'BASIC'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('Define --migration-plan or use --allow-breaking-change');
  });

  test('updates structure and migrates structured contents with a migration plan', async () => {
    const {config, migrationPlanFile} = await createRepoFixture();
    const calls: string[] = [];
    let persistedFields: Array<Record<string, unknown>> = [
      {name: 'oldField', contentFieldValue: {data: 'legacy value'}},
    ];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);

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
          return new Response(
            '{"items":[{"id":700,"key":"ARTICLE-001","contentStructureId":"301","structuredContentFolderId":0}],"lastPage":1}',
            {status: 200},
          );
        }
        if (url.includes('/o/headless-delivery/v1.0/structured-contents/700?')) {
          return new Response(
            JSON.stringify({
              id: 700,
              key: 'ARTICLE-001',
              contentStructureId: '301',
              contentFields: persistedFields,
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/700')) {
          const body = JSON.parse(String(init?.body ?? '{}'));
          expect(body.contentFields).toEqual([
            {name: 'oldField', contentFieldValue: {data: ''}},
            {name: 'newField', contentFieldValue: {data: 'legacy value'}},
          ]);
          persistedFields = body.contentFields;
          return new Response('{"id":700}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncStructure(
      config,
      {
        site: '/global',
        key: 'BASIC',
        migrationPlan: migrationPlanFile,
        migrationPhase: 'post',
        cleanupMigration: true,
      },
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.status).toBe('updated');
    expect(result.removedFieldReferences).toEqual(['oldField']);
    expect(result.migration).toEqual({
      scanned: 1,
      migrated: 1,
      unchanged: 0,
      failed: 0,
      dryRun: false,
      articleKeys: ['ARTICLE-001'],
      reasonBreakdown: {
        copiedToNewField: 1,
        alreadyHadTargetValue: 0,
        sourceEmpty: 0,
        noEffectiveChange: 0,
        sourceCleaned: 1,
      },
    });
    expect(formatLiferayResourceSyncStructure(result)).toContain('migration scanned=1 migrated=1');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('PUT http://localhost:8080/o/data-engine/v2.0/data-definitions/301'),
        expect.stringContaining('PUT http://localhost:8080/o/headless-delivery/v1.0/structured-contents/700'),
      ]),
    );
    const transitionIndex = calls.findIndex((call) =>
      call.includes('PUT http://localhost:8080/o/data-engine/v2.0/data-definitions/301'),
    );
    const migrationIndex = calls.findIndex((call) =>
      call.includes('PUT http://localhost:8080/o/headless-delivery/v1.0/structured-contents/700'),
    );
    const finalStructureIndex = calls.reduce(
      (lastIndex, call, index) =>
        call.includes('PUT http://localhost:8080/o/data-engine/v2.0/data-definitions/301') ? index : lastIndex,
      -1,
    );
    expect(transitionIndex).toBeGreaterThanOrEqual(0);
    expect(migrationIndex).toBeGreaterThan(transitionIndex);
    expect(finalStructureIndex).toBeGreaterThanOrEqual(0);
    expect(finalStructureIndex).toBeGreaterThan(migrationIndex);
  });

  test('marks structure update as recovered when the PUT times out but the new shape is later visible', async () => {
    const {config} = await createRepoFixture();
    let updateAttempts = 0;

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          if ((init?.method ?? 'GET') === 'PUT' || url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
            throw new Error('The operation timed out');
          }

          updateAttempts += 1;
          const fields =
            updateAttempts >= 2
              ? [{name: 'newField', customProperties: {fieldReference: 'newField'}}]
              : [{name: 'oldField', customProperties: {fieldReference: 'oldField'}}];

          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              dataDefinitionFields: fields,
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
          throw new Error('The operation timed out');
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncStructure(
      config,
      {site: '/global', key: 'BASIC', allowBreakingChange: true},
      {
        apiClient,
        tokenClient: TOKEN_CLIENT,
        sleep: async () => undefined,
      },
    );

    expect(result.status).toBe('updated');
    expect(result.recoveredAfterTimeout).toBe(true);
    expect(formatLiferayResourceSyncStructure(result)).toContain('recoveredAfterTimeout=true');
  });

  test('throws recoverable timeout when PUT times out and shape-based recovery cannot prove the update', async () => {
    const {config} = await createRepoFixture();

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          // Keep same shape before/after timeout to simulate unverifiable recovery.
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              dataDefinitionFields: [{name: 'oldField', customProperties: {fieldReference: 'oldField'}}],
            }),
            {status: 200},
          );
        }
        if ((init?.method ?? 'GET') === 'PUT' && url.endsWith('/o/data-engine/v2.0/data-definitions/301')) {
          throw new Error('The operation timed out');
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(
      runLiferayResourceSyncStructure(
        config,
        {site: '/global', key: 'BASIC', allowBreakingChange: true},
        {
          apiClient,
          tokenClient: TOKEN_CLIENT,
          sleep: async () => undefined,
        },
      ),
    ).rejects.toThrow('could not confirm whether the update eventually applied');
  });

  test('does not clean source fields during introduce even if the mapping requests cleanup', async () => {
    const {config, migrationPlanFile} = await createRepoFixture();
    await fs.writeJson(migrationPlanFile, {
      mappings: [{source: 'oldField', target: 'newField', cleanupSource: true}],
    });
    let persistedFields: Array<Record<string, unknown>> = [
      {name: 'oldField', contentFieldValue: {data: 'legacy value'}},
    ];

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
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
          return new Response(
            '{"items":[{"id":700,"key":"ARTICLE-001","contentStructureId":"301","structuredContentFolderId":0}],"lastPage":1}',
            {status: 200},
          );
        }
        if (url.includes('/o/headless-delivery/v1.0/structured-contents/700?')) {
          return new Response(
            JSON.stringify({
              id: 700,
              key: 'ARTICLE-001',
              contentStructureId: '301',
              contentFields: persistedFields,
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/700')) {
          const body = JSON.parse(String(init?.body ?? '{}'));
          expect(body.contentFields).toEqual([
            {name: 'oldField', contentFieldValue: {data: 'legacy value'}},
            {name: 'newField', contentFieldValue: {data: 'legacy value'}},
          ]);
          persistedFields = body.contentFields;
          return new Response('{"id":700}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncStructure(
      config,
      {
        site: '/global',
        key: 'BASIC',
        migrationPlan: migrationPlanFile,
      },
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.migration?.migrated).toBe(1);
  });

  test('migrates localized structured content values for every available language', async () => {
    const {config, migrationPlanFile} = await createRepoFixture();
    const localizedFields = new Map<string, Array<Record<string, unknown>>>([
      [
        'ca-ES',
        [
          {name: 'oldField', contentFieldValue: {data: 'valor cat'}},
          {name: 'newField', contentFieldValue: {data: ''}},
        ],
      ],
      [
        'en-US',
        [
          {name: 'oldField', contentFieldValue: {data: 'english value'}},
          {name: 'newField', contentFieldValue: {data: ''}},
        ],
      ],
    ]);

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        const acceptLanguage = headers.get('Accept-Language') ?? '';

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
          return new Response(
            '{"items":[{"id":700,"key":"ARTICLE-001","contentStructureId":"301","structuredContentFolderId":0}],"lastPage":1}',
            {status: 200},
          );
        }
        if (url.includes('/o/headless-delivery/v1.0/structured-contents/700?')) {
          if (acceptLanguage === '') {
            return new Response(
              JSON.stringify({
                id: 700,
                key: 'ARTICLE-001',
                contentStructureId: '301',
                availableLanguages: ['ca-ES', 'en-US'],
                contentFields: localizedFields.get('en-US'),
              }),
              {status: 200},
            );
          }

          return new Response(
            JSON.stringify({
              id: 700,
              key: 'ARTICLE-001',
              contentStructureId: '301',
              availableLanguages: ['ca-ES', 'en-US'],
              contentFields: localizedFields.get(acceptLanguage),
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/700')) {
          const body = JSON.parse(String(init?.body ?? '{}'));
          if (acceptLanguage === 'ca-ES') {
            expect(body.contentFields).toEqual([
              {name: 'oldField', contentFieldValue: {data: 'valor cat'}},
              {name: 'newField', contentFieldValue: {data: 'valor cat'}},
            ]);
          }
          if (acceptLanguage === 'en-US') {
            expect(body.contentFields).toEqual([
              {name: 'oldField', contentFieldValue: {data: 'english value'}},
              {name: 'newField', contentFieldValue: {data: 'english value'}},
            ]);
          }
          localizedFields.set(acceptLanguage, body.contentFields);
          return new Response(JSON.stringify({id: 700, contentFields: body.contentFields}), {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncStructure(
      config,
      {
        site: '/global',
        key: 'BASIC',
        migrationPlan: migrationPlanFile,
        migrationPhase: 'post',
      },
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.migration).toEqual({
      scanned: 1,
      migrated: 1,
      unchanged: 0,
      failed: 0,
      dryRun: false,
      articleKeys: ['ARTICLE-001'],
      reasonBreakdown: {
        copiedToNewField: 1,
        alreadyHadTargetValue: 0,
        sourceEmpty: 0,
        noEffectiveChange: 0,
        sourceCleaned: 0,
      },
    });
    expect(localizedFields.get('ca-ES')).toEqual([
      {name: 'oldField', contentFieldValue: {data: 'valor cat'}},
      {name: 'newField', contentFieldValue: {data: 'valor cat'}},
    ]);
    expect(localizedFields.get('en-US')).toEqual([
      {name: 'oldField', contentFieldValue: {data: 'english value'}},
      {name: 'newField', contentFieldValue: {data: 'english value'}},
    ]);
  });

  test('fails the migration when a structured content update cannot be persisted', async () => {
    const {config, migrationPlanFile} = await createRepoFixture();
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
          return new Response(
            '{"items":[{"id":700,"key":"ARTICLE-001","contentStructureId":"301","structuredContentFolderId":0}],"lastPage":1}',
            {status: 200},
          );
        }
        if (url.includes('/o/headless-delivery/v1.0/structured-contents/700?')) {
          return new Response(
            JSON.stringify({
              id: 700,
              key: 'ARTICLE-001',
              contentStructureId: '301',
              contentFields: [{name: 'oldField', contentFieldValue: {data: 'legacy value'}}],
            }),
            {status: 200},
          );
        }
        if (url.endsWith('/o/headless-delivery/v1.0/structured-contents/700')) {
          return new Response('{"message":"update failed"}', {status: 500});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(
      runLiferayResourceSyncStructure(
        config,
        {
          site: '/global',
          key: 'BASIC',
          migrationPlan: migrationPlanFile,
          migrationPhase: 'post',
        },
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow(
      'Structure migration failed for 1 content item(s): ARTICLE-001: structure-migrate update failed with status=500.',
    );
  });
});
