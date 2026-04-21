import type {AppConfig} from '../../core/config/load-config.js';
import {CliError} from '../../core/errors.js';
import type {HttpResponse} from '../../core/http/client.js';

/**
 * Build HTTP request options with Bearer token authorization.
 * Centralizes header construction to avoid duplication.
 */
export function buildAuthOptions(
  config: AppConfig,
  accessToken: string,
  acceptLanguage = '',
): {headers: Record<string, string>; timeoutSeconds: number} {
  return {
    timeoutSeconds: config.liferay.timeoutSeconds,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(acceptLanguage !== '' ? {'Accept-Language': acceptLanguage} : {}),
    },
  };
}

/**
 * Validate HTTP response is successful (ok=true).
 * Throws CliError with the provided error code if response failed.
 *
 * @param response HttpResponse to validate
 * @param label Brief description for error message (e.g., "create-template")
 * @param errorCode Error code to use in CliError (defaults to LIFERAY_API_ERROR)
 * @throws CliError if response.ok is false
 * @returns The same response if successful
 */
export function expectJsonSuccess<T>(
  response: HttpResponse<T>,
  label: string,
  errorCode = 'LIFERAY_API_ERROR',
): HttpResponse<T> {
  if (response.ok) {
    return response;
  }

  throw new CliError(`${label} failed with status=${response.status}.`, {code: errorCode});
}

/**
 * Ensure response data is not null/undefined.
 * Throws CliError if data is missing.
 *
 * @param data Data to validate
 * @param label Field name or description for error message
 * @returns The validated data (narrowed from T | null to T)
 * @throws CliError if data is null or undefined
 */
export function ensureData<T>(data: T | null | undefined, label: string, errorCode = 'LIFERAY_API_ERROR'): T {
  if (data === null || data === undefined) {
    throw new CliError(`${label} is missing in response`, {code: errorCode});
  }
  return data;
}
