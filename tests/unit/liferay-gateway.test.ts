import {describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {OAuthTokenClient, TokenResponse} from '../../src/core/http/auth.js';
import type {HttpResponse, HttpApiClient} from '../../src/core/http/client.js';
import {CliError} from '../../src/core/errors.js';
import {LiferayGateway} from '../../src/features/liferay/liferay-gateway.js';

const mockConfig: AppConfig = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: null,
  liferayDir: null,
  files: {
    dockerEnv: null,
    liferayProfile: null,
  },
  liferay: {
    url: 'http://localhost:8080',
    timeoutSeconds: 45,
    oauth2ClientId: 'test-client',
    oauth2ClientSecret: 'test-secret',
    scopeAliases: 'default',
  },
};

const mockToken: TokenResponse = {
  accessToken: 'test-access-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
};

const createMockApiClient = (): HttpApiClient => ({
  get: vi.fn(),
  delete: vi.fn(),
  postJson: vi.fn(),
  postForm: vi.fn(),
  postMultipart: vi.fn(),
  putJson: vi.fn(),
});

const createMockTokenClient = (): OAuthTokenClient => ({
  fetchClientCredentialsToken: vi.fn(() => Promise.resolve(mockToken)),
});

const mockHttpResponse = <T>(ok: boolean, status: number, data: T): HttpResponse<T> => ({
  ok,
  status,
  data,
  headers: new Headers(),
  body: JSON.stringify(data),
});

