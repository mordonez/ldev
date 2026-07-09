import type {VerifyPageReport, VerifyStepStatus} from './verify-page-types.js';

export function formatVerifyPage(report: VerifyPageReport): string {
  const lines = [`${report.ok ? '[PASS]' : '[FAIL]'} ldev verify page ${report.url}`, ''];

  lines.push(`${formatStatus(report.login.status)} login       ${report.login.detail}`);
  lines.push(`${formatStatus(report.navigation.status)} navigation  ${report.navigation.detail}`);
  lines.push(
    `${formatStatus(report.consoleErrors.status)} console     ${
      report.consoleErrors.errors.length === 0
        ? 'No console errors.'
        : `${report.consoleErrors.errors.length} console error(s): ${report.consoleErrors.errors.join(' | ')}`
    }`,
  );
  lines.push(`${formatStatus(report.screenshot.status)} screenshot  ${report.screenshot.detail}`);
  lines.push(`${formatStatus(report.domSanity.status)} dom sanity  ${summarizeDomSanity(report)}`);
  lines.push(`${formatStatus(report.resourceCatalog.status)} catalog     ${report.resourceCatalog.detail}`);

  if (report.domSanity.checks.length > 0) {
    lines.push('', 'DOM checks:');
    for (const check of report.domSanity.checks) {
      lines.push(`  ${formatStatus(check.status)} ${check.id}: ${check.detail}`);
    }
  }

  if (report.resourceCatalog.diffs.length > 0) {
    lines.push('', 'Resource catalog diffs:');
    for (const diff of report.resourceCatalog.diffs) {
      lines.push(`  [MISSING] ${diff.resourceType} "${diff.key}": ${diff.detail}`);
    }
  }

  return lines.join('\n');
}

function summarizeDomSanity(report: VerifyPageReport): string {
  const failed = report.domSanity.checks.filter((check) => check.status === 'fail');
  if (report.domSanity.status === 'skipped') {
    return 'Skipped (navigation did not succeed).';
  }
  return failed.length === 0
    ? `All ${report.domSanity.checks.length} DOM sanity checks passed.`
    : `${failed.length}/${report.domSanity.checks.length} DOM sanity checks failed.`;
}

function formatStatus(status: VerifyStepStatus): string {
  switch (status) {
    case 'pass':
      return '[PASS]';
    case 'fail':
      return '[FAIL]';
    case 'skipped':
      return '[SKIP]';
  }
}
