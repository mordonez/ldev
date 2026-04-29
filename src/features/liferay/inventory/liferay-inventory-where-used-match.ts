import type {LiferayInventoryPageResult} from './liferay-inventory-page.js';

export type WhereUsedResourceType = 'fragment' | 'widget' | 'portlet' | 'structure' | 'template' | 'adt';

export type WhereUsedQuery = {
  type: WhereUsedResourceType;
  keys: string[];
};

export type WhereUsedMatchKind =
  | 'fragmentEntry'
  | 'widgetEntry'
  | 'portlet'
  | 'journalArticleStructure'
  | 'journalArticleTemplate'
  | 'journalArticleAdt'
  | 'contentStructure'
  | 'displayPageArticle';

export type WhereUsedMatch = {
  resourceType: WhereUsedResourceType;
  matchedKey: string;
  matchKind: WhereUsedMatchKind;
  detail: string;
};

export function matchPageAgainstResource(page: LiferayInventoryPageResult, query: WhereUsedQuery): WhereUsedMatch[] {
  if (page.pageType === 'siteRoot') {
    return [];
  }

  const matches: WhereUsedMatch[] = [];
  const keys = new Set(query.keys);

  if (page.pageType === 'regularPage') {
    matchRegularPage(page, query.type, keys, matches);
  } else {
    matchDisplayPage(page, query.type, keys, matches);
  }

  return matches;
}

function matchRegularPage(
  page: Extract<LiferayInventoryPageResult, {pageType: 'regularPage'}>,
  type: WhereUsedResourceType,
  keys: Set<string>,
  matches: WhereUsedMatch[],
): void {
  if (type === 'fragment') {
    const entries = page.fragmentEntryLinks ?? [];
    entries.forEach((entry, index) => {
      if (entry.type !== 'fragment' || !entry.fragmentKey) return;
      if (!keys.has(entry.fragmentKey)) return;
      matches.push({
        resourceType: 'fragment',
        matchedKey: entry.fragmentKey,
        matchKind: 'fragmentEntry',
        detail: buildFragmentDetail(entry.fragmentKey, entry.elementName, index),
      });
    });
    return;
  }

  if (type === 'widget' || type === 'portlet') {
    const entries = page.fragmentEntryLinks ?? [];
    entries.forEach((entry, index) => {
      if (entry.type !== 'widget') return;
      const candidates = [entry.widgetName, entry.portletId].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      const matched = candidates.find((value) => keys.has(value));
      if (!matched) return;
      matches.push({
        resourceType: type,
        matchedKey: matched,
        matchKind: 'widgetEntry',
        detail: buildWidgetDetail(entry.widgetName, entry.portletId, entry.elementName, index),
      });
    });

    const portlets = page.portlets ?? [];
    portlets.forEach((portlet) => {
      const candidates = [portlet.portletId, portlet.portletName].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      const matched = candidates.find((value) => keys.has(value));
      if (!matched) return;
      matches.push({
        resourceType: type,
        matchedKey: matched,
        matchKind: 'portlet',
        detail: `column=${portlet.columnId} position=${portlet.position} portletId=${portlet.portletId}`,
      });
    });
    return;
  }

  matchJournalArticles(page.journalArticles ?? [], type, keys, matches);
  matchContentStructures(page.contentStructures ?? [], type, keys, matches);
}

function matchDisplayPage(
  page: Extract<LiferayInventoryPageResult, {pageType: 'displayPage'}>,
  type: WhereUsedResourceType,
  keys: Set<string>,
  matches: WhereUsedMatch[],
): void {
  matchJournalArticles(page.journalArticles ?? [], type, keys, matches);
  matchContentStructures(page.contentStructures ?? [], type, keys, matches);

  if (type === 'structure') {
    const articleStructureKey = String(page.article.contentStructureId);
    if (articleStructureKey && keys.has(articleStructureKey)) {
      matches.push({
        resourceType: 'structure',
        matchedKey: articleStructureKey,
        matchKind: 'displayPageArticle',
        detail: `displayPage articleKey=${page.article.key} contentStructureId=${page.article.contentStructureId}`,
      });
    }
  }
}

function matchJournalArticles(
  articles: NonNullable<Extract<LiferayInventoryPageResult, {pageType: 'regularPage'}>['journalArticles']>,
  type: WhereUsedResourceType,
  keys: Set<string>,
  matches: WhereUsedMatch[],
): void {
  if (type !== 'structure' && type !== 'template' && type !== 'adt') {
    return;
  }

  for (const article of articles) {
    const where = `articleId=${article.articleId} title=${article.title}`;

    if (type === 'structure' && article.ddmStructureKey && keys.has(article.ddmStructureKey)) {
      matches.push({
        resourceType: 'structure',
        matchedKey: article.ddmStructureKey,
        matchKind: 'journalArticleStructure',
        detail: where,
      });
      continue;
    }

    if (type === 'template') {
      const templateCandidates = [
        article.ddmTemplateKey,
        article.widgetDefaultTemplate,
        article.widgetHeadlessDefaultTemplate,
      ].filter((value): value is string => typeof value === 'string' && value.length > 0);
      const matched = templateCandidates.find((value) => keys.has(value));
      if (matched) {
        matches.push({
          resourceType: 'template',
          matchedKey: matched,
          matchKind: 'journalArticleTemplate',
          detail: where,
        });
        continue;
      }

      const widgetCandidate = article.widgetTemplateCandidates?.find((candidate) => keys.has(candidate));
      if (widgetCandidate) {
        matches.push({
          resourceType: 'template',
          matchedKey: widgetCandidate,
          matchKind: 'journalArticleTemplate',
          detail: `${where} (widget candidate)`,
        });
      }
      continue;
    }

    const adtCandidates = [
      article.displayPageDefaultTemplate,
      ...(article.displayPageDdmTemplates ?? []),
      ...(article.displayPageTemplateCandidates ?? []),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    const matchedAdt = adtCandidates.find((value) => keys.has(value));
    if (matchedAdt) {
      matches.push({
        resourceType: 'adt',
        matchedKey: matchedAdt,
        matchKind: 'journalArticleAdt',
        detail: where,
      });
    }
  }
}

function matchContentStructures(
  structures: NonNullable<Extract<LiferayInventoryPageResult, {pageType: 'regularPage'}>['contentStructures']>,
  type: WhereUsedResourceType,
  keys: Set<string>,
  matches: WhereUsedMatch[],
): void {
  if (type !== 'structure') return;
  for (const structure of structures) {
    const candidates = [structure.key, String(structure.contentStructureId)].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    const matched = candidates.find((value) => keys.has(value));
    if (!matched) continue;
    matches.push({
      resourceType: 'structure',
      matchedKey: matched,
      matchKind: 'contentStructure',
      detail: `contentStructureId=${structure.contentStructureId} name=${structure.name}`,
    });
  }
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