describe('LiferayGateway', () => {
  describe('getJson', () => {
    test('calls apiClient.get with Authorization header', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, {id: 1, name: 'test'});

      vi.mocked(apiClient.get).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const result = await gateway.getJson<{id: number; name: string}>('/api/test', 'fetch-test');

      expect(result).toEqual({id: 1, name: 'test'});
      expect(apiClient.get).toHaveBeenCalledWith(
        'http://localhost:8080',
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
          timeoutSeconds: 45,
        }),
      );
    });

    test('uses config timeoutSeconds', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, {data: 'value'});

      vi.mocked(apiClient.get).mockResolvedValue(response);

      const config = {...mockConfig, liferay: {...mockConfig.liferay, timeoutSeconds: 60}};
      const gateway = new LiferayGateway(config, apiClient, tokenClient);

      await gateway.getJson('/api/test', 'test');

      expect(apiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({timeoutSeconds: 60}),
      );
    });

    test('throws CliError when response not ok (404)', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 404, null);

      vi.mocked(apiClient.get).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await expect(gateway.getJson('/api/missing', 'fetch-missing')).rejects.toThrow(CliError);
    });

    test('includes label in error message', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 500, null);

      vi.mocked(apiClient.get).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await expect(gateway.getJson('/api/test', 'custom-operation')).rejects.toThrow(/custom-operation/);
    });

    test('includes status code in error message', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 503, null);

      vi.mocked(apiClient.get).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await expect(gateway.getJson('/api/test', 'fetch')).rejects.toThrow(/status=503/);
    });

    test('returns null data as null', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, null);

      vi.mocked(apiClient.get).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const result = await gateway.getJson('/api/test', 'fetch');

      expect(result).toBeNull();
    });
  });

  describe('postJson', () => {
    test('calls apiClient.postJson with correct payload and Authorization header', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, {id: 2, created: true});

      vi.mocked(apiClient.postJson).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const payload = {name: 'new-item'};
      const result = await gateway.postJson('/api/items', payload, 'create-item');

      expect(result).toEqual({id: 2, created: true});
      expect(apiClient.postJson).toHaveBeenCalledWith(
        'http://localhost:8080',
        '/api/items',
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
          timeoutSeconds: 45,
        }),
      );
    });

    test('handles error response (400)', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 400, null);

      vi.mocked(apiClient.postJson).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await expect(gateway.postJson('/api/items', {}, 'validate')).rejects.toThrow(/status=400/);
    });
  });

  describe('postForm', () => {
    test('calls apiClient.postForm with Authorization header', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, {success: true});

      vi.mocked(apiClient.postForm).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const form = {name: 'value', key: 'test-key'};
      await gateway.postForm('/api/submit', form, 'submit-form');

      expect(apiClient.postForm).toHaveBeenCalledWith(
        'http://localhost:8080',
        '/api/submit',
        form,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    test('handles error response (403)', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 403, null);

      vi.mocked(apiClient.postForm).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await expect(gateway.postForm('/api/submit', {}, 'forbidden')).rejects.toThrow(/status=403/);
    });
  });

  describe('postFormRaw', () => {
    test('calls apiClient.postForm with Authorization header and returns raw response', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 201, {id: 123});

      vi.mocked(apiClient.postForm).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const form = {name: 'value'};
      const result = await gateway.postFormRaw('/api/raw-submit', form);

      expect(result).toBe(response);
      expect(apiClient.postForm).toHaveBeenCalledWith(
        'http://localhost:8080',
        '/api/raw-submit',
        form,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    test('does not throw for non-ok responses', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 409, null);

      vi.mocked(apiClient.postForm).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const result = await gateway.postFormRaw('/api/raw-submit', {key: 'x'});

      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
    });
  });

  describe('postMultipart', () => {
    test('calls apiClient.postMultipart with Authorization header', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, {uploaded: true});

      vi.mocked(apiClient.postMultipart).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const form = new FormData();
      form.append('file', new Blob(['test']), 'test.txt');

      await gateway.postMultipart('/api/upload', form, 'upload-file');

      expect(apiClient.postMultipart).toHaveBeenCalledWith(
        'http://localhost:8080',
        '/api/upload',
        form,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });
  });

  describe('putJson', () => {
    test('calls apiClient.putJson with correct payload and Authorization header', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, {id: 1, updated: true});

      vi.mocked(apiClient.putJson).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const payload = {name: 'updated-name'};
      const result = await gateway.putJson('/api/items/1', payload, 'update-item');

      expect(result).toEqual({id: 1, updated: true});
      expect(apiClient.putJson).toHaveBeenCalledWith(
        'http://localhost:8080',
        '/api/items/1',
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
          timeoutSeconds: 45,
        }),
      );
    });

    test('handles error response (409)', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 409, null);

      vi.mocked(apiClient.putJson).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await expect(gateway.putJson('/api/items/1', {}, 'conflict')).rejects.toThrow(/status=409/);
    });
  });

  describe('deleteJson', () => {
    test('calls apiClient.delete with Authorization header', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 200, {id: 1, deleted: true});

      vi.mocked(apiClient.delete).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const result = await gateway.deleteJson<{id: number; deleted: boolean}>('/api/items/1', 'delete-item');

      expect(result).toEqual({id: 1, deleted: true});
      expect(apiClient.delete).toHaveBeenCalledWith(
        'http://localhost:8080',
        '/api/items/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
          timeoutSeconds: 45,
        }),
      );
    });

    test('uses the token client to obtain the access token', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 204, null);

      vi.mocked(apiClient.delete).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      await gateway.deleteJson('/api/items/99', 'delete-item');

      expect(tokenClient.fetchClientCredentialsToken).toHaveBeenCalledTimes(1);
    });

    test('returns null when response has no body', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(true, 204, null);

      vi.mocked(apiClient.delete).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const result = await gateway.deleteJson('/api/items/99', 'delete-item');

      expect(result).toBeNull();
    });

    test('handles error response (404)', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 404, null);

      vi.mocked(apiClient.delete).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await expect(gateway.deleteJson('/api/items/999', 'delete-missing')).rejects.toThrow(/status=404/);
    });

    test('throws CliError with LIFERAY_GATEWAY_ERROR code on failure', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 500, null);

      vi.mocked(apiClient.delete).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      try {
        await gateway.deleteJson('/api/items/1', 'delete-item');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe('LIFERAY_GATEWAY_ERROR');
      }
    });
  });

  describe('token caching', () => {
    test('caches access token and reuses it on subsequent calls', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();

      vi.mocked(apiClient.get).mockResolvedValue(mockHttpResponse(true, 200, {data: 'test'}));

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await gateway.getJson('/api/1', 'call-1');
      await gateway.getJson('/api/2', 'call-2');
      await gateway.getJson('/api/3', 'call-3');

      expect(tokenClient.fetchClientCredentialsToken).toHaveBeenCalledTimes(1);
    });

    test('uses different cache keys for different configs', async () => {
      const apiClient1 = createMockApiClient();
      const apiClient2 = createMockApiClient();
      const tokenClient1 = createMockTokenClient();
      const tokenClient2 = createMockTokenClient();

      vi.mocked(apiClient1.get).mockResolvedValue(mockHttpResponse(true, 200, {data: 'test'}));
      vi.mocked(apiClient2.get).mockResolvedValue(mockHttpResponse(true, 200, {data: 'test'}));

      const config1 = {...mockConfig, liferay: {...mockConfig.liferay, oauth2ClientId: 'client-1'}};
      const config2 = {...mockConfig, liferay: {...mockConfig.liferay, oauth2ClientId: 'client-2'}};

      const gateway1 = new LiferayGateway(config1, apiClient1, tokenClient1);
      const gateway2 = new LiferayGateway(config2, apiClient2, tokenClient2);

      await gateway1.getJson('/api/test', 'test');
      await gateway2.getJson('/api/test', 'test');

      expect(tokenClient1.fetchClientCredentialsToken).toHaveBeenCalledTimes(1);
      expect(tokenClient2.fetchClientCredentialsToken).toHaveBeenCalledTimes(1);
    });

    test('clears token cache on demand', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();

      vi.mocked(apiClient.get).mockResolvedValue(mockHttpResponse(true, 200, {data: 'test'}));

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      await gateway.getJson('/api/1', 'call-1');
      gateway.clearTokenCache();
      await gateway.getJson('/api/2', 'call-2');

      expect(tokenClient.fetchClientCredentialsToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    test('uses LIFERAY_GATEWAY_ERROR code in errors', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();
      const response = mockHttpResponse(false, 500, null);

      vi.mocked(apiClient.get).mockResolvedValue(response);

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);

      try {
        await gateway.getJson('/api/test', 'test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe('LIFERAY_GATEWAY_ERROR');
      }
    });

    test('handles all 4xx status codes', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const statuses = [400, 401, 403, 404, 409, 429];

      for (const status of statuses) {
        const response = mockHttpResponse(false, status, null);
        vi.mocked(apiClient.get).mockResolvedValue(response);

        await expect(gateway.getJson('/api/test', 'test')).rejects.toThrow(new RegExp(`status=${status}`));
      }
    });

    test('handles all 5xx status codes', async () => {
      const apiClient = createMockApiClient();
      const tokenClient = createMockTokenClient();

      const gateway = new LiferayGateway(mockConfig, apiClient, tokenClient);
      const statuses = [500, 502, 503, 504];

      for (const status of statuses) {
        const response = mockHttpResponse(false, status, null);
        vi.mocked(apiClient.get).mockResolvedValue(response);

        await expect(gateway.getJson('/api/test', 'test')).rejects.toThrow(new RegExp(`status=${status}`));
      }
    });
  });
});
