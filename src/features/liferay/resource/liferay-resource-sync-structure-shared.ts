import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {fetchAccessToken} from '../inventory/liferay-inventory-shared.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export async function fetchStructureByKey(
  config: AppConfig,
  siteId: number,
  key: string,
  dependencies?: ResourceDependencies,
): Promise<Record<string, unknown>> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const response = await apiClient.get<Record<string, unknown>>(
    config.liferay.url,
    `/o/data-engine/v2.0/sites/${siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(key)}`,
    {
      timeoutSeconds: config.liferay.timeoutSeconds,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new CliError(`structure-get failed with status=${response.status}.`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  return response.data ?? {};
}
