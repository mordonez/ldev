import path from 'node:path';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {normalizeScalarString} from '../../../core/utils/text.js';
import {
  asRecord,
  assignOptionalBoolean,
  assignOptionalFiniteNumber,
  assignOptionalNumber,
  assignOptionalString,
  firstString,
  summarizeContentFields,
  type ContentStructurePayload,
  type ContentStructureSummary,
  type DisplayPageTemplatePayload,
  type FragmentEntryLink,
  type JournalArticleSummary,
  type JournalArticlePayload,
  type RenderedContentPayload,
  type StructuredContent,
} from './liferay-inventory-page-assemble.js';
import type {ResolvedSite} from '../portal/site-resolution.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {buildSiteChain, fetchGroupInfo} from '../portal/site-resolution.js';
import {listDdmTemplates, resolveResourceSite} from '../portal/template-queries.js';
import {matchesDdmTemplate} from '../liferay-identifiers.js';
import {resolveSiteToken} from '../portal/site-token.js';
import {tryResolveArtifactSiteDir} from '../portal/artifact-paths.js';
import {
  type ArticleRef,
  fetchContentStructureById,
  fetchLatestJournalArticle,
  fetchStructuredContentById,
  fetchStructuredContentByUuid,
} from './liferay-inventory-page-fetch-article.js';
import {safeGatewayGet} from './liferay-inventory-page-fetch-http.js';
import type {HeadlessPageElementPayload} from '../page-layout/liferay-site-page-shared.js';

type TemplateInfo = {
  widgetTemplateCandidates: string[];
  displayPageTemplateCandidates: string[];
  widgetHeadlessDefaultTemplate: string | undefined;
  displayPageDefaultTemplate: string | undefined;
};

export async function collectLayoutJournalArticles(
  gateway: LiferayGateway,
  config: AppConfig,
  apiClient: HttpApiClient,
  defaultGroupId: number,
  pageElement?: HeadlessPageElementPayload | null,
): Promise<JournalArticleSummary[]> {
  const refs = extractArticleRefs(defaultGroupId, pageElement);
  const result: JournalArticleSummary[] = [];

  for (const ref of refs.values()) {
    result.push(await buildJournalArticleSummary(gateway, config, apiClient, ref));
  }

  return result;
}

