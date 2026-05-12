import type {WhereUsedPlanResult, WhereUsedResult, WhereUsedRunResult} from './liferay-inventory-where-used.js';

export function formatLiferayInventoryWhereUsed(result: WhereUsedRunResult): string {
  if (result.inventoryType === 'whereUsedPlan') {
    return formatWhereUsedPlan(result);
  }

  const siteOrder = result.scope.siteOrder;
  const siteLimit = result.scope.siteLimit ?? 'all';
  const excludedSites = result.scope.excludedSites;
  const skippedSites = result.skippedSites ?? [];

  const lines: string[] = [
    'WHERE USED',
    `resourceType=${result.query.type}`,
    `resourceKeys=${result.query.keys.join(',')}`,
    `sites=${result.summary.totalSites}`,
    `scannedPages=${result.summary.totalScannedPages}`,
    `matchedPages=${result.summary.totalMatchedPages}`,
    `totalMatches=${result.summary.totalMatches}`,
    `failedPages=${result.summary.totalFailedPages}`,
    `includePrivate=${result.scope.includePrivate}`,
    `concurrency=${result.scope.concurrency}`,
    `siteOrder=${siteOrder}`,
    `siteLimit=${siteLimit}`,
    `excludedSites=${excludedSites.join(',') || '-'}`,
    `skippedSites=${skippedSites.length}`,
  ];

  if (result.summary.totalMatchedPages === 0) {
    lines.push('');
    lines.push('No pages matched the requested resource.');
    return lines.join('\n');
  }

  for (const site of result.sites) {
    if (site.matchedPages.length === 0 && site.failedPages === 0) continue;
    lines.push('');
    lines.push(
      `site=${site.siteFriendlyUrl} name=${site.siteName} groupId=${site.groupId} scanned=${site.scannedPages} matched=${site.matchedPages.length}`,
    );
    for (const page of site.matchedPages) {
      const pageUrl = page.viewUrl ?? page.fullUrl;
      lines.push(
        `  - [${page.pageType}] ${page.pageName} ${pageUrl}${page.privateLayout ? ' (private)' : ''}${page.hidden ? ' (hidden)' : ''}`,
      );
      for (const match of page.matches) {
        lines.push(`      * ${match.label}: ${match.detail}${formatWhereUsedSourceSuffix(match.source)}`);
      }
      if (page.editUrl) {
        lines.push(`      editUrl=${page.editUrl}`);
      }
    }
    if (site.failedPages > 0) {
      lines.push(`  ! ${site.failedPages} page(s) failed to load`);
    }
  }

  if (skippedSites.length > 0) {
    lines.push('');
    lines.push(`Skipped ranking sites: ${skippedSites.length}`);
    for (const site of skippedSites.slice(0, 5)) {
      lines.push(`  - site=${site.siteFriendlyUrl} groupId=${site.groupId} reason=${site.reason}`);
    }
  }

  return lines.join('\n');
}

function formatWhereUsedPlan(result: WhereUsedPlanResult): string {
  const lines: string[] = [
    'WHERE USED PLAN',
    `resourceType=${result.query.type}`,
    `resourceKeys=${result.query.keys.join(',')}`,
    `totalSites=${result.summary.totalSites}`,
    `selectedSites=${result.summary.selectedSites}`,
    `excludedSites=${result.summary.excludedSites}`,
    `skippedSites=${result.summary.skippedSites}`,
    `includePrivate=${result.scope.includePrivate}`,
    `concurrency=${result.scope.concurrency}`,
    `siteOrder=${result.scope.siteOrder}`,
    `siteLimit=${result.scope.siteLimit ?? 'all'}`,
  ];

  for (const site of result.sites) {
    lines.push(
      `${site.rank}. site=${site.siteFriendlyUrl} name=${site.siteName} groupId=${site.groupId}` +
        `${site.structuredContents !== undefined ? ` structuredContents=${site.structuredContents}` : ''}` +
        ` selectionReason=${site.selectionReason}`,
    );
  }

  if (result.skippedSites && result.skippedSites.length > 0) {
    lines.push('');
    lines.push(`Skipped sites: ${result.skippedSites.length}`);
    for (const site of result.skippedSites.slice(0, 5)) {
      lines.push(`  - site=${site.siteFriendlyUrl} groupId=${site.groupId} reason=${site.reason}`);
    }
  }

  return lines.join('\n');
}

function formatWhereUsedSourceSuffix(
  source: WhereUsedResult['sites'][number]['matchedPages'][number]['matches'][number]['source'],
): string {
  return source === 'renderedHtmlJournalContent' ? ' [source=static Journal Content rendered in HTML]' : '';
}
