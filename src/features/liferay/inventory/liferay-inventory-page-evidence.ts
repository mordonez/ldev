import type {
  PageEvidenceContext as PageEvidenceContextContract,
  PageEvidenceKindValue,
  PageEvidenceResourceTypeValue,
  PageEvidenceSourceValue,
} from './liferay-inventory-evidence-contract.js';
import type {
  ContentStructureSummary,
  JournalArticleSummary,
  PageFragmentEntry,
} from './liferay-inventory-page-assemble.js';
import type {LiferayInventoryPageResult, PagePortletSummary} from './liferay-inventory-page.js';
import {
  buildFragmentDetail,
  buildJournalArticleStructureDetail,
  buildPortletDetail,
  buildWidgetDetail,
  describeJournalArticleEvidence,
} from './liferay-inventory-page-evidence-detail.js';

export type PageEvidenceResourceType = PageEvidenceResourceTypeValue;
export type PageEvidenceKind = PageEvidenceKindValue;
export type PageEvidenceContext = PageEvidenceContextContract;

export type PageEvidence = {
  resourceType: PageEvidenceResourceType;
  key: string;
  kind: PageEvidenceKind;
  detail: string;
  source: PageEvidenceSourceValue;
  context?: PageEvidenceContext;
};

type PageEvidenceInput = {
  resourceType: PageEvidenceResourceType;
  key: string;
  kind: PageEvidenceKind;
  detail: string;
  source: PageEvidence['source'];
  context?: PageEvidenceContext;
};

export function extractPageEvidence(page: LiferayInventoryPageResult): PageEvidence[] {
  if (page.pageType === 'siteRoot') {
    return [];
  }

  if (page.evidence) {
    return page.evidence;
  }

  if (page.pageType === 'displayPage') {
    return buildDisplayPageEvidence({
      article: page.article,
      journalArticles: page.journalArticles,
      contentStructures: page.contentStructures,
    });
  }

  return buildRegularPageEvidence({
    fragmentEntryLinks: page.fragmentEntryLinks,
    portlets: page.portlets,
    journalArticles: page.journalArticles,
    contentStructures: page.contentStructures,
  });
}

export function buildRegularPageEvidence(input: {
  fragmentEntryLinks?: PageFragmentEntry[];
  portlets?: PagePortletSummary[];
  journalArticles?: JournalArticleSummary[];
  contentStructures?: ContentStructureSummary[];
}): PageEvidence[] {
  return [
    ...buildFragmentEvidence(input.fragmentEntryLinks ?? []),
    ...buildPortletEvidence(input.portlets ?? []),
    ...buildJournalArticleEvidence(input.journalArticles ?? [], input.contentStructures ?? []),
    ...buildContentStructureEvidence(input.contentStructures ?? []),
  ];
}

export function buildDisplayPageEvidence(input: {
  article: {key: string; contentStructureId: number};
  journalArticles?: JournalArticleSummary[];
  contentStructures?: ContentStructureSummary[];
}): PageEvidence[] {
  return [
    ...buildJournalArticleEvidence(input.journalArticles ?? [], input.contentStructures ?? []),
    ...buildContentStructureEvidence(input.contentStructures ?? []),
    createPageEvidence({
      resourceType: 'structure',
      key: String(input.article.contentStructureId),
      kind: 'displayPageArticle',
      detail: `displayPage articleKey=${input.article.key} contentStructureId=${input.article.contentStructureId}`,
      source: 'displayPageArticle',
      context: {articleId: input.article.key, contentStructureId: input.article.contentStructureId},
    }),
  ];
}

