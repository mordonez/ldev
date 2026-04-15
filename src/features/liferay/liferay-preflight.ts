/**
 * R18: Opt-in preflight check for Liferay API surface availability.
 *
 * Reports whether adminSite, adminUser, and jsonws surfaces are accessible
 * from the configured credentials. Intended for automation mode diagnostics
 * and fallback validation — NOT executed on every command invocation.
 *
 * Integration: invoke explicitly via `inventory preflight` or pass
 * `--preflight` to supported commands.
 */

import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import {createOAuthTokenClient} from '../../core/http/auth.js';
import type {LiferayApiClient} from '../../core/http/client.js';
import {createLiferayApiClient} from '../../core/http/client.js';
import {buildAuthOptions} from './liferay-http-shared.js';
import {LookupCache} from './lookup-cache.js';
import {fetchAccessToken} from './inventory/liferay-inventory-shared.js';

export type SurfaceStatus = 'ok' | 'forbidden' | 'unavailable' | 'unknown';

export type PreflightResult = {
  adminSite: SurfaceStatus;
  adminUser: SurfaceStatus;
  jsonws: SurfaceStatus;
  /**
   * Best expected fallback based on probe results:
   * - 'headless': adminSite is ok
   * - 'admin-user': adminSite unavailable/forbidden but adminUser is ok
   * - 'jsonws': adminSite forbidden/unavailable but jsonws is ok
   * - 'none': nothing accessible (likely auth failure or wrong URL)
   */
  expectedFallback: 'headless' | 'admin-user' | 'jsonws' | 'none';
};

type PreflightDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
  accessToken?: string;
  forceRefresh?: boolean;
};

// Cache preflight results per base URL for 5 minutes to avoid redundant probes.
const preflightCache = new LookupCache<PreflightResult>();

async function probeUrl(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  path: string,
): Promise<SurfaceStatus> {
  try {
    const response = await apiClient.get<unknown>(config.liferay.url, path, buildAuthOptions(config, accessToken));

    if (response.ok) return 'ok';
    if (response.status === 403) return 'forbidden';
    if (response.status === 404) return 'unavailable';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolveExpectedFallback(
  result: Omit<PreflightResult, 'expectedFallback'>,
): PreflightResult['expectedFallback'] {
  if (result.adminSite === 'ok') return 'headless';
  if (result.adminUser === 'ok') return 'admin-user';
  if (result.jsonws === 'ok') return 'jsonws';
  return 'none';
}

export async function runLiferayPreflight(
  config: AppConfig,
  dependencies?: PreflightDependencies,
): Promise<PreflightResult> {
  const cacheKey = config.liferay.url;
  const cached = preflightCache.get(cacheKey, dependencies?.forceRefresh);
  if (cached) return cached;

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const accessToken =
    dependencies?.accessToken ??
    (await fetchAccessToken(config, {tokenClient, forceRefresh: dependencies?.forceRefresh}));

  const [adminSite, adminUser, jsonws] = await Promise.all([
    probeUrl(config, apiClient, accessToken, '/o/headless-admin-site/v1.0/sites?pageSize=1&page=1'),
    probeUrl(config, apiClient, accessToken, '/o/headless-admin-user/v1.0/my-user-account'),
    probeUrl(config, apiClient, accessToken, '/api/jsonws/portal/get-build-number'),
  ]);

  const partial = {adminSite, adminUser, jsonws};
  const result: PreflightResult = {...partial, expectedFallback: resolveExpectedFallback(partial)};

  preflightCache.set(cacheKey, result);
  return result;
}

export function formatLiferayPreflight(result: PreflightResult): string {
  const icon = (s: SurfaceStatus): string => {
    if (s === 'ok') return '✓';
    if (s === 'forbidden') return '✗ (403 forbidden)';
    if (s === 'unavailable') return '✗ (404 unavailable)';
    return '? (unknown)';
  };

  const lines = [
    'Liferay API surface preflight:',
    `  adminSite  (headless-admin-site):  ${icon(result.adminSite)}`,
    `  adminUser  (headless-admin-user):  ${icon(result.adminUser)}`,
    `  jsonws     (/api/jsonws):          ${icon(result.jsonws)}`,
    `  expectedFallback: ${result.expectedFallback}`,
  ];

  return lines.join('\n');
}
