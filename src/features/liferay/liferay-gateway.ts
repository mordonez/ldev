import type {AppConfig} from '../../core/config/load-config.js';
import {CliError} from '../../core/errors.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import {createOAuthTokenClient} from '../../core/http/auth.js';
import type {HttpRequestOptions, HttpResponse, HttpApiClient} from '../../core/http/client.js';
import {createLiferayApiClient} from '../../core/http/client.js';
import {buildAuthOptions, expectJsonSuccess} from './liferay-http-shared.js';

/**
 * LiferayGateway: Centralized HTTP abstraction for Liferay API calls.
 *
 * Encapsulates:
 * - Automatic Bearer token acquisition (with caching)
 * - Consistent Authorization header injection
 * - Timeout propagation from config
 * - Unified error handling (4xx/5xx status checks)
 *
 * Design for incremental adoption:
 * - Dependency injection for apiClient and tokenClient (testable, mockable)
 * - No breaking changes to existing authedGetJson, authedPostForm patterns
 * - Coexists with liferay-http-shared utilities during migration phase
 *
 * Usage:
 *   const gateway = createLiferayGateway(config);
 *   const template = await gateway.getJson<Template>('/path', 'fetch-template');
 */
export class LiferayGateway {
  private accessTokenCache: Map<string, {token: string; cachedAt: number}> = new Map();
  private readonly tokenCacheTTL = 3600000; // 1 hour

  constructor(
    private config: AppConfig,
    private apiClient: HttpApiClient,
    private tokenClient: OAuthTokenClient,
  ) {}

  private getCacheKey(): string {
    return [this.config.liferay.url, this.config.liferay.oauth2ClientId, this.config.liferay.oauth2ClientSecret].join(
      '|',
    );
  }

  /**
   * Fetch or return cached access token.
   * Cache key includes url + clientId + clientSecret to support multi-instance scenarios.
   * TTL: 1 hour (refreshed when expired).
   */
  private async getAccessToken(): Promise<string> {
    const cacheKey = this.getCacheKey();

    const now = Date.now();
    const cached = this.accessTokenCache.get(cacheKey);

    if (cached && now - cached.cachedAt < this.tokenCacheTTL) {
      return cached.token;
    }

    const {accessToken} = await this.tokenClient.fetchClientCredentialsToken(this.config.liferay);
    this.accessTokenCache.set(cacheKey, {token: accessToken, cachedAt: now});

    return accessToken;
  }

  /**
   * Seed the gateway token cache with a caller-provided access token.
   * Useful during incremental migration from helpers that already receive a token.
   */
  seedAccessToken(accessToken: string): void {
    this.accessTokenCache.set(this.getCacheKey(), {token: accessToken, cachedAt: Date.now()});
  }

  private async requestWith401Retry<T>(
    request: (accessToken: string) => Promise<HttpResponse<T>>,
  ): Promise<HttpResponse<T>> {
    const firstToken = await this.getAccessToken();
    const firstResponse = await request(firstToken);

    if (firstResponse.status !== 401) {
      return firstResponse;
    }

    // Token may be stale/revoked; refresh once and retry the same request.
    this.clearTokenCache();
    const refreshedToken = await this.getAccessToken();
    return request(refreshedToken);
  }

