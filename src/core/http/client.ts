import pRetry from 'p-retry';

import {CliError} from '../../core/errors.js';
import {parseJsonSafely} from '../utils/json.js';

export type FetchLike = typeof fetch;

export type HttpRequestOptions = {
  headers?: Record<string, string>;
  timeoutSeconds?: number;
};

export type HttpResponse<T = unknown> = {
  ok: boolean;
  status: number;
  headers: Headers;
  body: string;
  data: T | null;
};

export type LiferayApiClient = {
  get: <T = unknown>(baseUrl: string, path: string, options?: HttpRequestOptions) => Promise<HttpResponse<T>>;
  delete: <T = unknown>(baseUrl: string, path: string, options?: HttpRequestOptions) => Promise<HttpResponse<T>>;
  postForm: <T = unknown>(
    baseUrl: string,
    path: string,
    form: Record<string, string>,
    options?: HttpRequestOptions,
  ) => Promise<HttpResponse<T>>;
  postJson: <T = unknown>(
    baseUrl: string,
    path: string,
    payload: unknown,
    options?: HttpRequestOptions,
  ) => Promise<HttpResponse<T>>;
  postMultipart: <T = unknown>(
    baseUrl: string,
    path: string,
    form: FormData,
    options?: HttpRequestOptions,
  ) => Promise<HttpResponse<T>>;
  putJson: <T = unknown>(
    baseUrl: string,
    path: string,
    payload: unknown,
    options?: HttpRequestOptions,
  ) => Promise<HttpResponse<T>>;
};

export function createLiferayApiClient(options?: {fetchImpl?: FetchLike; maxAttempts?: number}): LiferayApiClient {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const maxAttempts = options?.maxAttempts ?? 3;

  return {
    async get<T>(baseUrl: string, path: string, requestOptions?: HttpRequestOptions) {
      return sendWithRetry<T>(
        fetchImpl,
        maxAttempts,
        `${baseUrl}${path}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...requestOptions?.headers,
          },
        },
        requestOptions?.timeoutSeconds ?? 30,
      );
    },
    async delete<T>(baseUrl: string, path: string, requestOptions?: HttpRequestOptions) {
      return sendWithRetry<T>(
        fetchImpl,
        maxAttempts,
        `${baseUrl}${path}`,
        {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            ...requestOptions?.headers,
          },
        },
        requestOptions?.timeoutSeconds ?? 30,
      );
    },
    async postForm<T>(
      baseUrl: string,
      path: string,
      form: Record<string, string>,
      requestOptions?: HttpRequestOptions,
    ) {
      const body = new URLSearchParams(form).toString();

      return sendWithRetry<T>(
        fetchImpl,
        maxAttempts,
        `${baseUrl}${path}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            ...requestOptions?.headers,
          },
          body,
        },
        requestOptions?.timeoutSeconds ?? 30,
      );
    },
    async postJson<T>(baseUrl: string, path: string, payload: unknown, requestOptions?: HttpRequestOptions) {
      return sendWithRetry<T>(
        fetchImpl,
        maxAttempts,
        `${baseUrl}${path}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...requestOptions?.headers,
          },
          body: JSON.stringify(payload),
        },
        requestOptions?.timeoutSeconds ?? 30,
      );
    },
    async postMultipart<T>(baseUrl: string, path: string, form: FormData, requestOptions?: HttpRequestOptions) {
      return sendWithRetry<T>(
        fetchImpl,
        maxAttempts,
        `${baseUrl}${path}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            ...requestOptions?.headers,
          },
          body: form,
        },
        requestOptions?.timeoutSeconds ?? 30,
      );
    },
    async putJson<T>(baseUrl: string, path: string, payload: unknown, requestOptions?: HttpRequestOptions) {
      return sendWithRetry<T>(
        fetchImpl,
        maxAttempts,
        `${baseUrl}${path}`,
        {
          method: 'PUT',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...requestOptions?.headers,
          },
          body: JSON.stringify(payload),
        },
        requestOptions?.timeoutSeconds ?? 30,
      );
    },
  };
}

async function sendWithRetry<T>(
  fetchImpl: FetchLike,
  maxAttempts: number,
  url: string,
  init: RequestInit,
  timeoutSeconds: number,
): Promise<HttpResponse<T>> {
  try {
    return await pRetry(
      async () => {
        const response = await fetchImpl(url, {
          ...init,
          signal: AbortSignal.timeout(timeoutSeconds * 1000),
        });

        const body = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          headers: response.headers,
          body,
          data: parseJsonSafely<T>(body),
        };
      },
      {
        retries: maxAttempts - 1,
        minTimeout: 400,
        factor: 1,
        shouldRetry: (error) => isRetryableError(error),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HTTP request failed';
    throw new CliError(`${message}: ${url}`, {code: 'LIFERAY_HTTP_ERROR'});
  }
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('timed out') ||
    message.includes('connection reset') ||
    message.includes('broken pipe') ||
    message.includes('connection refused') ||
    message.includes('fetch failed') ||
    message.includes('no bytes')
  );
}
