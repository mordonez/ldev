import type {
  ContentStructureSummary,
  JournalArticleSummary,
  PageFragmentEntry,
} from './liferay-inventory-page-assemble.js';
import type {LiferayInventoryPageResult, PagePortletSummary} from './liferay-inventory-page.js';

export type PageEvidenceResourceType =
  | 'fragment'
  | 'widget'
  | 'portlet'
  | 'structure'
  | 'template'
  | 'adt'
  | 'journalArticle';

export type PageEvidenceKind =
  | 'fragmentEntry'
  | 'widgetEntry'
  | 'widgetAdt'
  | 'portlet'
  | 'journalArticle'
  | 'journalArticleStructure'
  | 'journalArticleTemplate'
  | 'fragmentMappedStructure'
  | 'fragmentMappedTemplate'
  | 'contentStructure'
  | 'displayPageArticle';

export type PageEvidence = {
  resourceType: PageEvidenceResourceType;
  key: string;
  kind: PageEvidenceKind;
  detail: string;
  source: 'fragmentEntryLink' | 'portletLayout' | 'journalArticle' | 'contentStructure' | 'displayPageArticle';
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
    {
      resourceType: 'structure',
      key: String(input.article.contentStructureId),
      kind: 'displayPageArticle',
      detail: `displayPage articleKey=${input.article.key} contentStructureId=${input.article.contentStructureId}`,
      source: 'displayPageArticle',
    },
  ];
}

function buildFragmentEvidence(entries: PageFragmentEntry[]): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  entries.forEach((entry, index) => {
    if (entry.type === 'fragment' && entry.fragmentKey) {
      evidence.push({
        resourceType: 'fragment',
        key: entry.fragmentKey,
        kind: 'fragmentEntry',
        detail: buildFragmentDetail(entry.fragmentKey, entry.elementName, index),
        source: 'fragmentEntryLink',
      });

      for (const templateKey of entry.mappedTemplateKeys ?? []) {
        evidence.push({
          resourceType: 'template',
          key: templateKey,
          kind: 'fragmentMappedTemplate',
          detail: buildFragmentDetail(entry.fragmentKey, entry.elementName, index),
          source: 'fragmentEntryLink',
        });
      }

      for (const structureKey of entry.mappedStructureKeys ?? []) {
        evidence.push({
          resourceType: 'structure',
          key: structureKey,
          kind: 'fragmentMappedStructure',
          detail: buildFragmentDetail(entry.fragmentKey, entry.elementName, index),
          source: 'fragmentEntryLink',
        });
      }
      return;
    }

    if (entry.type === 'widget') {
      const candidates = [entry.widgetName, entry.portletId].filter(isNonEmptyString);
      for (const candidate of candidates) {
        evidence.push({
          resourceType: 'widget',
          key: candidate,
          kind: 'widgetEntry',
          detail: buildWidgetDetail(entry.widgetName, entry.portletId, entry.elementName, index),
          source: 'fragmentEntryLink',
        });
      }

      appendAdtEvidenceFromConfiguration(
        evidence,
        entry.configuration,
        buildWidgetDetail(entry.widgetName, entry.portletId, entry.elementName, index),
        'fragmentEntryLink',
      );
    }
  });

  return evidence;
}

function buildPortletEvidence(portlets: PagePortletSummary[]): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  for (const portlet of portlets) {
    const candidates = [portlet.portletId, portlet.portletName].filter(isNonEmptyString);
    for (const candidate of candidates) {
      evidence.push({
        resourceType: 'portlet',
        key: candidate,
        kind: 'portlet',
        detail: `column=${portlet.columnId} position=${portlet.position} portletId=${portlet.portletId}`,
        source: 'portletLayout',
      });
    }

    appendAdtEvidenceFromConfiguration(
      evidence,
      portlet.configuration,
      `column=${portlet.columnId} position=${portlet.position} portletId=${portlet.portletId}`,
      'portletLayout',
    );
  }

  return evidence;
}

function buildJournalArticleEvidence(
  articles: JournalArticleSummary[],
  structures: ContentStructureSummary[],
): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  for (const article of articles) {
    const where = `articleId=${article.articleId} title=${article.title}`;
    if (article.articleId) {
      evidence.push({
        resourceType: 'journalArticle',
        key: article.articleId,
        kind: 'journalArticle',
        detail: where,
        source: 'journalArticle',
      });
    }

    if (article.ddmStructureKey) {
      evidence.push({
        resourceType: 'structure',
        key: article.ddmStructureKey,
        kind: 'journalArticleStructure',
        detail: buildJournalArticleStructureDetail(article, where, structures),
        source: 'journalArticle',
      });
    }

    const templateCandidates = [
      article.ddmTemplateKey,
      article.widgetDefaultTemplate,
      article.widgetHeadlessDefaultTemplate,
      ...(article.displayPageDdmTemplates ?? []),
    ].filter(isNonEmptyString);
    for (const templateKey of templateCandidates) {
      evidence.push({
        resourceType: 'template',
        key: templateKey,
        kind: 'journalArticleTemplate',
        detail: where,
        source: 'journalArticle',
      });
    }
  }

  return evidence;
}

function buildJournalArticleStructureDetail(
  article: JournalArticleSummary,
  where: string,
  structures: ContentStructureSummary[],
): string {
  const structure = structures.find(
    (candidate) =>
      (article.contentStructureId && candidate.contentStructureId === article.contentStructureId) ||
      (article.ddmStructureKey && candidate.key === article.ddmStructureKey) ||
      (article.ddmStructureKey && candidate.name === article.ddmStructureKey),
  );

  return [
    where,
    article.contentStructureId ? `contentStructureId=${article.contentStructureId}` : null,
    structure?.name ? `contentStructureName=${structure.name}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(' ');
}

function buildContentStructureEvidence(structures: ContentStructureSummary[]): PageEvidence[] {
  const evidence: PageEvidence[] = [];

  for (const structure of structures) {
    const candidates = [structure.key, String(structure.contentStructureId)].filter(isNonEmptyString);
    for (const key of candidates) {
      evidence.push({
        resourceType: 'structure',
        key,
        kind: 'contentStructure',
        detail: `contentStructureId=${structure.contentStructureId} name=${structure.name}`,
        source: 'contentStructure',
      });
    }
  }

  return evidence;
}

function buildFragmentDetail(fragmentKey: string, elementName: string | undefined, index: number): string {
  return [`fragmentKey=${fragmentKey}`, elementName ? `elementName=${elementName}` : null, `index=${index}`]
    .filter((value): value is string => value !== null)
    .join(' ');
}

function buildWidgetDetail(
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

function appendAdtEvidenceFromConfiguration(
  evidence: PageEvidence[],
  configuration: Record<string, string> | undefined,
  detail: string,
  source: PageEvidence['source'],
): void {
  const displayStyle = configuration?.displayStyle.trim();
  if (!displayStyle || !displayStyle.startsWith('ddmTemplate_')) {
    return;
  }

  evidence.push({
    resourceType: 'adt',
    key: displayStyle,
    kind: 'widgetAdt',
    detail: `${detail} displayStyle=${displayStyle}`,
    source,
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