  /**
   * GET /path, parse JSON, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async getJson<T>(path: string, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    const response = await this.requestWith401Retry((accessToken) => {
      const authOptions = buildAuthOptions(this.config, accessToken);
      return this.apiClient.get<T>(this.config.liferay.url, path, {
        ...authOptions,
        ...requestOptions,
        headers: {
          ...authOptions.headers,
          ...requestOptions?.headers,
        },
      });
    });

    const success = expectGatewayJsonSuccess(response, label, path);
    return (success.data ?? null) as T;
  }

  /**
   * POST JSON /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async postJson<T>(path: string, payload: unknown, label: string): Promise<T> {
    const response = await this.requestWith401Retry((accessToken) =>
      this.apiClient.postJson<T>(this.config.liferay.url, path, payload, buildAuthOptions(this.config, accessToken)),
    );

    const success = expectGatewayJsonSuccess(response, label, path);
    return (success.data ?? null) as T;
  }

  /**
   * POST form /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async postForm<T>(path: string, form: Record<string, string>, label: string): Promise<T> {
    const response = await this.requestWith401Retry((accessToken) =>
      this.apiClient.postForm<T>(this.config.liferay.url, path, form, buildAuthOptions(this.config, accessToken)),
    );

    const success = expectGatewayJsonSuccess(response, label, path);
    return (success.data ?? null) as T;
  }

  /**
   * POST multipart /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async postMultipart<T>(path: string, form: FormData, label: string): Promise<T> {
    const response = await this.requestWith401Retry((accessToken) =>
      this.apiClient.postMultipart<T>(this.config.liferay.url, path, form, buildAuthOptions(this.config, accessToken)),
    );

    const success = expectGatewayJsonSuccess(response, label, path);
    return (success.data ?? null) as T;
  }

  /**
   * PUT JSON /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async putJson<T>(path: string, payload: unknown, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    const response = await this.requestWith401Retry((accessToken) => {
      const authOpts = buildAuthOptions(this.config, accessToken);
      return this.apiClient.putJson<T>(this.config.liferay.url, path, payload, {
        ...authOpts,
        ...requestOptions,
        headers: {
          ...authOpts.headers,
          ...requestOptions?.headers,
        },
      });
    });

    const success = expectGatewayJsonSuccess(response, label, path);
    return (success.data ?? null) as T;
  }

  /**
   * GET /path, return the raw HTTP response without asserting ok status.
   * Use when the caller needs to inspect specific status codes (e.g., 403, 404) instead of a unified error throw.
   */
  async getRaw<T>(path: string): Promise<HttpResponse<T>> {
    return this.requestWith401Retry((accessToken) => {
      const authOptions = buildAuthOptions(this.config, accessToken);
      return this.apiClient.get<T>(this.config.liferay.url, path, authOptions);
    });
  }

  /**
   * POST form /path, return the raw HTTP response without asserting ok status.
   * Use when callers need to inspect status/body across multiple fallback payload candidates.
   */
  async postFormRaw<T>(path: string, form: Record<string, string>): Promise<HttpResponse<T>> {
    return this.requestWith401Retry((accessToken) =>
      this.apiClient.postForm<T>(this.config.liferay.url, path, form, buildAuthOptions(this.config, accessToken)),
    );
  }

  /**
   * DELETE /path, parse JSON response if present, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async deleteJson<T>(path: string, label: string): Promise<T> {
    const response = await this.requestWith401Retry((accessToken) =>
      this.apiClient.delete<T>(this.config.liferay.url, path, buildAuthOptions(this.config, accessToken)),
    );

    const success = expectGatewayJsonSuccess(response, label, path);
    return (success.data ?? null) as T;
  }

  /**
   * Clear the access token cache (useful for testing or explicit refresh).
   */
  clearTokenCache(): void {
    this.accessTokenCache.clear();
  }
}

/**
 * Factory to create LiferayGateway with optional DI for clients.
 * Allows injection of mock/custom apiClient and tokenClient for testing.
 *
 * @param config AppConfig with liferay auth settings
 * @param apiClient Optional LiferayApiClient; creates default if omitted
 * @param tokenClient Optional OAuthTokenClient; creates default if omitted
 * @returns New LiferayGateway instance
 */
export function createLiferayGateway(
  config: AppConfig,
  apiClient?: HttpApiClient,
  tokenClient?: OAuthTokenClient,
): LiferayGateway {
  return new LiferayGateway(config, apiClient ?? createLiferayApiClient(), tokenClient ?? createOAuthTokenClient());
}

function expectGatewayJsonSuccess<T>(response: HttpResponse<T>, label: string, path: string): HttpResponse<T> {
  try {
    return expectJsonSuccess(response, label, 'LIFERAY_GATEWAY_ERROR');
  } catch (error) {
    if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR' && !error.message.includes(' path=')) {
      throw new CliError(`${error.message} path=${path}`, {
        code: error.code,
        exitCode: error.exitCode,
        details: error.details,
      });
    }
    throw error;
  }
}
