import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayGateway} from '../liferay-gateway.js';

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

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
