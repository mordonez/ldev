import type {StructuredContent, JournalArticlePayload} from './liferay-inventory-page-assemble.js';
import type {ArticleRef} from './liferay-inventory-page-fetch-article.js';
import {
  fetchLatestJournalArticle,
  fetchStructuredContentById,
  fetchStructuredContentByUuid,
} from './liferay-inventory-page-fetch-article.js';
import {firstString} from './liferay-inventory-page-assemble.js';
import type {LiferayGateway} from '../liferay-gateway.js';

export type ResolvedJournalArticleReference = {
  article: JournalArticlePayload | null;
  structuredContent: StructuredContent | null;
  resolvedArticleId: string;
};

export async function resolveJournalArticleReference(
  gateway: LiferayGateway,
  ref: ArticleRef,
  options?: {
    article?: JournalArticlePayload | null;
    structuredContent?: StructuredContent | null;
  },
): Promise<ResolvedJournalArticleReference> {
  let structuredContent = options?.structuredContent ?? null;
  if (!structuredContent && ref.structuredContentId && ref.structuredContentId > 0) {
    structuredContent = await fetchStructuredContentById(gateway, ref.structuredContentId);
  }

  const resolvedArticleId = ref.articleId || structuredContent?.key || '';
  const article =
    options?.article ??
    (resolvedArticleId ? await fetchLatestJournalArticle(gateway, ref.groupId, resolvedArticleId) : null);

  if (!structuredContent) {
    const uuid = firstString(article?.uuid);
    if (uuid) {
      structuredContent = await fetchStructuredContentByUuid(gateway, ref.groupId, uuid);
    }
  }

  if (!structuredContent) {
    const structuredContentId = Number(article?.id ?? article?.resourcePrimKey ?? -1);
    if (structuredContentId > 0) {
      structuredContent = await fetchStructuredContentById(gateway, structuredContentId);
    }
  }

  return {
    article,
    structuredContent,
    resolvedArticleId,
  };
}
