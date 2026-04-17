import {describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {OAuthTokenClient, TokenResponse} from '../../src/core/http/auth.js';
import type {HttpResponse, HttpApiClient} from '../../src/core/http/client.js';
import {postFormCandidates} from '../../src/features/liferay/resource/liferay-resource-sync-shared.js';

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

const mockHttpResponse = <T>(ok: boolean, status: number, data: T, body?: string): HttpResponse<T> => ({
  ok,
  status,
  data,
  headers: new Headers(),
  body: body ?? (data == null ? '' : JSON.stringify(data)),
});

describe('postFormCandidates', () => {
  test('returns data on first successful candidate', async () => {
    const apiClient = createMockApiClient();
    const tokenClient = createMockTokenClient();

    vi.mocked(apiClient.postForm).mockResolvedValue(
      mockHttpResponse(true, 200, {templateId: 101, templateKey: 'BASIC'}),
    );

    const result = await postFormCandidates<{templateId: number; templateKey: string}>(
      mockConfig,
      '/api/jsonws/ddm.ddmtemplate/add-template',
      [{nameMap: '{}'}],
      'template-create',
      {apiClient, tokenClient},
    );

    expect(result.templateId).toBe(101);
    expect(apiClient.postForm).toHaveBeenCalledTimes(1);
  });

  test('tries next candidate when first fails', async () => {
    const apiClient = createMockApiClient();
    const tokenClient = createMockTokenClient();

    vi.mocked(apiClient.postForm)
      .mockResolvedValueOnce(mockHttpResponse(false, 400, null, 'first-invalid'))
      .mockResolvedValueOnce(mockHttpResponse(true, 200, {templateId: 202}));

    const result = await postFormCandidates<{templateId: number}>(
      mockConfig,
      '/api/jsonws/ddm.ddmtemplate/update-template',
      [{language: 'x'}, {language: 'ftl'}],
      'template-update',
      {apiClient, tokenClient},
    );

    expect(result.templateId).toBe(202);
    expect(apiClient.postForm).toHaveBeenCalledTimes(2);
  });

  test('aggregates status and body when all candidates fail', async () => {
    const apiClient = createMockApiClient();
    const tokenClient = createMockTokenClient();

    vi.mocked(apiClient.postForm)
      .mockResolvedValueOnce(mockHttpResponse(false, 400, null, 'bad-request'))
      .mockResolvedValueOnce(mockHttpResponse(false, 403, null, 'forbidden'));

    await expect(
      postFormCandidates(
        mockConfig,
        '/api/jsonws/ddm.ddmtemplate/add-template',
        [{nameMap: '{}'}, {nameMap: '{"x":"y"}'}],
        'template-create',
        {apiClient, tokenClient},
      ),
    ).rejects.toThrow(
      /template-create failed on \/api\/jsonws\/ddm\.ddmtemplate\/add-template \(status=400 body=bad-request \| status=403 body=forbidden\)/,
    );
  });
});
