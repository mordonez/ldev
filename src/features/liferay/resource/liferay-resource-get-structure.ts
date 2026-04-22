import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import {normalizeLocalizedName} from '../inventory/liferay-inventory-shared.js';
import {buildResourceSiteChain, resolveResourceSite} from './liferay-resource-shared.js';
import type {DataDefinitionPayload} from './liferay-resource-payloads.js';

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceStructureResult = {
  siteId: number;
  siteFriendlyUrl: string;
  siteName: string;
  key: string;
  id: number;
  name: string;
  raw: DataDefinitionPayload;
};

export async function runLiferayResourceGetStructure(
  config: AppConfig,
  options: {site?: string; key?: string; id?: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceStructureResult> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  let site = await resolveResourceSite(config, options.site ?? '/global', dependencies);
  const identifier = String(options.key ?? options.id ?? '').trim();
  if (identifier === '') {
    throw LiferayErrors.resourceError('Provide --key or --id.');
  }

  let payload: DataDefinitionPayload | null = null;
  let lastKeyLookupStatus: number | null = null;

  if (options.id || /^\d+$/.test(identifier)) {
    const byIdResponse = await gateway.getRaw<DataDefinitionPayload>(
      `/o/data-engine/v2.0/data-definitions/${encodeURIComponent(String(options.id ?? identifier))}`,
    );

    if (byIdResponse.ok) {
      payload = byIdResponse.data ?? null;
    }
  }

  if (!payload && options.key) {
    const encodedKey = encodeURIComponent(options.key);
    const siteChain = await buildResourceSiteChain(config, options.site ?? '/global', dependencies);

    for (const candidate of siteChain) {
      const response = await gateway.getRaw<DataDefinitionPayload>(
        `/o/data-engine/v2.0/sites/${candidate.siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodedKey}`,
      );
      if (!response.ok) {
        lastKeyLookupStatus = response.status;
        continue;
      }
      payload = response.data ?? null;
      site = await resolveResourceSite(config, candidate.siteFriendlyUrl, dependencies);
      break;
    }
  }

  if (!payload) {
    if (lastKeyLookupStatus !== null) {
      throw LiferayErrors.resourceError(`structure lookup failed with status=${lastKeyLookupStatus}.`);
    }
    throw LiferayErrors.resourceError(`Estructura no encontrada: ${identifier}`);
  }

  return {
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    siteName: site.name,
    key: String(payload.dataDefinitionKey ?? identifier),
    id: Number(payload.id ?? -1),
    name: normalizeLocalizedName(payload.name),
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
