import type {LiferayGateway} from '../liferay-gateway.js';
import {LiferayErrors} from '../errors/index.js';
import {
  firstString,
  hasJsonWsException,
  type ContentStructurePayload,
  type JournalArticlePayload,
  type StructuredContent,
} from './liferay-inventory-page-assemble.js';
import {safeGatewayGet} from './liferay-inventory-page-fetch-http.js';

export type ArticleRef = {articleId: string; groupId: number; ddmTemplateKey?: string; structuredContentId?: number};

export async function resolveDisplayPageArticle(
  gateway: LiferayGateway,
  siteId: number,
  urlTitle: string,
): Promise<{article: StructuredContent; jsonwsArticle: JournalArticlePayload | null; articleRef: ArticleRef}> {
  const filter = encodeURIComponent(`friendlyUrlPath eq '${urlTitle}'`);
  const response = await safeGatewayGet<{items?: StructuredContent[]}>(
    gateway,
    `/o/headless-delivery/v1.0/sites/${siteId}/structured-contents?filter=${filter}&pageSize=1`,
    'site-structured-contents',
  );
  let article: StructuredContent | undefined = response.ok ? response.data?.items?.[0] : undefined;
  let jsonwsArticle = await fetchJournalArticleByUrlTitle(gateway, siteId, urlTitle);

  if (!article && jsonwsArticle) {
    article = {
      id: Number(jsonwsArticle.resourcePrimKey ?? jsonwsArticle.id ?? -1) || undefined,
      key: firstString(jsonwsArticle.articleId) ?? '',
      title: firstString(jsonwsArticle.titleCurrentValue) ?? firstString(jsonwsArticle.title) ?? '',
      friendlyUrlPath: urlTitle,
      contentStructureId: Number(jsonwsArticle.contentStructureId ?? -1) || undefined,
    };
  }

  if (!article) {
    throw LiferayErrors.inventoryError(
      `No structured content found with friendlyUrlPath=${urlTitle}. Verify the article URL title and site visibility, or confirm JSONWS/headless permissions for this OAuth client.`,
    );
  }

  const articleRef: ArticleRef = {
    articleId: article.key ?? firstString(jsonwsArticle?.articleId) ?? '',
    groupId: siteId,
    ...(firstString(jsonwsArticle?.ddmTemplateKey) ? {ddmTemplateKey: firstString(jsonwsArticle?.ddmTemplateKey)} : {}),
  };

  if (!jsonwsArticle && articleRef.articleId) {
    jsonwsArticle = await fetchLatestJournalArticle(gateway, siteId, articleRef.articleId);
  }

  return {article, jsonwsArticle, articleRef};
}

export async function resolveStructuredContentData(
  gateway: LiferayGateway,
  siteId: number,
  article: StructuredContent,
  jsonwsArticle: JournalArticlePayload | null,
): Promise<StructuredContent | null> {
  let structuredContent: StructuredContent | null = null;
  const uuid = firstString(jsonwsArticle?.uuid);

  if (uuid) {
    structuredContent = await fetchStructuredContentByUuid(gateway, siteId, uuid);
  }

  if (!structuredContent) {
    const structuredContentId = article.id && article.id > 0 ? article.id : -1;
    if (structuredContentId > 0) {
      structuredContent = await fetchStructuredContentById(gateway, structuredContentId);
    }
  }

  return structuredContent;
}

export async function fetchJournalArticleByUrlTitle(
  gateway: LiferayGateway,
  groupId: number,
  urlTitle: string,
): Promise<JournalArticlePayload | null> {
  try {
    const response = await safeGatewayGet<JournalArticlePayload>(
      gateway,
      `/api/jsonws/journal.journalarticle/get-article-by-url-title?groupId=${groupId}&urlTitle=${encodeURIComponent(urlTitle)}`,
      'get-article-by-url-title',
    );
    if (!response.ok || hasJsonWsException(response.data)) {
      return null;
    }
    return response.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchLatestJournalArticle(
  gateway: LiferayGateway,
  groupId: number,
  articleId: string,
): Promise<JournalArticlePayload | null> {
  try {
    const response = await safeGatewayGet<JournalArticlePayload>(
      gateway,
      `/api/jsonws/journal.journalarticle/get-latest-article?groupId=${groupId}&articleId=${encodeURIComponent(articleId)}&status=0`,
      'get-latest-article',
    );
    if (!response.ok || hasJsonWsException(response.data)) {
      return null;
    }
    return response.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchStructuredContentById(
  gateway: LiferayGateway,
  id: number,
): Promise<StructuredContent | null> {
  if (id <= 0) {
    return null;
  }
  const response = await safeGatewayGet<StructuredContent>(
    gateway,
    `/o/headless-delivery/v1.0/structured-contents/${id}`,
    'fetch-structured-content-by-id',
  );
  return response.ok ? (response.data ?? null) : null;
}

export async function fetchStructuredContentByUuid(
  gateway: LiferayGateway,
  groupId: number,
  uuid: string,
): Promise<StructuredContent | null> {
  if (!uuid) {
    return null;
  }
  const response = await safeGatewayGet<StructuredContent>(
    gateway,
    `/o/headless-delivery/v1.0/sites/${groupId}/structured-contents/by-uuid/${encodeURIComponent(uuid)}`,
    'fetch-structured-content-by-uuid',
  );
  return response.ok ? (response.data ?? null) : null;
}

export async function fetchContentStructureById(
  gateway: LiferayGateway,
  id: number,
): Promise<ContentStructurePayload | null> {
  if (id <= 0) {
    return null;
  }
  const response = await safeGatewayGet<ContentStructurePayload>(
    gateway,
    `/o/headless-delivery/v1.0/content-structures/${id}`,
    'fetch-content-structure-by-id',
  );
  return response.ok ? (response.data ?? null) : null;
}