export async function buildJournalArticleSummary(
  gateway: LiferayGateway,
  config: AppConfig,
  apiClient: HttpApiClient,
  ref: ArticleRef,
  options?: {
    article?: JournalArticlePayload | null;
    structuredContent?: StructuredContent | null;
    fallbackSite?: ResolvedSite;
    fallbackTitle?: string;
    fallbackContentStructureId?: number;
    includeHeadlessInventoryFields?: boolean;
  },
): Promise<JournalArticleSummary> {
  let structuredContent = options?.structuredContent ?? null;
  if (!structuredContent && ref.structuredContentId && ref.structuredContentId > 0) {
    structuredContent = await fetchStructuredContentById(gateway, ref.structuredContentId);
  }

  const resolvedArticleId = ref.articleId || structuredContent?.key || '';
  const article =
    options?.article ??
    (resolvedArticleId ? await fetchLatestJournalArticle(gateway, ref.groupId, resolvedArticleId) : null);
  const articleSite =
    (await safeFetchGroupInfo(config, ref.groupId, {apiClient, gateway})) ??
    (options?.fallbackSite
      ? {
          friendlyUrl: options.fallbackSite.friendlyUrlPath,
          name: options.fallbackSite.name,
          parentGroupId: -1,
        }
      : null);
  const ddmTemplateKey = ref.ddmTemplateKey ?? firstString(article?.ddmTemplateKey);
  const summary: JournalArticleSummary = {
    groupId: ref.groupId,
    ...(articleSite?.friendlyUrl ? {siteFriendlyUrl: articleSite.friendlyUrl} : {}),
    ...(articleSite?.name ? {siteName: articleSite.name} : {}),
    articleId: resolvedArticleId,
    title:
      firstString(article?.titleCurrentValue) ?? firstString(article?.title) ?? options?.fallbackTitle ?? ref.articleId,
    ddmStructureKey: firstString(article?.ddmStructureKey) ?? '',
    ...(ddmTemplateKey ? {ddmTemplateKey} : {}),
    ...(options?.fallbackContentStructureId ? {contentStructureId: Number(options.fallbackContentStructureId)} : {}),
  };

  const uuid = firstString(article?.uuid);
  if (!structuredContent && uuid) {
    structuredContent = await fetchStructuredContentByUuid(gateway, ref.groupId, uuid);
  }

  if (!structuredContent) {
    const structuredContentId = Number(article?.id ?? article?.resourcePrimKey ?? -1);
    if (structuredContentId > 0) {
      structuredContent = await fetchStructuredContentById(gateway, structuredContentId);
    }
  }

  if (structuredContent) {
    if (options?.includeHeadlessInventoryFields) {
      enrichJournalArticleWithStructuredContent(summary, structuredContent, ddmTemplateKey);
    }
    if (structuredContent.contentStructureId) {
      summary.contentStructureId = Number(structuredContent.contentStructureId);
    }
    const contentFields = summarizeContentFields(structuredContent.contentFields);
    if (contentFields.length > 0) {
      summary.contentFields = contentFields;
    }
  } else if (article) {
    const jsonwsContentStructureId = Number(article.contentStructureId ?? -1);
    if (jsonwsContentStructureId > 0) {
      summary.contentStructureId = jsonwsContentStructureId;
    }
  }

  if (!summary.ddmStructureKey && summary.contentStructureId) {
    const contentStructure = await fetchContentStructureById(gateway, summary.contentStructureId);
    const contentStructureKey = inferContentStructureKey(contentStructure);
    if (contentStructureKey) {
      summary.ddmStructureKey = contentStructureKey;
    }
  }

  if (articleSite?.friendlyUrl && summary.ddmStructureKey) {
    const structureSite = await resolveStructureSiteByKey(
      gateway,
      config,
      apiClient,
      articleSite.friendlyUrl,
      summary.ddmStructureKey,
    );
    if (structureSite) {
      summary.ddmStructureSiteFriendlyUrl = structureSite.siteFriendlyUrl;
      const structureExportPath = buildStructureExportPath(
        config,
        structureSite.siteFriendlyUrl,
        summary.ddmStructureKey,
      );
      if (structureExportPath) {
        summary.structureExportPath = structureExportPath;
      }
    }
  }

  if (articleSite?.friendlyUrl && ddmTemplateKey) {
    const templateSite = await resolveTemplateSiteByKey(config, articleSite.friendlyUrl, ddmTemplateKey, {
      apiClient,
      gateway,
    });
    if (templateSite) {
      summary.ddmTemplateSiteFriendlyUrl = templateSite;
      const templateExportPath = buildTemplateExportPath(config, templateSite, ddmTemplateKey);
      if (templateExportPath) {
        summary.templateExportPath = templateExportPath;
      }
    }
  }

  const displayPageSiteId = Number(summary.siteId ?? ref.groupId);
  if (
    displayPageSiteId > 0 &&
    summary.displayPageTemplateCandidates &&
    summary.displayPageTemplateCandidates.length > 0
  ) {
    const displayPageDdmTemplates = await resolveDisplayPageDdmTemplates(
      gateway,
      displayPageSiteId,
      summary.displayPageTemplateCandidates,
    );
    if (displayPageDdmTemplates.length > 0) {
      summary.displayPageDdmTemplates = displayPageDdmTemplates;
    }
  }

  return summary;
}

export async function collectLayoutContentStructures(
  gateway: LiferayGateway,
  config: AppConfig,
  apiClient: HttpApiClient,
  journalArticles: JournalArticleSummary[],
): Promise<ContentStructureSummary[]> {
  const seen = new Set<number>();
  const result: ContentStructureSummary[] = [];

  for (const article of journalArticles) {
    const contentStructureId = Number(article.contentStructureId ?? -1);
    if (contentStructureId <= 0 || seen.has(contentStructureId)) {
      continue;
    }
    seen.add(contentStructureId);
    const response = await safeGatewayGet<ContentStructurePayload>(
      gateway,
      `/o/headless-delivery/v1.0/content-structures/${contentStructureId}`,
      'fetch-content-structure',
    );
    if (!response.ok) {
      continue;
    }
    const key = inferContentStructureKey(response.data) || article.ddmStructureKey;
    const siteFriendlyUrl = article.ddmStructureSiteFriendlyUrl ?? article.siteFriendlyUrl;
    const exportPath = siteFriendlyUrl && key ? buildStructureExportPath(config, siteFriendlyUrl, key) : undefined;
    result.push({
      contentStructureId,
      ...(key ? {key} : {}),
      name: firstString(response.data?.name) ?? '',
      ...(siteFriendlyUrl ? {siteFriendlyUrl} : {}),
      ...(exportPath ? {exportPath} : {}),
    });
  }

  return result;
}

