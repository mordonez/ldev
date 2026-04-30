import {extractPageEvidence, type PageEvidence, type PageEvidenceKind} from './liferay-inventory-page-evidence.js';
import type {LiferayInventoryPageResult} from './liferay-inventory-page.js';
import {normalizeWhereUsedEvidence} from './liferay-inventory-where-used-normalize.js';

export type WhereUsedResourceType = 'fragment' | 'widget' | 'portlet' | 'structure' | 'template' | 'adt';

export type WhereUsedQuery = {
  type: WhereUsedResourceType;
  keys: string[];
};

export type WhereUsedMatchKind = Exclude<PageEvidenceKind, 'journalArticle'>;

export type WhereUsedMatch = {
  resourceType: WhereUsedResourceType;
  matchedKey: string;
  matchKind: WhereUsedMatchKind;
  label: string;
  detail: string;
  source: PageEvidence['source'];
};

export function matchEvidenceAgainstResource(evidence: PageEvidence[], query: WhereUsedQuery): WhereUsedMatch[] {
  const keys = new Set(query.keys);
  const seen = new Set<string>();
  const matchedEvidence = normalizeWhereUsedEvidence(
    evidence
      .filter((item) => isEvidenceForResourceType(item, query.type))
      .filter((item) => item.kind !== 'journalArticle')
      .filter((item) => keys.has(item.key)),
    query.type,
  );

  return matchedEvidence.flatMap((item) => {
    const match: WhereUsedMatch = {
      resourceType: query.type,
      matchedKey: item.key,
      matchKind: item.kind as WhereUsedMatchKind,
      label: labelForMatchKind(item.kind as WhereUsedMatchKind),
      detail: item.detail,
      source: item.source,
    };
    const identity = `${match.resourceType}\u0000${match.matchedKey}\u0000${match.matchKind}\u0000${match.detail}\u0000${match.source}`;
    if (seen.has(identity)) {
      return [];
    }
    seen.add(identity);
    return [match];
  });
}

export function matchPageAgainstResource(page: LiferayInventoryPageResult, query: WhereUsedQuery): WhereUsedMatch[] {
  return matchEvidenceAgainstResource(extractPageEvidence(page), query);
}

function isEvidenceForResourceType(evidence: PageEvidence, type: WhereUsedResourceType): boolean {
  if (type === 'widget' || type === 'portlet') {
    return evidence.resourceType === 'widget' || evidence.resourceType === 'portlet';
  }
  return evidence.resourceType === type;
}

function labelForMatchKind(kind: WhereUsedMatchKind): string {
  switch (kind) {
    case 'fragmentEntry':
      return 'Fragment on page';
    case 'widgetEntry':
      return 'Widget on page';
    case 'widgetAdt':
      return 'Widget ADT';
    case 'portlet':
      return 'Portlet on layout';
    case 'journalArticleStructure':
      return 'Journal article structure';
    case 'journalArticleTemplate':
      return 'Journal article template';
    case 'fragmentMappedStructure':
      return 'Fragment mapped structure';
    case 'fragmentMappedTemplate':
      return 'Fragment mapped template';
    case 'contentStructure':
      return 'Content structure';
    case 'displayPageArticle':
      return 'Display page article';
  }
}
