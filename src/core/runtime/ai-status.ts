export type AiRuleStatus = 'current' | 'modified' | 'stale-package' | 'stale-runtime' | 'missing';

export type AiRuleStatusEntry = {
  id: string;
  namespace: string;
  layer: string;
  status: AiRuleStatus;
  verifiedAgainst: string[];
  lastVerifiedAt: string;
  targetFiles: string[];
  detectedRuntime: string | null;
};

export type AiStatusReport = {
  ok: true;
  projectType: string;
  manifestPresent: boolean;
  packageVersion: string | null;
  summary: {
    managedRules: number;
    current: number;
    modified: number;
    stalePackage: number;
    staleRuntime: number;
    missing: number;
  };
  officialWorkspaceFilesDetected: string[];
  coexistenceNotes: string[];
  rules: AiRuleStatusEntry[];
  warnings: string[];
};

export function runAiStatus(_targetDir: string): Promise<AiStatusReport> {
  return Promise.resolve({
    ok: true,
    projectType: 'unknown',
    manifestPresent: false,
    packageVersion: null,
    summary: {managedRules: 0, current: 0, modified: 0, stalePackage: 0, staleRuntime: 0, missing: 0},
    officialWorkspaceFilesDetected: [],
    coexistenceNotes: [],
    rules: [],
    warnings: [],
  });
}

export function formatAiStatus(report: AiStatusReport): string {
  const lines = [
    `AI rules manifest: ${report.manifestPresent ? 'present' : 'missing'}`,
    `Project type: ${report.projectType}`,
    `Managed rules: ${report.summary.managedRules}`,
    `Current=${report.summary.current} Modified=${report.summary.modified} StalePackage=${report.summary.stalePackage} StaleRuntime=${report.summary.staleRuntime} Missing=${report.summary.missing}`,
  ];

  if (report.warnings.length > 0) {
    lines.push('', 'Warnings', ...report.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}
