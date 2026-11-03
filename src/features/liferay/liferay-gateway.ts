import type {AppConfig} from '../../core/config/load-config.js';
import {CliError, createDomainError} from '../../core/errors.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import {createOAuthTokenClient} from '../../core/http/auth.js';
import type {HttpRequestOptions, HttpResponse, HttpApiClient} from '../../core/http/client.js';
import {createLiferayApiClient} from '../../core/http/client.js';
import {parseJsonRecord} from '../../core/utils/json.js';
import {buildAuthOptions} from './liferay-http-shared.js';

export const GATEWAY_ERROR_CODE = 'LIFERAY_GATEWAY_ERROR';

/** Structured details attached to every error thrown by the gateway. */
export type GatewayErrorDetails = {
  status: number;
  path: string;
};

const MAX_SERVER_MESSAGE_LENGTH = 300;

/** Refresh tokens slightly before the portal expires them to avoid a wasted 401 round-trip. */
const TOKEN_EXPIRY_SKEW_MS = 30_000;

type CachedToken = {
  value: string;
  /** Epoch ms after which the token must be refreshed; `null` when the portal did not report an expiry. */
  expiresAt: number | null;
};

/**
 * Single typed HTTP client for Liferay API calls (ADR 0005).
 *
 * Owns Bearer token acquisition and caching (honouring the token's `expires_in`),
 * one forced token refresh on 401, timeout propagation from config, and conversion
 * of non-2xx responses into `LIFERAY_GATEWAY_ERROR` with `{status, path}` details.
 *
 * Usage:
 *   const gateway = createLiferayGateway(config);
 *   const template = await gateway.getJson<Template>('/path', 'fetch-template');
 */
export class LiferayGateway {
  private token: CachedToken | null = null;

  constructor(
    private config: AppConfig,
    private apiClient: HttpApiClient,
    private tokenClient: OAuthTokenClient,
    private now: () => number = Date.now,
  ) {}

  /** Seed the token cache with a token the caller already holds. It is used until the portal rejects it. */
  seedAccessToken(accessToken: string): void {
    this.token = {value: accessToken, expiresAt: null};
  }

  /** Drop the in-memory token; the next request acquires one from the token client. */
  clearTokenCache(): void {
    this.token = null;
  }

  /** GET and return the parsed JSON body. @throws CliError `LIFERAY_GATEWAY_ERROR` on non-2xx. */
  async getJson<T>(path: string, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    return this.expectData(
      await this.send<T>(requestOptions, (opts) => this.apiClient.get<T>(this.config.liferay.url, path, opts)),
      label,
      path,
    );
  }

  /** POST a JSON payload and return the parsed JSON body. @throws CliError `LIFERAY_GATEWAY_ERROR` on non-2xx. */
  async postJson<T>(path: string, payload: unknown, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    return this.expectData(
      await this.send<T>(requestOptions, (opts) =>
        this.apiClient.postJson<T>(this.config.liferay.url, path, payload, opts),
      ),
      label,
      path,
    );
  }

  /** POST a urlencoded form and return the parsed JSON body. @throws CliError `LIFERAY_GATEWAY_ERROR` on non-2xx. */
  async postForm<T>(
    path: string,
    form: Record<string, string>,
    label: string,
    requestOptions?: HttpRequestOptions,
  ): Promise<T> {
    return this.expectData(await this.postFormRaw<T>(path, form, requestOptions), label, path);
  }

  /** POST multipart form data and return the parsed JSON body. @throws CliError `LIFERAY_GATEWAY_ERROR` on non-2xx. */
  async postMultipart<T>(path: string, form: FormData, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    return this.expectData(
      await this.send<T>(requestOptions, (opts) =>
        this.apiClient.postMultipart<T>(this.config.liferay.url, path, form, opts),
      ),
      label,
      path,
    );
  }

  /** PUT a JSON payload and return the parsed JSON body. @throws CliError `LIFERAY_GATEWAY_ERROR` on non-2xx. */
  async putJson<T>(path: string, payload: unknown, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    return this.expectData(
      await this.send<T>(requestOptions, (opts) =>
        this.apiClient.putJson<T>(this.config.liferay.url, path, payload, opts),
      ),
      label,
      path,
    );
  }

  /** DELETE and return the parsed JSON body, if any. @throws CliError `LIFERAY_GATEWAY_ERROR` on non-2xx. */
  async deleteJson<T>(path: string, label: string, requestOptions?: HttpRequestOptions): Promise<T> {
    return this.expectData(
      await this.send<T>(requestOptions, (opts) => this.apiClient.delete<T>(this.config.liferay.url, path, opts)),
      label,
      path,
    );
  }

