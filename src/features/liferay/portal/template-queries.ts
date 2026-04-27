import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient, HttpResponse} from '../../../core/http/client.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {isRecord} from '../../../core/utils/json.js';
import {normalizeScalarString} from '../../../core/utils/text.js';
import {expectJsonSuccess as expectJsonSuccessShared} from '../liferay-http-shared.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {classNameIdLookupCache} from '../lookup-cache.js';
import {
  enrichWithCompanyId,
  resolveSite,
  type ResolvedSite,
  type SiteResolutionDependencies,
} from './site-resolution.js';

const DDM_STRUCTURE_CLASS_NAME = 'com.liferay.dynamic.data.mapping.model.DDMStructure';
const JOURNAL_ARTICLE_CLASS_NAME = 'com.liferay.journal.model.JournalArticle';
const ADT_RESOURCE_CLASS_NAME = 'com.liferay.portlet.display.template.PortletDisplayTemplate';

export type ResolvedResourceSite = ResolvedSite & {
  companyId: number;
};

export type DdmTemplatePayload = {
  templateId?: string | number;
  templateKey?: string;
  externalReferenceCode?: string;
  nameCurrentValue?: string;
  name?: string;
  classPK?: string | number;
  classNameId?: number;
  script?: string;
  language?: string;
  type?: string;
  mode?: string;
};

type ClassNamePayload = {
  classNameId?: number;
};

function expectResourceJsonSuccess<T>(response: HttpResponse<T>, label: string): HttpResponse<T> {
  return expectJsonSuccessShared(response, label, 'LIFERAY_RESOURCE_ERROR');
}

function createTemplateQueryGateway(
  config: AppConfig,
  apiClient: HttpApiClient,
  dependencies?: Pick<SiteResolutionDependencies, 'gateway' | 'tokenClient' | 'accessToken'>,
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
  dependencies?: SiteResolutionDependencies,
): Promise<ResolvedResourceSite> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createTemplateQueryGateway(config, apiClient, dependencies);
  const resolvedSite = await resolveSite(config, site, {...dependencies, gateway});
  return enrichWithCompanyId(resolvedSite, config, {...dependencies, gateway});
}

export async function fetchStructureTemplateClassIds(
  config: AppConfig,
  dependencies?: SiteResolutionDependencies,
): Promise<{classNameId: number; resourceClassNameId: number}> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createTemplateQueryGateway(config, apiClient, dependencies);
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
  dependencies?: SiteResolutionDependencies,
): Promise<number> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createTemplateQueryGateway(config, apiClient, dependencies);
  return fetchClassNameIdWithGateway(config, gateway, className, dependencies?.forceRefresh);
}

export async function fetchAdtResourceClassNameId(
  config: AppConfig,
  dependencies?: SiteResolutionDependencies,
): Promise<number> {
  return fetchClassNameIdForValue(config, ADT_RESOURCE_CLASS_NAME, dependencies);
}

export async function listDdmTemplates(
  config: AppConfig,
  site: ResolvedResourceSite,
  dependencies?: SiteResolutionDependencies,
  options?: {includeCompanyFallback?: boolean},
): Promise<DdmTemplatePayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createTemplateQueryGateway(config, apiClient, dependencies);
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
  dependencies?: SiteResolutionDependencies,
): Promise<DdmTemplatePayload[]> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createTemplateQueryGateway(config, apiClient, dependencies);
  const classNameId = await fetchClassNameIdWithGateway(config, gateway, className, dependencies?.forceRefresh);
  return fetchDdmTemplates(gateway, site.companyId, site.id, classNameId, resourceClassNameId);
}

function asStr(v: unknown): string | undefined {
  return normalizeScalarString(v);
}

function asNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toDdmTemplatePayload(raw: unknown): DdmTemplatePayload {
  if (!isRecord(raw)) return {};
  return {
    templateId: asStr(raw.templateId),
    templateKey: asStr(raw.templateKey),
    externalReferenceCode: asStr(raw.externalReferenceCode),
    nameCurrentValue: asStr(raw.nameCurrentValue),
    name: asStr(raw.name),
    classPK: asStr(raw.classPK),
    classNameId: asNum(raw.classNameId),
    script: typeof raw.script === 'string' ? raw.script : undefined,
    language: asStr(raw.language),
    type: asStr(raw.type),
    mode: asStr(raw.mode),
  };
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
  const success = expectResourceJsonSuccess(response, `classname ${className}`);
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
