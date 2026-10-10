import type {ResourceLintFinding, ResourceLintResult, ResourceLintSeverity} from '../../../core/contracts/index.js';

/**
 * Shared helpers for the static resource linters (page definitions and fragments).
 * Pure and network-free: they only read local files handed to them by the runners.
 */

export function buildResourceLintResult(
  target: string,
  filesScanned: number,
  findings: ResourceLintFinding[],
): ResourceLintResult {
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;

  return {
    target,
    filesScanned,
    findings,
    summary: {errors, warnings},
    ok: errors === 0,
  };
}

export function createResourceLintFinding(
  file: string,
  rule: string,
  severity: ResourceLintSeverity,
  message: string,
  location?: string,
): ResourceLintFinding {
  return location === undefined ? {file, rule, severity, message} : {file, rule, severity, message, location};
}

export function formatLiferayResourceLintResult(result: ResourceLintResult): string {
  const lines: string[] = [];

  for (const finding of result.findings) {
    const where = finding.location === undefined ? finding.file : `${finding.file} (${finding.location})`;
    lines.push(`${finding.severity}: ${where}: ${finding.message} [${finding.rule}]`);
  }

  const status = result.ok ? 'OK' : 'FAILED';
  lines.push(
    `${status}: ${result.filesScanned} file(s) scanned, ` +
      `${result.summary.errors} error(s), ${result.summary.warnings} warning(s)`,
  );

  return lines.join('\n');
}

export function getLiferayResourceLintExitCode(result: ResourceLintResult): number {
  return result.ok ? 0 : 1;
}
