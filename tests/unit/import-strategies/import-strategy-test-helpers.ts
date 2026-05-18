import {vi} from 'vitest';

import type {OAuthTokenClient, TokenResponse} from '../../../src/core/http/auth.js';
import type {HttpApiClient} from '../../../src/core/http/client.js';

type MockHttpApiClient = Partial<Record<keyof HttpApiClient, ReturnType<typeof vi.fn>>>;

export function mockApiClient(methods: MockHttpApiClient): HttpApiClient {
  return methods as Partial<HttpApiClient> as HttpApiClient;
}

export function mockTokenClient(token?: Partial<TokenResponse>): OAuthTokenClient {
  return {
    fetchClientCredentialsToken: vi.fn().mockResolvedValue({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      ...token,
    }),
  };
}
