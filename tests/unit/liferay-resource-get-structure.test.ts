import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceStructure,
  runLiferayResourceGetStructure,
} from '../../src/features/liferay/resource/liferay-resource-get-structure.js';

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

describe('liferay resource get-structure', () => {
  test('resolves site and fetches structure by key', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

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
      },
    });

    const result = await runLiferayResourceGetStructure(
      CONFIG,
      {site: '/global', key: 'BASIC-WEB-CONTENT'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toEqual({
      siteId: 20121,
      siteFriendlyUrl: '/global',
      siteName: 'Global',
      key: 'BASIC-WEB-CONTENT',
      id: 301,
      name: 'Basic Web Content',
      raw: {
        id: 301,
        dataDefinitionKey: 'BASIC-WEB-CONTENT',
        name: {en_US: 'Basic Web Content'},
      },
    });
    expect(formatLiferayResourceStructure(result)).toContain('key=BASIC-WEB-CONTENT');
  });

  test('surfaces structure errors clearly', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }

        return new Response('not-found', {status: 404});
      },
    });

    await expect(
      runLiferayResourceGetStructure(CONFIG, {site: '/global', key: 'MISSING'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow('resource get-structure failed with status=404');
  });

  test('resolves structure by numeric id', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

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
      },
    });

    const result = await runLiferayResourceGetStructure(
      CONFIG,
      {site: '/global', id: '31801'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.id).toBe(31801);
    expect(result.key).toBe('BASIC-WEB-CONTENT');
  });
});
