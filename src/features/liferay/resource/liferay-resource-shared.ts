import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {
  expectJsonSuccess,
  fetchAccessToken,
  resolveSite,
  type ResolvedSite,
} from '../inventory/liferay-inventory-shared.js';
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

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
  gateway?: LiferayGateway;
  accessToken?: string;
  forceRefresh?: boolean;
};

export type ResolvedResourceSite = ResolvedSite & {
  companyId: number;
};

type ClassNamePayload = {
  classNameId?: number;
};

type GroupPayload = {
  companyId?: number;
};

function createResourceReadGateway(
  config: AppConfig,
  apiClient: LiferayApiClient,
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
  const companyId = await resolveCompanyId(gateway, resolvedSite.id);

  if (companyId <= 0) {
    throw LiferayErrors.resourceError(`site sin companyId valido: ${site}`);
  }

  return {
    ...resolvedSite,
    companyId,
  };
}

export async function fetchStructureTemplateClassIds(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<{classNameId: number; resourceClassNameId: number}> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const forceRefresh = dependencies?.forceRefresh;

  if (dependencies?.gateway) {
    const classNameId = await fetchClassNameIdWithGateway(
      config,
      dependencies.gateway,
      DDM_STRUCTURE_CLASS_NAME,
      forceRefresh,
    );
    const resourceClassNameId = await fetchClassNameIdWithGateway(
      config,
      dependencies.gateway,
      JOURNAL_ARTICLE_CLASS_NAME,
      forceRefresh,
    );

    return {classNameId, resourceClassNameId};
  }

  const accessToken = await fetchAccessToken(config, dependencies);

  const classNameId = await fetchClassNameId(config, apiClient, accessToken, DDM_STRUCTURE_CLASS_NAME, forceRefresh);
  const resourceClassNameId = await fetchClassNameId(
    config,
    apiClient,
    accessToken,
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

  if (dependencies?.gateway) {
    return fetchClassNameIdWithGateway(config, dependencies.gateway, className, dependencies?.forceRefresh);
  }

  const accessToken = await fetchAccessToken(config, dependencies);
  return fetchClassNameId(config, apiClient, accessToken, className, dependencies?.forceRefresh);
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

  if (dependencies?.gateway) {
    const classNameId = await fetchClassNameIdWithGateway(
      config,
      dependencies.gateway,
      className,
      dependencies?.forceRefresh,
    );
    return fetchDdmTemplates(dependencies.gateway, site.companyId, site.id, classNameId, resourceClassNameId);
  }

  const accessToken = await fetchAccessToken(config, dependencies);
  const gateway = createResourceReadGateway(config, apiClient, {...dependencies, accessToken});
  const classNameId = await fetchClassNameId(config, apiClient, accessToken, className, dependencies?.forceRefresh);

  return fetchDdmTemplates(gateway, site.companyId, site.id, classNameId, resourceClassNameId);
}

export async function listFragmentCollections(
  config: AppConfig,
  siteId: number,
  dependencies?: ResourceDependencies,
): Promise<FragmentCollectionPayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const gateway = createResourceReadGateway(config, apiClient, {...dependencies, accessToken});
  const response = await gateway.getRaw<unknown[]>(
    `/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=${siteId}`,
  );
  const success = await expectJsonSuccess(response, 'fragment collections');
  return Array.isArray(success.data) ? success.data.map(toFragmentCollectionPayload) : [];
}

export async function listFragments(
  config: AppConfig,
  collectionId: number,
  dependencies?: ResourceDependencies,
): Promise<FragmentEntryPayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const gateway = createResourceReadGateway(config, apiClient, {...dependencies, accessToken});
  const response = await gateway.getRaw<unknown[]>(
    `/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=${collectionId}`,
  );
  const success = await expectJsonSuccess(response, 'fragments');
  return Array.isArray(success.data) ? success.data.map(toFragmentEntryPayload) : [];
}

