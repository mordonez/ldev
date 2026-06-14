import path from 'node:path';

import fs from 'fs-extra';

import type {ProjectType} from '../../core/config/project-type.js';
import type {AiAssets} from './ai-manifest.js';

export type WorkspaceRuleInstallResult = {
  installedRules: string[];
  touchedTargets: string[];
  manifestRules: never[];
};

const LEGACY_RETIRED_RULE_IDS = ['ldev-agent-workflow'];

export function installManagedAiRules(
  _targetDir: string,
  _assets: AiAssets,
  _projectType: ProjectType,
): Promise<WorkspaceRuleInstallResult> {
  return Promise.resolve({installedRules: [], touchedTargets: [], manifestRules: []});
}

export async function cleanupRetiredManagedAiRules(
  targetDir: string,
  installedRules: string[],
  _previousManifest: null,
): Promise<void> {
  const activeRuleIds = new Set(installedRules);

  for (const legacyRuleId of LEGACY_RETIRED_RULE_IDS) {
    if (!activeRuleIds.has(legacyRuleId)) {
      for (const target of workspaceRuleTargets(targetDir, legacyRuleId)) {
        await fs.remove(target.path);
      }
    }
  }
}

export function buildRulesManifest(_options: {
  now: Date;
  packageVersion: string;
  targetDir: string;
  projectType: ProjectType;
  officialWorkspaceFilesDetected: string[];
  rules: never[];
}): null {
  return null;
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

function workspaceRuleTargets(targetDir: string, baseName: string): Array<{path: string; label: string}> {
  return [
    {
      path: path.join(targetDir, '.workspace-rules', `${baseName}.md`),
      label: '.workspace-rules',
    },
    {
      path: path.join(targetDir, '.claude', 'rules', `${baseName}.md`),
      label: '.claude/rules',
    },
    {
      path: path.join(targetDir, '.cursor', 'rules', `${baseName}.mdc`),
      label: '.cursor/rules',
    },
    {
      path: path.join(targetDir, '.gemini', `${baseName}.md`),
      label: '.gemini',
    },
    {
      path: path.join(targetDir, '.github', 'instructions', `${baseName}.instructions.md`),
      label: '.github/instructions',
    },
    {
      path: path.join(targetDir, '.windsurf', 'rules', `${baseName}.md`),
      label: '.windsurf/rules',
    },
  ];
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