function extractArticleRefs(
  defaultGroupId: number,
  pageElement?: HeadlessPageElementPayload | null,
): Map<string, ArticleRef> {
  const refs = new Map<string, ArticleRef>();
  collectArticleRefsFromValue(pageElement, refs, defaultGroupId);

  return refs;
}

function collectArticleRefsFromValue(value: unknown, refs: Map<string, ArticleRef>, defaultGroupId: number): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectArticleRefsFromValue(item, refs, defaultGroupId);
    }
    return;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return;
  }

  const directPrefsMap = asRecord(record.portletPreferencesMap);
  const nestedPrefsMap = asRecord(asRecord(record.configuration).portletPreferencesMap);
  collectArticleRefFromPreferences(directPrefsMap, refs, defaultGroupId);
  collectArticleRefFromPreferences(nestedPrefsMap, refs, defaultGroupId);
  const mapping = asRecord(record.mapping);
  collectArticleRefFromItemReference(
    asRecord(record.itemReference),
    refs,
    defaultGroupId,
    firstString(record.fieldKey),
  );
  collectArticleRefFromItemReference(
    asRecord(mapping.itemReference),
    refs,
    defaultGroupId,
    firstString(mapping.fieldKey),
  );

  for (const item of Object.values(record)) {
    collectArticleRefsFromValue(item, refs, defaultGroupId);
  }
}

function collectArticleRefFromPreferences(
  prefsMap: FragmentEntryLink,
  refs: Map<string, ArticleRef>,
  defaultGroupId: number,
): void {
  const articleId = firstString(prefsMap.articleId);
  if (!articleId) {
    return;
  }

  const groupId = Number(firstString(prefsMap.groupId) ?? defaultGroupId) || defaultGroupId;
  const ddmTemplateKey = firstString(prefsMap.ddmTemplateKey);
  refs.set(articleId, {
    articleId,
    groupId,
    ...(ddmTemplateKey ? {ddmTemplateKey} : {}),
  });
}

function collectArticleRefFromItemReference(
  itemReference: FragmentEntryLink,
  refs: Map<string, ArticleRef>,
  defaultGroupId: number,
  fieldKey?: string,
): void {
  if (Object.keys(itemReference).length === 0) {
    return;
  }

  const contextSource = firstString(itemReference.contextSource);
  if (contextSource === 'DisplayPageItem') {
    return;
  }

  const className = firstString(itemReference.className) ?? firstString(itemReference.itemClassName) ?? '';
  if (className && !className.includes('JournalArticle') && !className.includes('StructuredContent')) {
    return;
  }

  const articleId =
    firstString(itemReference.articleId) ?? firstString(itemReference.key) ?? firstString(itemReference.itemKey);
  const structuredContentId = Number(
    firstString(itemReference.classPK) ??
      firstString(itemReference.classPk) ??
      firstString(itemReference.id) ??
      firstString(itemReference.itemId) ??
      Number.NaN,
  );

  if (!articleId && (!Number.isFinite(structuredContentId) || structuredContentId <= 0)) {
    return;
  }

  const groupId =
    Number(firstString(itemReference.groupId) ?? firstString(itemReference.siteId) ?? defaultGroupId) || defaultGroupId;
  const ddmTemplateKey = extractDdmTemplateKey(fieldKey ?? firstString(itemReference.fieldKey));
  const key = articleId || `structuredContent:${groupId}:${structuredContentId}`;
  refs.set(key, {
    articleId: articleId ?? '',
    groupId,
    ...(ddmTemplateKey ? {ddmTemplateKey} : {}),
    ...(Number.isFinite(structuredContentId) && structuredContentId > 0 ? {structuredContentId} : {}),
  });
}

function extractDdmTemplateKey(fieldKey: string | undefined): string | undefined {
  const trimmed = fieldKey?.trim();
  if (!trimmed?.startsWith('ddmTemplate_')) {
    return undefined;
  }
  return trimmed.slice('ddmTemplate_'.length).trim() || undefined;
}

async function resolveStructureSiteByKey(
  gateway: LiferayGateway,
  config: AppConfig,
  apiClient: HttpApiClient,
  startSite: string,
  structureKey: string,
): Promise<{siteFriendlyUrl: string} | null> {
  const siteChain = await buildSiteChain(config, startSite, {apiClient, gateway});
  for (const site of siteChain) {
    const response = await safeGatewayGet<Record<string, unknown>>(
      gateway,
      `/o/data-engine/v2.0/sites/${site.siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(structureKey)}`,
      'resolve-structure-site-by-key',
    );
    if (response.ok) {
      return {siteFriendlyUrl: site.siteFriendlyUrl};
    }
  }
  return null;
}

