import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpResponse} from '../../../core/http/client.js';

export function authOptions(
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

export async function expectJsonSuccess<T>(response: HttpResponse<T>, label: string): Promise<HttpResponse<T>> {
  if (response.ok) {
    return response;
  }
  throw new CliError(`${label} failed with status=${response.status}.`, {code: 'LIFERAY_RESOURCE_ERROR'});
}

export function normalizeMigrationPhase(phase?: string): '' | 'pre' | 'post' | 'both' {
  const normalized = (phase ?? '').trim().toLowerCase();
  if (normalized === 'pre' || normalized === 'post' || normalized === 'both') {
    return normalized;
  }
  return '';
}

export function shouldRunPostMigration(phase: '' | 'pre' | 'post' | 'both'): boolean {
  return phase === '' || phase === 'post' || phase === 'both';
}