async function fetchClassNameId(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  className: string,
  forceRefresh?: boolean,
): Promise<number> {
  const cacheKey = `${config.liferay.url}|${className}`;
  const cached = classNameIdLookupCache.get(cacheKey, forceRefresh);
  if (cached) return cached;

  const gateway = createResourceReadGateway(config, apiClient, {accessToken});
  const response = await gateway.getRaw<ClassNamePayload>(
    `/api/jsonws/classname/fetch-class-name?value=${encodeURIComponent(className)}`,
  );
  const success = await expectJsonSuccess(response, `classname ${className}`);
  const classNameId = success.data?.classNameId ?? -1;
  if (classNameId <= 0) {
    throw LiferayErrors.resourceError(`classNameId no resuelto para ${className}`);
  }
  classNameIdLookupCache.set(cacheKey, classNameId);
  return classNameId;
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
  const success = await expectJsonSuccess(response, `classname ${className}`);
  const classNameId = success.data?.classNameId ?? -1;
  if (classNameId <= 0) {
    throw LiferayErrors.resourceError(`classNameId no resuelto para ${className}`);
  }
  classNameIdLookupCache.set(cacheKey, classNameId);
  return classNameId;
}

export type GroupInfo = {
  friendlyUrl: string;
  name: string;
  parentGroupId: number;
};

export type ResourceSiteChainEntry = {
  siteId: number;
  siteFriendlyUrl: string;
  siteName: string;
};

export async function buildResourceSiteChain(
  config: AppConfig,
  startSite: string,
  dependencies?: ResourceDependencies,
): Promise<ResourceSiteChainEntry[]> {
  const chain: ResourceSiteChainEntry[] = [];
  const visited = new Set<number>();

  const firstSite = await resolveResourceSite(config, startSite, dependencies);
  chain.push({siteId: firstSite.id, siteFriendlyUrl: firstSite.friendlyUrlPath, siteName: firstSite.name});
  visited.add(firstSite.id);

  let currentGroupInfo = await fetchGroupInfo(config, firstSite.id, dependencies);

  while (currentGroupInfo && currentGroupInfo.parentGroupId > 0 && !visited.has(currentGroupInfo.parentGroupId)) {
    const parentId = currentGroupInfo.parentGroupId;
    const parentGroupInfo = await fetchGroupInfo(config, parentId, dependencies);
    if (!parentGroupInfo) {
      break;
    }

    visited.add(parentId);
    chain.push({
      siteId: parentId,
      siteFriendlyUrl: parentGroupInfo.friendlyUrl,
      siteName: parentGroupInfo.name,
    });
    currentGroupInfo = parentGroupInfo;
  }

  try {
    const globalSite = await resolveResourceSite(config, '/global', dependencies);
    if (!visited.has(globalSite.id)) {
      chain.push({siteId: globalSite.id, siteFriendlyUrl: globalSite.friendlyUrlPath, siteName: globalSite.name});
    }
  } catch {
    // /global is not available on every permission set.
  }

  return chain;
}

export async function fetchGroupInfo(
  config: AppConfig,
  groupId: number,
  dependencies?: ResourceDependencies,
): Promise<GroupInfo | null> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createResourceReadGateway(config, apiClient, dependencies);
  const response = await gateway.getRaw<{
    friendlyURL?: string;
    friendlyUrl?: string;
    nameCurrentValue?: string;
    name?: string;
    parentGroupId?: number;
  }>(`/api/jsonws/group/get-group?groupId=${groupId}`);

  if (!response.ok || !response.data) {
    return null;
  }

  const data = response.data;
  const rawFriendlyUrl = data.friendlyURL ?? data.friendlyUrl ?? '';
  if (!rawFriendlyUrl) {
    return null;
  }

  return {
    friendlyUrl: rawFriendlyUrl.startsWith('/') ? rawFriendlyUrl : `/${rawFriendlyUrl}`,
    name: data.nameCurrentValue ?? data.name ?? '',
    parentGroupId: data.parentGroupId ?? -1,
  };
}

async function resolveCompanyId(gateway: LiferayGateway, siteId: number): Promise<number> {
  const groupResponse = await gateway.getRaw<GroupPayload>(`/api/jsonws/group/get-group?groupId=${siteId}`);

  if (groupResponse.ok) {
    const companyId = groupResponse.data?.companyId ?? -1;
    if (companyId > 0) {
      return companyId;
    }
  }

  const companiesResponse = await gateway.getRaw<Array<{companyId?: number}>>('/api/jsonws/company/get-companies');

  if (!companiesResponse.ok || !Array.isArray(companiesResponse.data) || companiesResponse.data.length === 0) {
    return -1;
  }

  return companiesResponse.data[0]?.companyId ?? -1;
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
