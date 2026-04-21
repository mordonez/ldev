import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {formatLiferayHealth, runLiferayHealth} from '../../src/features/liferay/liferay-health.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';

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

describe('liferay check', () => {
  test('reports basic API reachability', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/headless-admin-user/v1.0/my-user-account')) {
          return new Response('{"id":20123,"name":"Test User"}', {
            status: 200,
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const result = await runLiferayHealth(CONFIG, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result).toEqual({
      ok: true,
      baseUrl: 'http://localhost:8080',
      clientId: 'client-id',
      tokenType: 'Bearer',
      expiresIn: 3600,
      checkedPath: '/o/headless-admin-user/v1.0/my-user-account',
      status: 200,
      permissionDenied: false,
      probeUnavailable: false,
    });
    expect(formatLiferayHealth(result)).toContain('HEALTH_OK');
    expect(formatLiferayHealth(result)).toContain('status=200');
  });

  test('reports partial health when the user probe is denied', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl(() => new Response('forbidden', {status: 403})),
    });

    const result = await runLiferayHealth(CONFIG, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.permissionDenied).toBe(true);
    expect(result.status).toBe(403);
    expect(result.probeUnavailable).toBe(false);
    expect(formatLiferayHealth(result)).toContain('HEALTH_PARTIAL');
    expect(formatLiferayHealth(result)).toContain('status=403');
  });

  test('reports partial health when the user probe is unavailable on the runtime', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl(() => new Response('not found', {status: 404})),
    });

    const result = await runLiferayHealth(CONFIG, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.permissionDenied).toBe(false);
    expect(result.probeUnavailable).toBe(true);
    expect(result.status).toBe(404);
    expect(formatLiferayHealth(result)).toContain('HEALTH_PARTIAL');
    expect(formatLiferayHealth(result)).toContain('status=404');
  });
});
