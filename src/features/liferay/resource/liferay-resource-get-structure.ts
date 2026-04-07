import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {
  authedGet,
  expectJsonSuccess,
  fetchAccessToken,
  normalizeLocalizedName,
} from '../inventory/liferay-inventory-shared.js';
import {resolveResourceSite} from './liferay-resource-shared.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceStructureResult = {
  siteId: number;
  siteFriendlyUrl: string;
  siteName: string;
  key: string;
  id: number;
  name: string;
  raw: Record<string, unknown>;
};

export async function runLiferayResourceGetStructure(
  config: AppConfig,
  options: {site?: string; key?: string; id?: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceStructureResult> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const site = await resolveResourceSite(config, options.site ?? '/global', dependencies);
  const identifier = String(options.key ?? options.id ?? '').trim();
  if (identifier === '') {
    throw new CliError('Provide --key or --id.', {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  let payload: Record<string, unknown> | null = null;

  if (options.id || /^\d+$/.test(identifier)) {
    const byIdResponse = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/o/data-engine/v2.0/data-definitions/${encodeURIComponent(String(options.id ?? identifier))}`,
    );

    if (byIdResponse.ok) {
      payload = byIdResponse.data ?? null;
    } else if (options.id) {
      await expectJsonSuccess(byIdResponse, 'resource get-structure');
    }
  }

  if (!payload && options.key) {
    const encodedKey = encodeURIComponent(options.key);
    const response = await authedGet<Record<string, unknown>>(
      config,
      apiClient,
      accessToken,
      `/o/data-engine/v2.0/sites/${site.id}/data-definitions/by-content-type/journal/by-data-definition-key/${encodedKey}`,
    );
    const success = await expectJsonSuccess(response, 'resource get-structure');
    payload = success.data ?? null;
  }

  if (!payload) {
    throw new CliError(`Estructura no encontrada: ${identifier}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  return {
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    siteName: site.name,
    key: String(payload.dataDefinitionKey ?? identifier),
    id: Number(payload.id ?? -1),
    name: normalizeLocalizedName(payload.name as string | Record<string, string> | undefined),
    raw: payload,
  };
}

export function formatLiferayResourceStructure(result: LiferayResourceStructureResult): string {
  return [
    'RESOURCE_STRUCTURE',
    `siteId=${result.siteId}`,
    `siteFriendlyUrl=${result.siteFriendlyUrl}`,
    `siteName=${result.siteName}`,
    `id=${result.id}`,
    `key=${result.key}`,
    `name=${result.name}`,
  ].join('\n');
}
