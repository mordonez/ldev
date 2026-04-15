import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {formatLiferayPreflight, runLiferayPreflight} from '../../src/features/liferay/liferay-preflight.js';

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

function makeApiClient(responses: Record<string, {status: number; body: string}>) {
  return createLiferayApiClient({
    fetchImpl: async (input) => {
      const url = String(input);
      for (const [pattern, response] of Object.entries(responses)) {
        if (url.includes(pattern)) {
          return new Response(response.body, {status: response.status});
        }
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
}

describe('runLiferayPreflight', () => {
  test('all surfaces ok returns ok status and headless fallback', async () => {
    const apiClient = makeApiClient({
      '/o/headless-admin-site/v1.0/sites': {status: 200, body: '{"items":[],"lastPage":1}'},
      '/o/headless-admin-user/v1.0/my-user-account': {status: 200, body: '{"id":1}'},
      '/api/jsonws/portal/get-build-number': {status: 200, body: '7400'},
    });

    const result = await runLiferayPreflight(
      {...CONFIG, liferay: {...CONFIG.liferay, url: 'http://localhost:9001'}},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.adminSite).toBe('ok');
    expect(result.adminUser).toBe('ok');
    expect(result.jsonws).toBe('ok');
    expect(result.expectedFallback).toBe('headless');
  });

  test('adminSite 403 → forbidden; fallback to jsonws when jsonws ok', async () => {
    const apiClient = makeApiClient({
      '/o/headless-admin-site/v1.0/sites': {status: 403, body: 'forbidden'},
      '/o/headless-admin-user/v1.0/my-user-account': {status: 403, body: 'forbidden'},
      '/api/jsonws/portal/get-build-number': {status: 200, body: '7400'},
    });

    const result = await runLiferayPreflight(
      {...CONFIG, liferay: {...CONFIG.liferay, url: 'http://localhost:9002'}},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.adminSite).toBe('forbidden');
    expect(result.adminUser).toBe('forbidden');
    expect(result.jsonws).toBe('ok');
    expect(result.expectedFallback).toBe('jsonws');
  });

  test('adminSite 404 with adminUser ok → expectedFallback is admin-user', async () => {
    const apiClient = makeApiClient({
      '/o/headless-admin-site/v1.0/sites': {status: 404, body: 'not found'},
      '/o/headless-admin-user/v1.0/my-user-account': {status: 200, body: '{}'},
      '/api/jsonws/portal/get-build-number': {status: 200, body: '7400'},
    });

    const result = await runLiferayPreflight(
      {...CONFIG, liferay: {...CONFIG.liferay, url: 'http://localhost:9003'}},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.adminSite).toBe('unavailable');
    expect(result.expectedFallback).toBe('admin-user');
  });

  test('all surfaces return 403 → expectedFallback is none', async () => {
    const apiClient = makeApiClient({
      '/o/headless-admin-site/v1.0/sites': {status: 403, body: 'forbidden'},
      '/o/headless-admin-user/v1.0/my-user-account': {status: 403, body: 'forbidden'},
      '/api/jsonws/portal/get-build-number': {status: 403, body: 'forbidden'},
    });

    const result = await runLiferayPreflight(
      {...CONFIG, liferay: {...CONFIG.liferay, url: 'http://localhost:9004'}},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.adminSite).toBe('forbidden');
    expect(result.jsonws).toBe('forbidden');
    expect(result.expectedFallback).toBe('none');
  });

  test('network error → unknown status', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: async () => {
        throw new Error('network error');
      },
    });

    const result = await runLiferayPreflight(
      {...CONFIG, liferay: {...CONFIG.liferay, url: 'http://localhost:9005'}},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.adminSite).toBe('unknown');
    expect(result.adminUser).toBe('unknown');
    expect(result.jsonws).toBe('unknown');
    expect(result.expectedFallback).toBe('none');
  });

  test('caches result; second call does not re-probe', async () => {
    let callCount = 0;
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('preflight-cache-test')) {
          callCount += 1;
          return new Response('{"items":[]}', {status: 200});
        }
        return new Response('{}', {status: 200});
      },
    });

    const cfg = {...CONFIG, liferay: {...CONFIG.liferay, url: 'http://preflight-cache-test:8080'}};
    const deps = {apiClient, tokenClient: TOKEN_CLIENT};

    await runLiferayPreflight(cfg, deps);
    const countAfterFirst = callCount;

    await runLiferayPreflight(cfg, deps); // should hit cache
    expect(callCount).toBe(countAfterFirst);
  });

  test('forceRefresh bypasses cache', async () => {
    let callCount = 0;
    const apiClient = createLiferayApiClient({
      fetchImpl: async () => {
        callCount += 1;
        return new Response('{}', {status: 200});
      },
    });

    const cfg = {...CONFIG, liferay: {...CONFIG.liferay, url: 'http://preflight-refresh-test:8080'}};
    const deps = {apiClient, tokenClient: TOKEN_CLIENT};

    await runLiferayPreflight(cfg, deps);
    const after1 = callCount;

    await runLiferayPreflight(cfg, {...deps, forceRefresh: true});
    expect(callCount).toBeGreaterThan(after1);
  });
});

describe('formatLiferayPreflight', () => {
  test('formats all-ok result', () => {
    const result = {
      adminSite: 'ok' as const,
      adminUser: 'ok' as const,
      jsonws: 'ok' as const,
      expectedFallback: 'headless' as const,
    };
    const output = formatLiferayPreflight(result);
    expect(output).toContain('adminSite');
    expect(output).toContain('✓');
    expect(output).toContain('headless');
  });

  test('formats forbidden result', () => {
    const result = {
      adminSite: 'forbidden' as const,
      adminUser: 'forbidden' as const,
      jsonws: 'ok' as const,
      expectedFallback: 'jsonws' as const,
    };
    const output = formatLiferayPreflight(result);
    expect(output).toContain('403 forbidden');
    expect(output).toContain('jsonws');
  });
});
