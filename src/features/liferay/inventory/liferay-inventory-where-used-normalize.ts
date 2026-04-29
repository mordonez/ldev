import type {PageEvidence} from './liferay-inventory-page-evidence.js';

export function normalizeWhereUsedEvidence(
  evidence: PageEvidence[],
  queryType: 'fragment' | 'widget' | 'portlet' | 'structure' | 'template' | 'adt',
): PageEvidence[] {
  if (queryType !== 'structure') {
    return evidence;
  }

  return evidence.filter((item) => !isRedundantStructureEvidence(item, evidence));
}

function isRedundantStructureEvidence(evidence: PageEvidence, matchedEvidence: PageEvidence[]): boolean {
  if (evidence.kind !== 'contentStructure') {
    return false;
  }

  const evidenceStructureId = evidence.context?.contentStructureId ?? parseNumericKey(evidence.key);

  return matchedEvidence.some(
    (candidate) =>
      candidate.kind === 'journalArticleStructure' &&
      (candidate.key === evidence.key ||
        (evidenceStructureId !== undefined && candidate.context?.contentStructureId === evidenceStructureId)),
  );
}

function parseNumericKey(key: string): number | undefined {
  const value = Number(key);
  return Number.isFinite(value) ? value : undefined;
}
