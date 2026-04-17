import path from 'node:path';

import fs from 'fs-extra';

import type {ProjectType} from '../../core/config/project-type.js';
import {
  computeContentHash,
  detectManagedRuleNamespace,
  detectRuleLayer,
  type AiRulesManifest,
  type AiRulesManifestRule,
  type AiAssets,
} from './ai-manifest.js';
import {normalizeRelativePath, currentVerifiedProducts} from './ai-install-project.js';
import {writeTextFileLf} from './ai-install-fs.js';

export type WorkspaceRuleInstallResult = {
  installedRules: string[];
  touchedTargets: string[];
  manifestRules: AiRulesManifestRule[];
};

const LEGACY_RETIRED_RULE_IDS = ['ldev-agent-workflow'];

export async function installManagedAiRules(
  targetDir: string,
  assets: AiAssets,
  projectType: ProjectType,
): Promise<WorkspaceRuleInstallResult> {
  if (!(await fs.pathExists(assets.workspaceRulesSourceDir))) {
    return {installedRules: [], touchedTargets: [], manifestRules: []};
  }

  const entries = (await fs.readdir(assets.workspaceRulesSourceDir)).filter((entry) => entry.endsWith('.md')).sort();

  const touchedTargets = new Set<string>();
  const installedRules: string[] = [];
  const manifestRules: AiRulesManifestRule[] = [];

  for (const entry of entries) {
    const baseName = entry.replace(/\.md$/, '');
    const namespace = detectManagedRuleNamespace(baseName);

    if (!namespace) {
      continue;
    }

    if (namespace === 'ldev-workspace' && projectType !== 'blade-workspace') {
      continue;
    }
    if (namespace === 'ldev-native' && projectType !== 'ldev-native') {
      continue;
    }

    const source = path.join(assets.workspaceRulesSourceDir, entry);
    const content = await fs.readFile(source, 'utf8');
    const targets = workspaceRuleTargets(targetDir, baseName);
    const metadata = managedRuleMetadata(baseName);

    const workspaceRulesTarget = targets.find((t) => t.label === '.workspace-rules')!;
    await fs.ensureDir(path.dirname(workspaceRulesTarget.path));
    await writeTextFileLf(workspaceRulesTarget.path, content);
    touchedTargets.add('.workspace-rules');

    for (const target of targets.filter((t) => t.label !== '.workspace-rules')) {
      await fs.ensureDir(path.dirname(target.path));
      await ensureRuleSymlink(target.path, workspaceRulesTarget.path);
      touchedTargets.add(target.label);
    }

    installedRules.push(baseName);
    manifestRules.push({
      id: baseName,
      namespace,
      layer: detectRuleLayer(namespace),
      maintainer: 'ldev',
      sourceKind: metadata.sourceKind,
      sourcePath: normalizeRelativePath(path.relative(targetDir, source)),
      sourceReferences: metadata.sourceReferences,
      targetFiles: targets.map((target) => normalizeRelativePath(path.relative(targetDir, target.path))),
      contentHash: computeContentHash(content),
      verifiedAgainst: [],
      lastVerifiedAt: '',
      verificationStatus: 'verified',
      verificationNotes: metadata.verificationNotes,
      localModificationPolicy: 'replace-if-unmodified',
    });
  }

  return {
    installedRules,
    touchedTargets: [...touchedTargets].sort(),
    manifestRules,
  };
}

export async function cleanupRetiredManagedAiRules(
  targetDir: string,
  installedRules: string[],
  previousManifest: AiRulesManifest | null,
): Promise<void> {
  const activeRuleIds = new Set(installedRules);
  const retiredRuleIds = new Set<string>();

  for (const rule of previousManifest?.rules ?? []) {
    if (!activeRuleIds.has(rule.id)) {
      retiredRuleIds.add(rule.id);
    }
  }

  for (const legacyRuleId of LEGACY_RETIRED_RULE_IDS) {
    if (!activeRuleIds.has(legacyRuleId)) {
      retiredRuleIds.add(legacyRuleId);
    }
  }

  for (const retiredRuleId of retiredRuleIds) {
    for (const target of workspaceRuleTargets(targetDir, retiredRuleId)) {
      await fs.remove(target.path);
    }
  }
}

export function buildRulesManifest(options: {
  now: Date;
  packageVersion: string;
  targetDir: string;
  projectType: ProjectType;
  officialWorkspaceFilesDetected: string[];
  rules: AiRulesManifestRule[];
}): AiRulesManifest {
  return {
    version: 1,
    generatedAt: options.now.toISOString(),
    packageVersion: options.packageVersion,
    projectType: options.projectType,
    officialWorkspaceFilesDetected: options.officialWorkspaceFilesDetected,
    rules: options.rules.map((rule) => ({
      ...rule,
      lastVerifiedAt: options.now.toISOString().slice(0, 10),
      verifiedAgainst: currentVerifiedProducts(options.projectType, options.targetDir),
    })),
  };
}

