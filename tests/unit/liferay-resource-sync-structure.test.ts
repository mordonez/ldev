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
    ).rejects.toThrow('Define --migration-plan o usa --allow-breaking-change');
  });

  test('updates structure and migrates structured contents with a migration plan', async () => {
    const {config, migrationPlanFile} = await createRepoFixture();
    const calls: string[] = [];
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
              contentFields: [{name: 'oldField', contentFieldValue: {data: 'legacy value'}}],
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

  test('does not clean source fields during introduce even if the mapping requests cleanup', async () => {
    const {config, migrationPlanFile} = await createRepoFixture();
    await fs.writeJson(migrationPlanFile, {
      mappings: [{source: 'oldField', target: 'newField', cleanupSource: true}],
    });

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
              contentFields: [{name: 'oldField', contentFieldValue: {data: 'legacy value'}}],
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
});
