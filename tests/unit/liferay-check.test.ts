import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {formatLiferayHealth, runLiferayHealth} from '../../src/features/liferay/liferay-health.js';

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

describe('liferay check', () => {
  test('reports basic API reachability', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/o/headless-admin-site/v1.0/sites?pageSize=1')) {
          return new Response('{"items":[{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}],"lastPage":1}', {
            status: 200,
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayHealth(CONFIG, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result).toEqual({
      ok: true,
      baseUrl: 'http://localhost:8080',
      clientId: 'client-id',
      tokenType: 'Bearer',
      expiresIn: 3600,
      checkedPath: '/o/headless-admin-site/v1.0/sites?pageSize=1',
      status: 200,
      permissionDenied: false,
    });
    expect(formatLiferayHealth(result)).toContain('HEALTH_OK');
    expect(formatLiferayHealth(result)).toContain('status=200');
  });

  test('reports partial health when the default probe is denied', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async () => new Response('forbidden', {status: 403}),
    });

    const result = await runLiferayHealth(CONFIG, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.permissionDenied).toBe(true);
    expect(result.status).toBe(403);
    expect(formatLiferayHealth(result)).toContain('HEALTH_PARTIAL');
    expect(formatLiferayHealth(result)).toContain('status=403');
  });
});
