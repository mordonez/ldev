import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {
  authedGet,
  expectJsonSuccess,
  fetchAccessToken,
  resolveSite,
  type ResolvedSite,
} from '../inventory/liferay-inventory-shared.js';

const DDM_STRUCTURE_CLASS_NAME = 'com.liferay.dynamic.data.mapping.model.DDMStructure';
const JOURNAL_ARTICLE_CLASS_NAME = 'com.liferay.journal.model.JournalArticle';
const ADT_RESOURCE_CLASS_NAME = 'com.liferay.portlet.display.template.PortletDisplayTemplate';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
  accessToken?: string;
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

export async function resolveResourceSite(
  config: AppConfig,
  site: string,
  dependencies?: ResourceDependencies,
): Promise<ResolvedResourceSite> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const resolvedSite = await resolveSite(config, site, dependencies);
  const companyId = await resolveCompanyId(config, apiClient, accessToken, resolvedSite.id);

  if (companyId <= 0) {
    throw new CliError(`site sin companyId valido: ${site}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
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
  const accessToken = await fetchAccessToken(config, dependencies);

  const classNameId = await fetchClassNameId(config, apiClient, accessToken, DDM_STRUCTURE_CLASS_NAME);
  const resourceClassNameId = await fetchClassNameId(config, apiClient, accessToken, JOURNAL_ARTICLE_CLASS_NAME);

  return {classNameId, resourceClassNameId};
}

export async function fetchClassNameIdForValue(
  config: AppConfig,
  className: string,
  dependencies?: ResourceDependencies,
): Promise<number> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  return fetchClassNameId(config, apiClient, accessToken, className);
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
): Promise<Record<string, unknown>[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const {classNameId, resourceClassNameId} = await fetchStructureTemplateClassIds(config, dependencies);

  const siteTemplates = await fetchDdmTemplates(
    config,
    apiClient,
    accessToken,
    site.companyId,
    site.id,
    classNameId,
    resourceClassNameId,
  );

  if (siteTemplates.length > 0) {
    return siteTemplates;
  }

  if (options?.includeCompanyFallback === false) {
    return [];
  }

  return fetchDdmTemplates(config, apiClient, accessToken, site.companyId, null, classNameId, resourceClassNameId);
}

export async function listDdmTemplatesByClassName(
  config: AppConfig,
  site: ResolvedResourceSite,
  className: string,
  resourceClassNameId: number,
  dependencies?: ResourceDependencies,
): Promise<Record<string, unknown>[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const classNameId = await fetchClassNameId(config, apiClient, accessToken, className);

  return fetchDdmTemplates(config, apiClient, accessToken, site.companyId, site.id, classNameId, resourceClassNameId);
}

export async function listFragmentCollections(
  config: AppConfig,
  siteId: number,
  dependencies?: ResourceDependencies,
): Promise<Record<string, unknown>[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const response = await authedGet<Record<string, unknown>[]>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=${siteId}`,
  );
  const success = await expectJsonSuccess(response, 'fragment collections');
  return Array.isArray(success.data) ? success.data : [];
}

export async function listFragments(
  config: AppConfig,
  collectionId: number,
  dependencies?: ResourceDependencies,
): Promise<Record<string, unknown>[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const accessToken = await fetchAccessToken(config, dependencies);
  const response = await authedGet<Record<string, unknown>[]>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=${collectionId}`,
  );
  const success = await expectJsonSuccess(response, 'fragments');
  return Array.isArray(success.data) ? success.data : [];
}

async function fetchClassNameId(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  className: string,
): Promise<number> {
  const response = await authedGet<ClassNamePayload>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/classname/fetch-class-name?value=${encodeURIComponent(className)}`,
  );
  const success = await expectJsonSuccess(response, `classname ${className}`);
  const classNameId = success.data?.classNameId ?? -1;
  if (classNameId <= 0) {
    throw new CliError(`classNameId no resuelto para ${className}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }
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
  const accessToken = await fetchAccessToken(config, dependencies);
  const response = await authedGet<{
    friendlyURL?: string;
    friendlyUrl?: string;
    nameCurrentValue?: string;
    name?: string;
    parentGroupId?: number;
  }>(config, apiClient, accessToken, `/api/jsonws/group/get-group?groupId=${groupId}`);

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

async function resolveCompanyId(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  siteId: number,
): Promise<number> {
  const groupResponse = await authedGet<GroupPayload>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/group/get-group?groupId=${siteId}`,
  );

  if (groupResponse.ok) {
    const companyId = groupResponse.data?.companyId ?? -1;
    if (companyId > 0) {
      return companyId;
    }
  }

  const companiesResponse = await authedGet<Array<{companyId?: number}>>(
    config,
    apiClient,
    accessToken,
    '/api/jsonws/company/get-companies',
  );

  if (!companiesResponse.ok || !Array.isArray(companiesResponse.data) || companiesResponse.data.length === 0) {
    return -1;
  }

  return companiesResponse.data[0]?.companyId ?? -1;
}

async function fetchDdmTemplates(
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  companyId: number,
  groupId: number | null,
  classNameId: number,
  resourceClassNameId: number,
): Promise<Record<string, unknown>[]> {
  const groupQuery = groupId === null ? '0' : String(groupId);
  const response = await authedGet<Record<string, unknown>[]>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/ddm.ddmtemplate/get-templates?companyId=${companyId}&groupId=${groupQuery}&classNameId=${classNameId}&resourceClassNameId=${resourceClassNameId}&status=0`,
  );

  if (!response.ok) {
    return [];
  }

  return Array.isArray(response.data) ? response.data : [];
}
