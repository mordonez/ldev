import type {WhereUsedResult} from './liferay-inventory-where-used.js';

export function formatLiferayInventoryWhereUsed(result: WhereUsedResult): string {
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
      lines.push(
        `  - [${page.pageType}] ${page.pageName} ${page.fullUrl}${page.privateLayout ? ' (private)' : ''}${page.hidden ? ' (hidden)' : ''}`,
      );
      for (const match of page.matches) {
        lines.push(`      * ${match.matchKind}: ${match.detail}`);
      }
      if (page.editUrl) {
        lines.push(`      editUrl=${page.editUrl}`);
      }
    }
    if (site.failedPages > 0) {
      lines.push(`  ! ${site.failedPages} page(s) failed to load`);
    }
  }

  return lines.join('\n');
}
