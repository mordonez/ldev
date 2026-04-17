import path from 'node:path';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {
  asRecord,
  assignOptionalBoolean,
  assignOptionalFiniteNumber,
  assignOptionalNumber,
  assignOptionalString,
  firstString,
  summarizeContentFields,
  type ContentStructureSummary,
  type JournalArticleSummary,
  type StructuredContent,
} from './liferay-inventory-page-assemble.js';
import type {ResolvedSite} from './liferay-inventory-shared.js';
import type {LiferayGateway} from '../liferay-gateway.js';
import {
  buildResourceSiteChain,
  fetchGroupInfo,
  listDdmTemplates,
  resolveResourceSite,
} from '../resource/liferay-resource-shared.js';
import {matchesDdmTemplate} from '../liferay-identifiers.js';
import {resolveArtifactSiteDir, resolveSiteToken} from '../resource/liferay-resource-paths.js';
import {
  type ArticleRef,
  fetchContentStructureById,
  fetchLatestJournalArticle,
  fetchStructuredContentById,
  fetchStructuredContentByUuid,
} from './liferay-inventory-page-fetch-article.js';
import {safeGatewayGet} from './liferay-inventory-page-fetch-http.js';

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
  fragmentEntryLinks: Array<Record<string, unknown>>,
): Promise<JournalArticleSummary[]> {
  const refs = extractArticleRefs(fragmentEntryLinks, defaultGroupId);
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
    article?: Record<string, unknown> | null;
    structuredContent?: StructuredContent | null;
    fallbackSite?: ResolvedSite;
    fallbackTitle?: string;
    fallbackContentStructureId?: number;
    includeHeadlessInventoryFields?: boolean;
  },
): Promise<JournalArticleSummary> {
  const article = options?.article ?? (await fetchLatestJournalArticle(gateway, ref.groupId, ref.articleId));
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
    articleId: ref.articleId,
    title: String(article?.titleCurrentValue ?? article?.title ?? options?.fallbackTitle ?? ref.articleId),
    ddmStructureKey: String(article?.ddmStructureKey ?? ''),
    ...(ddmTemplateKey ? {ddmTemplateKey} : {}),
    ...(options?.fallbackContentStructureId ? {contentStructureId: Number(options.fallbackContentStructureId)} : {}),
  };

  let structuredContent = options?.structuredContent ?? null;
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
      summary.structureExportPath = buildStructureExportPath(
        config,
        structureSite.siteFriendlyUrl,
        summary.ddmStructureKey,
      );
    }
  }

  if (articleSite?.friendlyUrl && ddmTemplateKey) {
    const templateSite = await resolveTemplateSiteByKey(config, articleSite.friendlyUrl, ddmTemplateKey, {
      apiClient,
      gateway,
    });
    if (templateSite) {
      summary.ddmTemplateSiteFriendlyUrl = templateSite;
      summary.templateExportPath = buildTemplateExportPath(config, templateSite, ddmTemplateKey);
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
    const response = await safeGatewayGet<Record<string, unknown>>(
      gateway,
      `/o/headless-delivery/v1.0/content-structures/${contentStructureId}`,
      'fetch-content-structure',
    );
    if (!response.ok) {
      continue;
    }
    const key = inferContentStructureKey(response.data) || article.ddmStructureKey;
    const siteFriendlyUrl = article.ddmStructureSiteFriendlyUrl ?? article.siteFriendlyUrl;
    result.push({
      contentStructureId,
      ...(key ? {key} : {}),
      name: String(response.data?.name ?? ''),
      ...(siteFriendlyUrl ? {siteFriendlyUrl} : {}),
      ...(siteFriendlyUrl && key ? {exportPath: buildStructureExportPath(config, siteFriendlyUrl, key)} : {}),
    });
  }

  return result;
}

function extractArticleRefs(
  fragmentEntryLinks: Array<Record<string, unknown>>,
  defaultGroupId: number,
): Map<string, ArticleRef> {
  const refs = new Map<string, ArticleRef>();

  for (const link of fragmentEntryLinks) {
    const editableValues = String(link.editableValues ?? '').trim();
    if (!editableValues || editableValues === '{}') {
      continue;
    }
    try {
      collectArticleRefsFromValue(JSON.parse(editableValues), refs, defaultGroupId);
    } catch {
      // Ignore invalid fragment editable values.
    }
  }

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

  for (const item of Object.values(record)) {
    collectArticleRefsFromValue(item, refs, defaultGroupId);
  }
}

function collectArticleRefFromPreferences(
  prefsMap: Record<string, unknown>,
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

async function resolveStructureSiteByKey(
  gateway: LiferayGateway,
  config: AppConfig,
  apiClient: HttpApiClient,
  startSite: string,
  structureKey: string,
): Promise<{siteFriendlyUrl: string} | null> {
  const siteChain = await buildResourceSiteChain(config, startSite, {apiClient, gateway});
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
  config: AppConfig,
  groupId: number,
  dependencies: {apiClient: HttpApiClient; gateway: LiferayGateway},
) {
  try {
    return await fetchGroupInfo(config, groupId, dependencies);
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
  const siteChain = await buildResourceSiteChain(config, startSite, dependencies);
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
  try {
    return path.join(resolveArtifactSiteDir(config, 'structure', resolveSiteToken(siteFriendlyUrl)), `${key}.json`);
  } catch {
    return undefined;
  }
}

function buildTemplateExportPath(config: AppConfig, siteFriendlyUrl: string, key: string): string | undefined {
  try {
    return path.join(resolveArtifactSiteDir(config, 'template', resolveSiteToken(siteFriendlyUrl)), `${key}.ftl`);
  } catch {
    return undefined;
  }
}

function inferContentStructureKey(value: Record<string, unknown> | null | undefined): string {
  const explicit = String(value?.dataDefinitionKey ?? value?.key ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const name = String(value?.name ?? '').trim();
  return /^[A-Z0-9_]+$/.test(name) ? name : '';
}

function extractTemplatesFromRenderedContents(renderedContents: Array<Record<string, unknown>>): TemplateInfo {
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
    ? record.availableLanguages.map((item) => String(item)).filter(Boolean)
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
