import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient, HttpResponse} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {expectJsonSuccess as expectJsonSuccessShared} from '../liferay-http-shared.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import type {SiteResolutionDependencies} from '../portal/site-resolution.js';
import {
  fetchAdtResourceClassNameId,
  fetchClassNameIdForValue,
  fetchStructureTemplateClassIds,
  listDdmTemplates,
  listDdmTemplatesByClassName,
  resolveResourceSite,
  type DdmTemplatePayload,
  type ResolvedResourceSite,
} from '../portal/template-queries.js';
import {
  toFragmentCollectionPayload,
  toFragmentEntryPayload,
  type FragmentCollectionPayload,
  type FragmentEntryPayload,
} from './liferay-resource-payloads.js';

export {
  fetchAdtResourceClassNameId,
  fetchClassNameIdForValue,
  fetchStructureTemplateClassIds,
  listDdmTemplates,
  listDdmTemplatesByClassName,
  resolveResourceSite,
};
export type {DdmTemplatePayload, ResolvedResourceSite};

type ResourceDependencies = SiteResolutionDependencies;

function expectResourceJsonSuccess<T>(response: HttpResponse<T>, label: string): HttpResponse<T> {
  return expectJsonSuccessShared(response, label, 'LIFERAY_RESOURCE_ERROR');
}

function createResourceReadGateway(
  config: AppConfig,
  apiClient: HttpApiClient,
  dependencies?: Pick<ResourceDependencies, 'gateway' | 'tokenClient' | 'accessToken'>,
) {
  if (dependencies?.gateway) {
    return dependencies.gateway;
  }

  const gateway = createLiferayGateway(config, apiClient, dependencies?.tokenClient);

  if (dependencies?.accessToken) {
    gateway.seedAccessToken(dependencies.accessToken);
  }

  return gateway;
}

export async function listFragmentCollections(
  config: AppConfig,
  siteId: number,
  dependencies?: ResourceDependencies,
): Promise<FragmentCollectionPayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  const response = await gateway.getRaw<unknown[]>(
    `/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=${siteId}`,
  );
  const success = expectResourceJsonSuccess(response, 'fragment collections');
  return Array.isArray(success.data) ? success.data.map(toFragmentCollectionPayload) : [];
}

export async function listFragments(
  config: AppConfig,
  collectionId: number,
  dependencies?: ResourceDependencies,
): Promise<FragmentEntryPayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  const response = await gateway.getRaw<unknown[]>(
    `/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=${collectionId}`,
  );
  const success = expectResourceJsonSuccess(response, 'fragments');
  return Array.isArray(success.data) ? success.data.map(toFragmentEntryPayload) : [];
}
