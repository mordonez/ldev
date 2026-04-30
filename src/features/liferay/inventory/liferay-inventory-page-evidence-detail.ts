import type {ContentStructureSummary, JournalArticleSummary} from './liferay-inventory-page-assemble.js';
import type {PagePortletSummary} from './liferay-inventory-page.js';
import type {PageEvidenceContext} from './liferay-inventory-page-evidence.js';

export type JournalArticleEvidenceDescriptor = {
  where: string;
  context: PageEvidenceContext;
};

export function describeJournalArticleEvidence(
  article: JournalArticleSummary,
  structures: ContentStructureSummary[],
): JournalArticleEvidenceDescriptor {
  const structure = structures.find(
    (candidate) =>
      (article.contentStructureId && candidate.contentStructureId === article.contentStructureId) ||
      (article.ddmStructureKey && candidate.key === article.ddmStructureKey) ||
      (article.ddmStructureKey && candidate.name === article.ddmStructureKey),
  );

  return {
    where: buildJournalArticleWhere(article),
    context: {
      ...(article.articleId ? {articleId: article.articleId} : {}),
      ...(article.title ? {articleTitle: article.title} : {}),
      ...(article.contentStructureId ? {contentStructureId: article.contentStructureId} : {}),
      ...(structure?.name ? {contentStructureName: structure.name} : {}),
    },
  };
}

export function buildFragmentDetail(fragmentKey: string, elementName: string | undefined, index: number): string {
  return [`fragmentKey=${fragmentKey}`, elementName ? `elementName=${elementName}` : null, `index=${index}`]
    .filter((value): value is string => value !== null)
    .join(' ');
}

export function buildWidgetDetail(
  widgetName: string | undefined,
  portletId: string | undefined,
  elementName: string | undefined,
  index: number,
): string {
  return [
    widgetName ? `widgetName=${widgetName}` : null,
    portletId ? `portletId=${portletId}` : null,
    elementName ? `elementName=${elementName}` : null,
    `index=${index}`,
  ]
    .filter((value): value is string => value !== null)
    .join(' ');
}

export function buildPortletDetail(portlet: PagePortletSummary): string {
  return `column=${portlet.columnId} position=${portlet.position} portletId=${portlet.portletId}`;
}

export function buildJournalArticleStructureDetail(descriptor: JournalArticleEvidenceDescriptor): string {
  return [
    descriptor.where,
    descriptor.context.contentStructureId ? `contentStructureId=${descriptor.context.contentStructureId}` : null,
    descriptor.context.contentStructureName ? `contentStructureName=${descriptor.context.contentStructureName}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(' ');
}

function buildJournalArticleWhere(article: JournalArticleSummary): string {
  return `articleId=${article.articleId} title=${article.title}`;
}
