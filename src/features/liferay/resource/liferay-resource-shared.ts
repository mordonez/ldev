import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {expectJsonSuccess} from '../inventory/liferay-inventory-shared.js';
import {
  resolveSite,
  enrichWithCompanyId,
  type ResolvedSite,
  type SiteResolutionDependencies,
} from '../portal/site-resolution.js';
import {
  toDdmTemplatePayload,
  toFragmentCollectionPayload,
  toFragmentEntryPayload,
  type DdmTemplatePayload,
  type FragmentCollectionPayload,
  type FragmentEntryPayload,
} from './liferay-resource-payloads.js';
import {classNameIdLookupCache} from '../lookup-cache.js';

const DDM_STRUCTURE_CLASS_NAME = 'com.liferay.dynamic.data.mapping.model.DDMStructure';
const JOURNAL_ARTICLE_CLASS_NAME = 'com.liferay.journal.model.JournalArticle';
const ADT_RESOURCE_CLASS_NAME = 'com.liferay.portlet.display.template.PortletDisplayTemplate';

type ResourceDependencies = SiteResolutionDependencies;

export type ResolvedResourceSite = ResolvedSite & {
  companyId: number;
};

type ClassNamePayload = {
  classNameId?: number;
};

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

export async function resolveResourceSite(
  config: AppConfig,
  site: string,
  dependencies?: ResourceDependencies,
): Promise<ResolvedResourceSite> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  const resolvedSite = await resolveSite(config, site, {...dependencies, gateway});
  return enrichWithCompanyId(resolvedSite, config, {...dependencies, gateway});
}

export async function fetchStructureTemplateClassIds(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<{classNameId: number; resourceClassNameId: number}> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  const forceRefresh = dependencies?.forceRefresh;

  const classNameId = await fetchClassNameIdWithGateway(config, gateway, DDM_STRUCTURE_CLASS_NAME, forceRefresh);
  const resourceClassNameId = await fetchClassNameIdWithGateway(
    config,
    gateway,
    JOURNAL_ARTICLE_CLASS_NAME,
    forceRefresh,
  );

  return {classNameId, resourceClassNameId};
}

export async function fetchClassNameIdForValue(
  config: AppConfig,
  className: string,
  dependencies?: ResourceDependencies,
): Promise<number> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  return fetchClassNameIdWithGateway(config, gateway, className, dependencies?.forceRefresh);
}

export async function fetchAdtResourceClassNameId(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<number> {
  return fetchClassNameIdForValue(config, ADT_RESOURCE_CLASS_NAME, dependencies);
}

export async function listDdmTemplates(
  config: AppConfig,
  site: ResolvedResourceSite,
  dependencies?: ResourceDependencies,
  options?: {includeCompanyFallback?: boolean},
): Promise<DdmTemplatePayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  const {classNameId, resourceClassNameId} = await fetchStructureTemplateClassIds(config, dependencies);

  const siteTemplates = await fetchDdmTemplates(gateway, site.companyId, site.id, classNameId, resourceClassNameId);

  if (siteTemplates.length > 0) {
    return siteTemplates;
  }

  if (options?.includeCompanyFallback === false) {
    return [];
  }

  return fetchDdmTemplates(gateway, site.companyId, null, classNameId, resourceClassNameId);
}

export async function listDdmTemplatesByClassName(
  config: AppConfig,
  site: ResolvedResourceSite,
  className: string,
  resourceClassNameId: number,
  dependencies?: ResourceDependencies,
): Promise<DdmTemplatePayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  const classNameId = await fetchClassNameIdWithGateway(config, gateway, className, dependencies?.forceRefresh);
  return fetchDdmTemplates(gateway, site.companyId, site.id, classNameId, resourceClassNameId);
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
  const success = expectJsonSuccess(response, 'fragment collections');
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
  const success = expectJsonSuccess(response, 'fragments');
  return Array.isArray(success.data) ? success.data.map(toFragmentEntryPayload) : [];
}

async function fetchClassNameIdWithGateway(
  config: AppConfig,
  gateway: LiferayGateway,
  className: string,
  forceRefresh?: boolean,
): Promise<number> {
  const cacheKey = `${config.liferay.url}|${className}`;
  const cached = classNameIdLookupCache.get(cacheKey, forceRefresh);
  if (cached) return cached;

  const response = await gateway.getRaw<ClassNamePayload>(
    `/api/jsonws/classname/fetch-class-name?value=${encodeURIComponent(className)}`,
  );
  const success = expectJsonSuccess(response, `classname ${className}`);
  const classNameId = success.data?.classNameId ?? -1;
  if (classNameId <= 0) {
    throw LiferayErrors.resourceError(`classNameId no resuelto para ${className}`);
  }
  classNameIdLookupCache.set(cacheKey, classNameId);
  return classNameId;
}

async function fetchDdmTemplates(
  gateway: LiferayGateway,
  companyId: number,
  groupId: number | null,
  classNameId: number,
  resourceClassNameId: number,
): Promise<DdmTemplatePayload[]> {
  const groupQuery = groupId === null ? '0' : String(groupId);
  const response = await gateway.getRaw<unknown[]>(
    `/api/jsonws/ddm.ddmtemplate/get-templates?companyId=${companyId}&groupId=${groupQuery}&classNameId=${classNameId}&resourceClassNameId=${resourceClassNameId}&status=0`,
  );

  if (!response.ok) {
    return [];
  }

  return Array.isArray(response.data) ? response.data.map(toDdmTemplatePayload) : [];
}