async function safeFetchGroupInfo(
  _config: AppConfig,
  groupId: number,
  dependencies: {apiClient: HttpApiClient; gateway: LiferayGateway},
) {
  try {
    return await fetchGroupInfo(dependencies.gateway, groupId);
  } catch {
    return null;
  }
}

async function resolveTemplateSiteByKey(
  config: AppConfig,
  startSite: string,
  templateKey: string,
  dependencies: {apiClient: HttpApiClient; gateway: LiferayGateway},
): Promise<string | null> {
  const siteChain = await buildSiteChain(config, startSite, dependencies);
  for (const candidate of siteChain) {
    const site = await resolveResourceSite(config, candidate.siteFriendlyUrl, dependencies);
    const templates = await listDdmTemplates(config, site, dependencies, {
      includeCompanyFallback: candidate.siteFriendlyUrl === '/global',
    });
    if (templates.some((item) => matchesDdmTemplate(item, templateKey))) {
      return candidate.siteFriendlyUrl;
    }
  }
  return null;
}

function buildStructureExportPath(config: AppConfig, siteFriendlyUrl: string, key: string): string | undefined {
  const siteDir = tryResolveArtifactSiteDir(config, 'structure', resolveSiteToken(siteFriendlyUrl));
  return siteDir ? path.join(siteDir, `${key}.json`) : undefined;
}

function buildTemplateExportPath(config: AppConfig, siteFriendlyUrl: string, key: string): string | undefined {
  const siteDir = tryResolveArtifactSiteDir(config, 'template', resolveSiteToken(siteFriendlyUrl));
  return siteDir ? path.join(siteDir, `${key}.ftl`) : undefined;
}

async function resolveDisplayPageDdmTemplates(
  gateway: LiferayGateway,
  siteId: number,
  displayPageTemplateCandidates: string[],
): Promise<string[]> {
  const response = await safeGatewayGet<{items?: DisplayPageTemplatePayload[]}>(
    gateway,
    `/o/headless-admin-content/v1.0/sites/${siteId}/display-page-templates?pageSize=200`,
    'fetch-display-page-templates',
  );
  if (!response.ok || !Array.isArray(response.data?.items) || displayPageTemplateCandidates.length === 0) {
    return [];
  }

  const requestedNames = new Set(
    displayPageTemplateCandidates.map((value) => value.trim().toUpperCase()).filter(Boolean),
  );
  const ddmTemplates = new Set<string>();

  for (const item of response.data.items) {
    const title = (firstString(item.title) ?? '').toUpperCase();
    const templateKey = (firstString(item.displayPageTemplateKey) ?? '').toUpperCase();
    if (!requestedNames.has(title) && !requestedNames.has(templateKey)) {
      continue;
    }

    collectDisplayPageDdmTemplates(item.pageDefinition, ddmTemplates);
  }

  return [...ddmTemplates];
}

function collectDisplayPageDdmTemplates(value: unknown, ddmTemplates: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDisplayPageDdmTemplates(item, ddmTemplates);
    }
    return;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return;
  }

  const fieldKey = firstString(record.fieldKey)?.trim();
  if (fieldKey?.startsWith('ddmTemplate_')) {
    ddmTemplates.add(fieldKey.slice('ddmTemplate_'.length));
  }

  for (const nestedValue of Object.values(record)) {
    collectDisplayPageDdmTemplates(nestedValue, ddmTemplates);
  }
}

function inferContentStructureKey(value: ContentStructurePayload | null | undefined): string {
  const explicit = firstString(value?.dataDefinitionKey) ?? firstString(value?.key) ?? '';
  if (explicit) {
    return explicit;
  }
  const name = firstString(value?.name) ?? '';
  return /^[A-Z0-9_]+$/.test(name) ? name : '';
}

