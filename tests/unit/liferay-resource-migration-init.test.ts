import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceMigrationInit,
  runLiferayResourceMigrationInit,
} from '../../src/features/liferay/liferay-resource-migration-init.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

async function createRepoFixture() {
  const repoRoot = createTempDir('dev-cli-resource-migration-init-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');

  const structureFile = path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'global', 'BASIC.json');
  await fs.writeJson(structureFile, {
    dataDefinitionKey: 'BASIC',
    dataDefinitionFields: [
      {
        name: 'content',
        fieldType: 'fieldset',
        customProperties: {fieldReference: 'content', ddmStructureKey: 'FIELDSET-NEW'},
        nestedDataDefinitionFields: [{name: 'newHeadline', customProperties: {fieldReference: 'newHeadline'}}],
      },
    ],
  });

  return {
    structureFile,
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
        migrations: 'liferay/resources/journal/migrations',
      },
    },
  };
}

describe('liferay resource migration-init', () => {
  test('generates a scaffold descriptor with fieldset target suggestions', async () => {
    const {config, structureFile} = await createRepoFixture();
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"groupId":20121,"friendlyURL":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":1,"webId":"liferay.com"}]', {status: 200});
        }
        if (url.includes('/by-data-definition-key/BASIC')) {
          return new Response(
            JSON.stringify({
              id: 301,
              dataDefinitionKey: 'BASIC',
              name: 'Basic',
              dataDefinitionFields: [{name: 'oldHeadline', customProperties: {fieldReference: 'oldHeadline'}}],
            }),
            {status: 200},
          );
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceMigrationInit(
      config,
      {
        site: '/global',
        key: 'BASIC',
      },
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.structureFile).toBe(structureFile);
    expect(result.removedFieldReferences).toEqual(['oldHeadline']);
    expect(result.candidateTargetFieldReferences).toEqual(['content[].newHeadline']);
    expect(result.outputPath).toBe(
      path.join(config.repoRoot, 'liferay', 'resources', 'journal', 'migrations', 'global', 'BASIC.migration.json'),
    );
    expect(formatLiferayResourceMigrationInit(result)).toContain('removedFieldReferences=oldHeadline');

    const descriptor = await fs.readJson(result.outputPath);
    expect(descriptor.templates).toBe(false);
    expect(descriptor.dependentStructures).toEqual(['FIELDSET-NEW']);
    expect(descriptor.introduce.structureFile).toBeUndefined();
    expect(descriptor.introduce.mappings).toEqual([]);
    expect(descriptor.introduce.mappingHelp.examples).toEqual([
      {source: 'oldTitle', target: 'newTitle', cleanupSource: false},
      {source: 'legacyBody', target: 'content[].body', cleanupSource: true},
    ]);
    expect(descriptor.introduce.suggestions.suggestedMappings).toEqual([
      {source: 'oldHeadline', target: 'content[].newHeadline', cleanupSource: false},
    ]);
    expect(descriptor.cleanup).toBeUndefined();
    expect(formatLiferayResourceMigrationInit(result)).toContain('dependentStructures=FIELDSET-NEW');
  });
});