function buildFragmentEvidence(entries: PageFragmentEntry[]): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  entries.forEach((entry, index) => {
    if (entry.type === 'fragment' && entry.fragmentKey) {
      const detail = buildFragmentDetail(entry.fragmentKey, entry.elementName, index);

      evidence.push(
        createPageEvidence({
          resourceType: 'fragment',
          key: entry.fragmentKey,
          kind: 'fragmentEntry',
          detail,
          source: 'fragmentEntryLink',
        }),
      );

      for (const templateKey of entry.mappedTemplateKeys ?? []) {
        evidence.push(
          createPageEvidence({
            resourceType: 'template',
            key: templateKey,
            kind: 'fragmentMappedTemplate',
            detail,
            source: 'fragmentEntryLink',
          }),
        );
      }

      for (const structureKey of entry.mappedStructureKeys ?? []) {
        evidence.push(
          createPageEvidence({
            resourceType: 'structure',
            key: structureKey,
            kind: 'fragmentMappedStructure',
            detail,
            source: 'fragmentEntryLink',
          }),
        );
      }
      return;
    }

    if (entry.type === 'widget') {
      const detail = buildWidgetDetail(entry.widgetName, entry.portletId, entry.elementName, index);
      const candidates = [entry.widgetName, entry.portletId].filter(isNonEmptyString);
      for (const candidate of candidates) {
        evidence.push(
          createPageEvidence({
            resourceType: 'widget',
            key: candidate,
            kind: 'widgetEntry',
            detail,
            source: 'fragmentEntryLink',
          }),
        );
      }

      appendAdtEvidenceFromConfiguration(evidence, entry.configuration, detail, 'fragmentEntryLink');
    }
  });

  return evidence;
}

function buildPortletEvidence(portlets: PagePortletSummary[]): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  for (const portlet of portlets) {
    const detail = buildPortletDetail(portlet);
    const candidates = [portlet.portletId, portlet.portletName].filter(isNonEmptyString);
    for (const candidate of candidates) {
      evidence.push(
        createPageEvidence({
          resourceType: 'portlet',
          key: candidate,
          kind: 'portlet',
          detail,
          source: 'portletLayout',
        }),
      );
    }

    appendAdtEvidenceFromConfiguration(evidence, portlet.configuration, detail, 'portletLayout');
  }

  return evidence;
}

function buildJournalArticleEvidence(
  articles: JournalArticleSummary[],
  structures: ContentStructureSummary[],
): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  for (const article of articles) {
    const descriptor = describeJournalArticleEvidence(article, structures);

    if (article.articleId) {
      evidence.push(
        createPageEvidence({
          resourceType: 'journalArticle',
          key: article.articleId,
          kind: 'journalArticle',
          detail: descriptor.where,
          source: 'journalArticle',
          context: descriptor.context,
        }),
      );
    }

    if (article.ddmStructureKey) {
      evidence.push(
        createPageEvidence({
          resourceType: 'structure',
          key: article.ddmStructureKey,
          kind: 'journalArticleStructure',
          detail: buildJournalArticleStructureDetail(descriptor),
          source: 'journalArticle',
          context: descriptor.context,
        }),
      );
    }

    const templateCandidates = [
      article.ddmTemplateKey,
      article.widgetDefaultTemplate,
      article.widgetHeadlessDefaultTemplate,
      ...(article.displayPageDdmTemplates ?? []),
    ].filter(isNonEmptyString);
    for (const templateKey of templateCandidates) {
      evidence.push(
        createPageEvidence({
          resourceType: 'template',
          key: templateKey,
          kind: 'journalArticleTemplate',
          detail: descriptor.where,
          source: 'journalArticle',
          context: descriptor.context,
        }),
      );
    }
  }

  return evidence;
}

function buildContentStructureEvidence(structures: ContentStructureSummary[]): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  for (const structure of structures) {
    const candidates = [structure.key, String(structure.contentStructureId)].filter(isNonEmptyString);
    for (const key of candidates) {
      evidence.push(
        createPageEvidence({
          resourceType: 'structure',
          key,
          kind: 'contentStructure',
          detail: `contentStructureId=${structure.contentStructureId} name=${structure.name}`,
          source: 'contentStructure',
          context: {
            contentStructureId: structure.contentStructureId,
            contentStructureName: structure.name,
          },
        }),
      );
    }
  }

  return evidence;
}

function appendAdtEvidenceFromConfiguration(
  evidence: PageEvidence[],
  configuration: Record<string, string> | undefined,
  detail: string,
  source: PageEvidence['source'],
): void {
  const rawDisplayStyle = configuration?.displayStyle;
  const displayStyle = typeof rawDisplayStyle === 'string' ? rawDisplayStyle.trim() : undefined;
  if (!displayStyle || !displayStyle.startsWith('ddmTemplate_')) {
    return;
  }

  evidence.push(
    createPageEvidence({
      resourceType: 'adt',
      key: displayStyle,
      kind: 'widgetAdt',
      detail: `${detail} displayStyle=${displayStyle}`,
      source,
    }),
  );
}

function createPageEvidence(input: PageEvidenceInput): PageEvidence {
  return input.context ? {...input} : {...input, context: undefined};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
