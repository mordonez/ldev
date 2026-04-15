import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import {createOAuthTokenClient} from '../../core/http/auth.js';
import type {HttpRequestOptions, HttpResponse, LiferayApiClient} from '../../core/http/client.js';
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
    private apiClient: LiferayApiClient,
    private tokenClient: OAuthTokenClient,
  ) {}

  /**
   * Fetch or return cached access token.
   * Cache key includes url + clientId + clientSecret to support multi-instance scenarios.
   * TTL: 1 hour (refreshed when expired).
   */
  private async getAccessToken(): Promise<string> {
    const cacheKey = [
      this.config.liferay.url,
      this.config.liferay.oauth2ClientId,
      this.config.liferay.oauth2ClientSecret,
    ].join('|');

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
   * GET /path, parse JSON, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async getJson<T>(path: string, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    const accessToken = await this.getAccessToken();
    const authOptions = buildAuthOptions(this.config, accessToken);
    const response = await this.apiClient.get<T>(this.config.liferay.url, path, {
      ...authOptions,
      ...requestOptions,
      headers: {
        ...authOptions.headers,
        ...requestOptions?.headers,
      },
    });

    const success = await expectJsonSuccess(response, label, 'LIFERAY_GATEWAY_ERROR');
    return (success.data ?? null) as T;
  }

  /**
   * POST JSON /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async postJson<T>(path: string, payload: unknown, label: string): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await this.apiClient.postJson<T>(
      this.config.liferay.url,
      path,
      payload,
      buildAuthOptions(this.config, accessToken),
    );

    const success = await expectJsonSuccess(response, label, 'LIFERAY_GATEWAY_ERROR');
    return (success.data ?? null) as T;
  }

  /**
   * POST form /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async postForm<T>(path: string, form: Record<string, string>, label: string): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await this.apiClient.postForm<T>(
      this.config.liferay.url,
      path,
      form,
      buildAuthOptions(this.config, accessToken),
    );

    const success = await expectJsonSuccess(response, label, 'LIFERAY_GATEWAY_ERROR');
    return (success.data ?? null) as T;
  }

  /**
   * POST multipart /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async postMultipart<T>(path: string, form: FormData, label: string): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await this.apiClient.postMultipart<T>(
      this.config.liferay.url,
      path,
      form,
      buildAuthOptions(this.config, accessToken),
    );

    const success = await expectJsonSuccess(response, label, 'LIFERAY_GATEWAY_ERROR');
    return (success.data ?? null) as T;
  }

  /**
   * PUT JSON /path, parse JSON response, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async putJson<T>(path: string, payload: unknown, label: string): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await this.apiClient.putJson<T>(
      this.config.liferay.url,
      path,
      payload,
      buildAuthOptions(this.config, accessToken),
    );

    const success = await expectJsonSuccess(response, label, 'LIFERAY_GATEWAY_ERROR');
    return (success.data ?? null) as T;
  }

  /**
   * GET /path, return the raw HTTP response without asserting ok status.
   * Use when the caller needs to inspect specific status codes (e.g., 403, 404) instead of a unified error throw.
   */
  async getRaw<T>(path: string): Promise<HttpResponse<T>> {
    const accessToken = await this.getAccessToken();
    const authOptions = buildAuthOptions(this.config, accessToken);
    return this.apiClient.get<T>(this.config.liferay.url, path, authOptions);
  }

  /**
   * DELETE /path, parse JSON response if present, assert ok status, return data.
   * @throws CliError if response not ok
   */
  async deleteJson<T>(path: string, label: string): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await this.apiClient.delete<T>(
      this.config.liferay.url,
      path,
      buildAuthOptions(this.config, accessToken),
    );

    const success = await expectJsonSuccess(response, label, 'LIFERAY_GATEWAY_ERROR');
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
  apiClient?: LiferayApiClient,
  tokenClient?: OAuthTokenClient,
): LiferayGateway {
  return new LiferayGateway(config, apiClient ?? createLiferayApiClient(), tokenClient ?? createOAuthTokenClient());
}