export async function syncProjectWorkspaceRules(targetDir: string): Promise<string[]> {
  const workspaceRulesDir = path.join(targetDir, '.workspace-rules');
  if (!(await fs.pathExists(workspaceRulesDir))) {
    return [];
  }

  const entries = await fs.readdir(workspaceRulesDir);
  const projectRules = entries.filter((e) => e.startsWith('project-') && e.endsWith('.md'));
  const synced: string[] = [];

  for (const entry of projectRules) {
    const baseName = entry.replace(/\.md$/, '');
    const workspaceRulesFile = path.join(workspaceRulesDir, entry);
    const targets = workspaceRuleTargets(targetDir, baseName).filter((t) => t.label !== '.workspace-rules');

    for (const target of targets) {
      await fs.ensureDir(path.dirname(target.path));
      await ensureRuleSymlink(target.path, workspaceRulesFile);
    }

    synced.push(baseName);
  }

  return synced;
}

function workspaceRuleTargets(
  targetDir: string,
  baseName: string,
): Array<{path: string; label: string; transform: (content: string) => string}> {
  return [
    {
      path: path.join(targetDir, '.workspace-rules', `${baseName}.md`),
      label: '.workspace-rules',
      transform: identity,
    },
    {
      path: path.join(targetDir, '.claude', 'rules', `${baseName}.md`),
      label: '.claude/rules',
      transform: identity,
    },
    {
      path: path.join(targetDir, '.cursor', 'rules', `${baseName}.mdc`),
      label: '.cursor/rules',
      transform: identity,
    },
    {
      path: path.join(targetDir, '.gemini', `${baseName}.md`),
      label: '.gemini',
      transform: identity,
    },
    {
      path: path.join(targetDir, '.github', 'instructions', `${baseName}.instructions.md`),
      label: '.github/instructions',
      transform: identity,
    },
    {
      path: path.join(targetDir, '.windsurf', 'rules', `${baseName}.md`),
      label: '.windsurf/rules',
      transform: identity,
    },
  ];
}

function identity(content: string): string {
  return content;
}

function managedRuleMetadata(baseName: string): {
  sourceKind: AiRulesManifestRule['sourceKind'];
  sourceReferences?: string[];
  verificationNotes?: string;
} {
  switch (baseName) {
    case 'ldev-liferay-core':
      return {
        sourceKind: 'derived',
        sourceReferences: ['ai-workspace:.workspace-rules/liferay-rules.md'],
      };
    case 'ldev-liferay-client-extensions':
      return {
        sourceKind: 'derived',
        sourceReferences: [
          'ai-workspace:.workspace-rules/guided-client-extension.md',
          'ai-workspace:.claude/rules/cx.md',
        ],
      };
    case 'ldev-liferay-mcp':
      return {
        sourceKind: 'derived',
        sourceReferences: ['ai-workspace:.workspace-rules/liferay-rules.md', 'ldev:docs/liferay-mcp-audit.md'],
        verificationNotes: 'Uses the verified ldev MCP audit instead of the older Workspace template endpoint.',
      };
    case 'ldev-workspace-setup':
      return {
        sourceKind: 'derived',
        sourceReferences: [
          'ai-workspace:.workspace-rules/initial-setup-guide.md',
          'ai-workspace:.claude/rules/setup.md',
        ],
      };
    case 'ldev-workspace-runtime':
      return {
        sourceKind: 'derived',
        sourceReferences: ['ai-workspace:.workspace-rules/liferay-rules.md'],
      };
    case 'ldev-workspace-deploy':
      return {
        sourceKind: 'derived',
        sourceReferences: [
          'ai-workspace:.workspace-rules/guided-client-extension.md',
          'ai-workspace:.claude/rules/cx.md',
          'ai-workspace:.workspace-rules/liferay-rules.md',
        ],
      };
    case 'ldev-native-runtime':
    case 'ldev-native-deploy':
    case 'ldev-native-agent-workflow':
      return {
        sourceKind: 'custom',
      };
    case 'ldev-workspace-agent-workflow':
      return {
        sourceKind: 'derived',
        sourceReferences: ['ai-workspace:.workspace-rules/liferay-rules.md'],
      };
    default:
      return {
        sourceKind: 'custom',
      };
  }
}

async function ensureRuleSymlink(linkPath: string, workspaceRulesFile: string): Promise<void> {
  if (await fs.pathExists(linkPath)) {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      return;
    }
    await fs.remove(linkPath);
  }
  const symlinkTarget = path.relative(path.dirname(linkPath), workspaceRulesFile);
  try {
    await fs.symlink(symlinkTarget, linkPath);
  } catch {
    await fs.copy(workspaceRulesFile, linkPath, {overwrite: true});
  }
}
