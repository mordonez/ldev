import type {ResourcePlanResult} from './liferay-resource-plan-types.js';

export function formatLiferayResourcePlan(result: ResourcePlanResult): string {
  const lines: string[] = [];

  lines.push(`plan resource=${result.input.resource} type=${result.resolved.type} key=${result.resolved.key}`);
  lines.push('');
  lines.push('Owner:');
  lines.push(
    `  site=${result.owner.siteFriendlyUrl} groupId=${result.owner.groupId} id=${result.owner.id} ` +
      `name=${result.owner.name} matchedBy=${result.resolved.matchedBy}` +
      (result.ownerAmbiguous ? ' (ambiguous: key exists in multiple sites)' : ''),
  );

  lines.push('');
  if (result.duplicates.duplicated) {
    lines.push(`Duplicates: ${result.duplicates.count} occurrences`);
    for (const occurrence of result.duplicates.occurrences) {
      lines.push(`  - site=${occurrence.siteFriendlyUrl} id=${occurrence.id} name=${occurrence.name}`);
    }
  } else {
    lines.push('Duplicates: none');
  }

  lines.push('');
  if (result.usage.scanned) {
    lines.push(
      `Usage: ${result.usage.totalMatchedPages} matched pages ` +
        `(scanned ${result.usage.totalScannedPages} pages across ${result.usage.scannedSites.length} sites, ` +
        `${result.usage.totalFailedPages} failed)`,
    );
    for (const page of result.usage.pages) {
      lines.push(
        `  - site=${page.siteFriendlyUrl} url=${page.fullUrl} name=${page.pageName} matches=${page.matchCount}` +
          (page.privateLayout ? ' (private)' : ''),
      );
    }
  } else {
    lines.push(`Usage: not scanned - ${result.usage.reason}`);
    lines.push(`  Run manually: ${result.usage.suggestedCommand}`);
  }

  if (result.discovery.skipped.length > 0) {
    lines.push('');
    lines.push('Discovery warnings:');
    for (const skip of result.discovery.skipped) {
      lines.push(`  - site=${skip.siteFriendlyUrl} type=${skip.type} reason=${skip.reason}`);
    }
  }

  lines.push('');
  lines.push('Suggested import:');
  lines.push(`  ${result.suggestedImport.command}`);
  for (const note of result.suggestedImport.notes) {
    lines.push(`  note: ${note}`);
  }

  lines.push('');
  lines.push('Validation steps:');
  result.validation.steps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${step}`);
  });

  return lines.join('\n');
}