function extractTemplatesFromRenderedContents(renderedContents: RenderedContentPayload[]): TemplateInfo {
  const widgetTemplateCandidates: string[] = [];
  const displayPageTemplateCandidates: string[] = [];
  let widgetHeadlessDefaultTemplate: string | undefined;
  let displayPageDefaultTemplate: string | undefined;

  for (const entry of renderedContents) {
    const template = firstString(entry.contentTemplateName) ?? firstString(entry.contentTemplateId);
    if (!template) {
      continue;
    }
    const renderedUrl = firstString(entry.renderedContentURL) ?? '';
    const markedAsDefault = Boolean(entry.markedAsDefault);
    const isDisplayPage = renderedUrl.includes('/rendered-content-by-display-page/');
    if (isDisplayPage) {
      displayPageTemplateCandidates.push(template);
      if (markedAsDefault && !displayPageDefaultTemplate) {
        displayPageDefaultTemplate = template;
      }
    } else {
      widgetTemplateCandidates.push(template);
      if (markedAsDefault && !widgetHeadlessDefaultTemplate) {
        widgetHeadlessDefaultTemplate = template;
      }
    }
  }

  return {
    widgetTemplateCandidates,
    displayPageTemplateCandidates,
    widgetHeadlessDefaultTemplate,
    displayPageDefaultTemplate,
  };
}

function enrichJournalArticleWithStructuredContent(
  summary: JournalArticleSummary,
  structuredContent: StructuredContent,
  ddmTemplateKey?: string,
): void {
  const record = asRecord(structuredContent);
  const renderedContents = Array.isArray(record.renderedContents)
    ? record.renderedContents.map((item) => asRecord(item))
    : [];
  const taxonomyCategoryBriefs = Array.isArray(record.taxonomyCategoryBriefs)
    ? record.taxonomyCategoryBriefs.map((item) => asRecord(item))
    : [];

  const templates = extractTemplatesFromRenderedContents(renderedContents);
  const widgetDefaultTemplate = ddmTemplateKey || templates.widgetHeadlessDefaultTemplate;

  const taxonomyCategoryNames = taxonomyCategoryBriefs
    .map((item) => firstString(item.taxonomyCategoryName))
    .filter((value): value is string => Boolean(value));

  const priority = Number(record.priority);
  const relatedContentsCount = Array.isArray(record.relatedContents) ? record.relatedContents.length : undefined;
  const availableLanguages = Array.isArray(record.availableLanguages)
    ? record.availableLanguages
        .map((item) => normalizeScalarString(item))
        .filter((value): value is string => Boolean(value))
    : [];

  assignOptionalString(summary, 'widgetDefaultTemplate', widgetDefaultTemplate);
  assignOptionalString(summary, 'widgetHeadlessDefaultTemplate', templates.widgetHeadlessDefaultTemplate);
  assignOptionalString(summary, 'displayPageDefaultTemplate', templates.displayPageDefaultTemplate);
  if (templates.widgetTemplateCandidates.length > 0) {
    summary.widgetTemplateCandidates = templates.widgetTemplateCandidates;
  }
  if (templates.displayPageTemplateCandidates.length > 0) {
    summary.displayPageTemplateCandidates = templates.displayPageTemplateCandidates;
  }
  if (renderedContents.length > 0) {
    summary.renderedContents = renderedContents;
  }
  if (taxonomyCategoryBriefs.length > 0) {
    summary.taxonomyCategoryBriefs = taxonomyCategoryBriefs;
  }
  if (taxonomyCategoryNames.length > 0) {
    summary.taxonomyCategoryNames = taxonomyCategoryNames;
  }
  if (availableLanguages.length > 0) {
    summary.availableLanguages = availableLanguages;
  }

  assignOptionalString(summary, 'dateCreated', firstString(record.dateCreated));
  assignOptionalString(summary, 'dateModified', firstString(record.dateModified));
  assignOptionalString(summary, 'datePublished', firstString(record.datePublished));
  assignOptionalString(
    summary,
    'expirationDate',
    firstString(record.expirationDate) ?? firstString(record.dateExpired) ?? firstString(record.dateExpiration),
  );
  assignOptionalString(summary, 'reviewDate', firstString(record.reviewDate) ?? firstString(record.dateReview));
  assignOptionalString(summary, 'description', firstString(record.description));
  assignOptionalString(summary, 'externalReferenceCode', firstString(record.externalReferenceCode));
  assignOptionalString(summary, 'uuid', firstString(record.uuid));

  assignOptionalNumber(summary, 'siteId', Number(record.siteId));
  assignOptionalNumber(summary, 'structuredContentFolderId', Number(record.structuredContentFolderId));
  assignOptionalFiniteNumber(summary, 'priority', priority);

  assignOptionalBoolean(summary, 'neverExpire', record.neverExpire);
  assignOptionalBoolean(summary, 'subscribed', record.subscribed);
  if (typeof relatedContentsCount === 'number') {
    summary.relatedContentsCount = relatedContentsCount;
  }
}
