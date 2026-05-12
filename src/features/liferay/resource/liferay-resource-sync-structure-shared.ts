import type {AppConfig} from '../../../core/config/load-config.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import type {ResourceDependencies} from './liferay-resource-sync-shared.js';

export async function fetchStructureByKey(
  config: AppConfig,
  siteId: number,
  key: string,
  dependencies?: ResourceDependencies,
): Promise<Record<string, unknown>> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  return gateway.getJson<Record<string, unknown>>(
    `/o/data-engine/v2.0/sites/${siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(key)}`,
    'structure-get',
  );
}
