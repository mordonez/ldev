import fs from 'fs-extra';
import {describe, expect, test} from 'vitest';

import {createOAuthTokenClient} from '../../src/core/http/auth.js';
import {createLiferayApiClient} from '../../src/core/http/client.js';
import {formatLiferayAuthToken} from '../../src/features/liferay/liferay-auth.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const SETTINGS = {
  url: 'http://localhost:8080',
  oauth2ClientId: 'client-id',
  oauth2ClientSecret: 'client-secret',
  scopeAliases: 'scope-a,scope-b',
  timeoutSeconds: 30,
};

describe('liferay auth', () => {
  test('falls back from Basic auth to client_secret_post', async () => {
    const calls: Array<{headers?: Record<string, string>; form: Record<string, string>}> = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const body = String(init?.body ?? '');
        const form = Object.fromEntries(new URLSearchParams(body));
        calls.push({headers: init?.headers as Record<string, string>, form});

        if (calls.length === 1) {
          return new Response('{"error":"invalid_client"}', {status: 401});
        }

        return new Response('{"access_token":"token-12345678","token_type":"Bearer","expires_in":3600}', {status: 200});
      },
    });
    const tokenClient = createOAuthTokenClient({apiClient, cacheDir: createTempDir('ldev-oauth-test-basic-')});

    const token = await tokenClient.fetchClientCredentialsToken(SETTINGS);

    expect(token.accessToken).toBe('token-12345678');
    expect(calls).toHaveLength(2);
    expect(calls[0].headers?.Authorization).toContain('Basic ');
    expect(calls[1].form.client_id).toBe('client-id');
    expect(calls[1].form.client_secret).toBe('client-secret');
  });

  test('retries invalid_client before failing', async () => {
    let attempts = 0;
    const apiClient = createLiferayApiClient({
      fetchImpl: async () => {
        attempts += 1;
        return new Response('{"error":"invalid_client"}', {status: 401});
      },
    });
    const tokenClient = createOAuthTokenClient({
      apiClient,
      cacheDir: createTempDir('ldev-oauth-test-invalid-client-'),
      invalidClientRetryDelayMs: 1,
      invalidClientMaxWaitMs: 3,
    });

    await expect(tokenClient.fetchClientCredentialsToken(SETTINGS)).rejects.toThrow('Token request failed');
    expect(attempts).toBeGreaterThan(1);
  });

  test('retries without scope after invalid_grant', async () => {
    const seenBodies: string[] = [];
    const apiClient = createLiferayApiClient({
      fetchImpl: async (_input, init) => {
        const body = String(init?.body ?? '');
        seenBodies.push(body);
        if (body.includes('scope=')) {
          return new Response('{"error":"invalid_grant"}', {status: 400});
        }
        return new Response('{"access_token":"token-abcdefgh","token_type":"Bearer","expires_in":120}', {status: 200});
      },
    });
    const tokenClient = createOAuthTokenClient({apiClient, cacheDir: createTempDir('ldev-oauth-test-scope-')});

    const token = await tokenClient.fetchClientCredentialsToken(SETTINGS);

    expect(token.accessToken).toBe('token-abcdefgh');
    expect(seenBodies[0]).toContain('scope=');
    expect(seenBodies.at(-1)).toBe('grant_type=client_credentials');
  });

  test('formats raw and masked token output', () => {
    const result = {
      ok: true as const,
      baseUrl: 'http://localhost:8080',
      clientId: 'client-id',
      tokenType: 'Bearer',
      expiresIn: 3600,
      accessToken: 'token-12345678',
      accessTokenMasked: 'toke...5678',
    };

    expect(formatLiferayAuthToken(result, {raw: true})).toBe('token-12345678');
    expect(formatLiferayAuthToken(result, {raw: false})).toContain('accessTokenMasked=toke...5678');
  });

  test('reuses a cached token across client instances', async () => {
    let calls = 0;
    const cacheDir = createTempDir('ldev-oauth-cache-');
    const apiClient = createLiferayApiClient({
      fetchImpl: async () => {
        calls += 1;
        return new Response('{"access_token":"token-cached","token_type":"Bearer","expires_in":3600}', {status: 200});
      },
    });

    const firstClient = createOAuthTokenClient({apiClient, cacheDir, now: () => 1_000});
    const secondClient = createOAuthTokenClient({apiClient, cacheDir, now: () => 2_000});

    const first = await firstClient.fetchClientCredentialsToken(SETTINGS);
    const second = await secondClient.fetchClientCredentialsToken(SETTINGS);

    expect(first.accessToken).toBe('token-cached');
    expect(second.accessToken).toBe('token-cached');
    expect(calls).toBe(1);
    const files = await fs.readdir(cacheDir);
    expect(files.some((entry) => entry.endsWith('.json'))).toBe(true);
  });

  test('refreshes the cached token when it is close to expiry', async () => {
    let calls = 0;
    const cacheDir = createTempDir('ldev-oauth-cache-expiry-');
    const apiClient = createLiferayApiClient({
      fetchImpl: async () => {
        calls += 1;
        return new Response(`{"access_token":"token-${calls}","token_type":"Bearer","expires_in":20}`, {status: 200});
      },
    });

    const firstClient = createOAuthTokenClient({apiClient, cacheDir, now: () => 1_000});
    const secondClient = createOAuthTokenClient({apiClient, cacheDir, now: () => 18_000});

    const first = await firstClient.fetchClientCredentialsToken(SETTINGS);
    const second = await secondClient.fetchClientCredentialsToken(SETTINGS);

    expect(first.accessToken).toBe('token-1');
    expect(second.accessToken).toBe('token-2');
    expect(calls).toBe(2);
  });
});