  /** GET without asserting the status, for callers that branch on specific status codes. */
  async getRaw<T>(path: string, requestOptions?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.send<T>(requestOptions, (opts) => this.apiClient.get<T>(this.config.liferay.url, path, opts));
  }

  /** POST a form without asserting the status, for callers that try several payload candidates. */
  async postFormRaw<T>(
    path: string,
    form: Record<string, string>,
    requestOptions?: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    return this.send<T>(requestOptions, (opts) =>
      this.apiClient.postForm<T>(this.config.liferay.url, path, form, opts),
    );
  }

  private async send<T>(
    requestOptions: HttpRequestOptions | undefined,
    request: (options: HttpRequestOptions) => Promise<HttpResponse<T>>,
  ): Promise<HttpResponse<T>> {
    const withToken = (accessToken: string): HttpRequestOptions => {
      const auth = buildAuthOptions(this.config, accessToken);
      return {...auth, ...requestOptions, headers: {...auth.headers, ...requestOptions?.headers}};
    };

    const response = await request(withToken(await this.getAccessToken()));
    if (response.status !== 401) {
      return response;
    }

    // The cached token may be revoked (portal restarted, OAuth app re-created): bypass every cache once.
    return request(withToken(await this.getAccessToken({forceRefresh: true})));
  }

  private async getAccessToken(options?: {forceRefresh?: boolean}): Promise<string> {
    const cached = this.token;
    if (!options?.forceRefresh && cached && (cached.expiresAt === null || this.now() < cached.expiresAt)) {
      return cached.value;
    }

    const issuedAt = this.now();
    const {accessToken, expiresIn} = await this.tokenClient.fetchClientCredentialsToken(this.config.liferay, options);
    this.token = {
      value: accessToken,
      expiresAt: expiresIn > 0 ? issuedAt + Math.max(0, expiresIn * 1000 - TOKEN_EXPIRY_SKEW_MS) : null,
    };
    return accessToken;
  }

  private expectData<T>(response: HttpResponse<T>, label: string, path: string): T {
    if (!response.ok) {
      throw createGatewayError(label, response.status, path, response.body);
    }
    return (response.data ?? null) as T;
  }
}

export function createLiferayGateway(
  config: AppConfig,
  apiClient?: HttpApiClient,
  tokenClient?: OAuthTokenClient,
): LiferayGateway {
  return new LiferayGateway(config, apiClient ?? createLiferayApiClient(), tokenClient ?? createOAuthTokenClient());
}

/**
 * Build the error the gateway throws for a non-2xx response.
 * The message keeps the stable `<label> failed with status=<n> path=<path>` prefix and appends the
 * portal's own explanation when it returned one, which is usually what a human or agent needs to act.
 */
export function createGatewayError(label: string, status: number, path: string, body = ''): CliError {
  const serverMessage = extractServerMessage(body);
  const details: GatewayErrorDetails = {status, path};
  return createDomainError(
    `${label} failed with status=${status} path=${path}.${serverMessage ? ` ${serverMessage}` : ''}`,
    GATEWAY_ERROR_CODE,
    {details},
  );
}

export function isGatewayError(error: unknown): error is CliError {
  return error instanceof CliError && error.code === GATEWAY_ERROR_CODE;
}

/** HTTP status of a gateway error, or `undefined` for any other error. */
export function getGatewayStatus(error: unknown): number | undefined {
  if (!isGatewayError(error)) {
    return undefined;
  }
  const status = (error.details as Partial<GatewayErrorDetails> | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** True when `error` is a gateway error with one of the given HTTP statuses. */
export function isGatewayStatus(error: unknown, ...statuses: number[]): boolean {
  const status = getGatewayStatus(error);
  return status !== undefined && statuses.includes(status);
}

/** Extract a short human message from Headless (`title`/`detail`) or JSONWS (`exception`, `error.message`) bodies. */
function extractServerMessage(body: string): string {
  const record = parseJsonRecord(body);
  if (!record) {
    return '';
  }

  const nested = record.error && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : {};
  const candidate = [record.title, record.detail, nested.message, record.exception, record.message].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  if (!candidate) {
    return '';
  }

  const normalized = candidate.replaceAll(/\s+/g, ' ').trim();
  return normalized.length > MAX_SERVER_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_SERVER_MESSAGE_LENGTH)}…`
    : normalized;
}
