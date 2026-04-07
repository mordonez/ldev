import path from 'node:path';

import fs from 'fs-extra';

import {resolveProjectContext} from '../../core/config/project-context.js';
import {
  computeContentHash,
  detectOfficialWorkspaceFiles,
  readRulesManifest,
  resolveAiAssets,
  rulesManifestPath,
  type AiRulesManifest,
} from './ai-manifest.js';

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

export async function runAiStatus(targetDir: string): Promise<AiStatusReport> {
  const resolvedTargetDir = path.resolve(targetDir);
  const project = resolveProjectContext({cwd: resolvedTargetDir});
  const manifestPath = rulesManifestPath(resolvedTargetDir);
  const manifest = await readRulesManifest(manifestPath);
  const officialWorkspaceFilesDetected =
    project.projectType === 'blade-workspace' ? await detectOfficialWorkspaceFiles(resolvedTargetDir) : [];
  const coexistenceNotes = buildCoexistenceNotes(project.projectType, officialWorkspaceFilesDetected);

  if (!manifest) {
    return {
      ok: true,
      projectType: project.projectType,
      manifestPresent: false,
      packageVersion: null,
      summary: {managedRules: 0, current: 0, modified: 0, stalePackage: 0, staleRuntime: 0, missing: 0},
      officialWorkspaceFilesDetected,
      coexistenceNotes,
      rules: [],
      warnings: [],
    };
  }

  const rules = await Promise.all(
    manifest.rules.map((rule) => evaluateRuleStatus(resolvedTargetDir, manifest, rule, project.workspace.product)),
  );

  const summary = {
    managedRules: rules.length,
    current: rules.filter((rule) => rule.status === 'current').length,
    modified: rules.filter((rule) => rule.status === 'modified').length,
    stalePackage: rules.filter((rule) => rule.status === 'stale-package').length,
    staleRuntime: rules.filter((rule) => rule.status === 'stale-runtime').length,
    missing: rules.filter((rule) => rule.status === 'missing').length,
  };

  const warnings: string[] = [];
  if (summary.modified > 0) {
    warnings.push(`${summary.modified} managed rules were modified locally.`);
  }
  if (summary.staleRuntime > 0) {
    warnings.push(`${summary.staleRuntime} managed rules were verified against a different Liferay product version.`);
  }
  if (summary.stalePackage > 0) {
    warnings.push(`${summary.stalePackage} managed rules differ from the current ldev package contents.`);
  }
  if (summary.missing > 0) {
    warnings.push(`${summary.missing} managed rules are missing one or more target files.`);
  }
  warnings.push(...coexistenceNotes);

  return {
    ok: true,
    projectType: project.projectType,
    manifestPresent: true,
    packageVersion: manifest.packageVersion,
    summary,
    officialWorkspaceFilesDetected,
    coexistenceNotes,
    rules,
    warnings,
  };
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

function buildCoexistenceNotes(projectType: string, officialWorkspaceFilesDetected: string[]): string[] {
  if (projectType !== 'blade-workspace' || officialWorkspaceFilesDetected.length === 0) {
    return [];
  }

  const notes = [
    'Official Liferay Workspace AI files were detected; ldev-managed rules should be treated as augmentation, not replacement.',
  ];

  if (officialWorkspaceFilesDetected.includes('.workspace-rules/liferay-rules.md')) {
    notes.push(
      'For MCP details, prefer ldev-managed verified runtime guidance when it conflicts with older Workspace template assumptions.',
    );
  }

  return notes;
}

async function evaluateRuleStatus(
  targetDir: string,
  manifest: AiRulesManifest,
  rule: AiRulesManifest['rules'][number],
  detectedRuntime: string | null,
): Promise<AiRuleStatusEntry> {
  const targetContents = await Promise.all(
    rule.targetFiles.map(async (targetFile) => {
      const absolutePath = path.join(targetDir, targetFile);
      if (!(await fs.pathExists(absolutePath))) {
        return null;
      }
      return fs.readFile(absolutePath, 'utf8');
    }),
  );

  const sourcePath = path.join(targetDir, rule.sourcePath);
  let currentPackageHash = rule.contentHash;
  if (await fs.pathExists(sourcePath)) {
    currentPackageHash = computeContentHash(await fs.readFile(sourcePath, 'utf8'));
  } else {
    const assets = resolveAiAssets();
    const packageSourcePath = path.join(assets.repoRoot, rule.sourcePath);
    if (await fs.pathExists(packageSourcePath)) {
      currentPackageHash = computeContentHash(await fs.readFile(packageSourcePath, 'utf8'));
    }
  }

  let status: AiRuleStatus = 'current';
  if (targetContents.some((content) => content === null)) {
    status = 'missing';
  } else if (targetContents.some((content) => computeContentHash(content ?? '') !== rule.contentHash)) {
    status = 'modified';
  } else if (currentPackageHash !== rule.contentHash) {
    status = 'stale-package';
  } else if (rule.verifiedAgainst.length > 0 && detectedRuntime && !rule.verifiedAgainst.includes(detectedRuntime)) {
    status = 'stale-runtime';
  }

  return {
    id: rule.id,
    namespace: rule.namespace,
    layer: rule.layer,
    status,
    verifiedAgainst: rule.verifiedAgainst,
    lastVerifiedAt: rule.lastVerifiedAt,
    targetFiles: rule.targetFiles,
    detectedRuntime,
  };
}
