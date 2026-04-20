import path from 'node:path';

import fs from 'fs-extra';

import type {Printer} from '../../core/output/printer.js';
import {detectProjectType, type ProjectType} from '../../core/config/project-type.js';
import {
  detectOfficialWorkspaceFiles,
  listVendorSkills,
  readRulesManifest,
  readManifestSkills,
  rulesManifestPath,
  resolveAiAssets,
  writeRulesManifest,
  writeVendorManifest,
  type AiAssets,
} from './ai-manifest.js';
import {copyAiTemplatePath, ensureLocalAiGitignoreEntries} from './ai-install-fs.js';
import {
  buildRulesManifest,
  cleanupRetiredManagedAiRules,
  installManagedAiRules,
  syncProjectWorkspaceRules,
} from './ai-install-rules.js';
import {
  buildNextSteps,
  buildProjectOverlayWarnings,
  buildWorkspaceCoexistenceWarnings,
  collectExistingProjectSkills,
  collectLocalSkills,
  installAgentsFile,
  installClaudeSkillCommands,
  installProjectAgents,
  installProjectFile,
  installProjectOwnedSkills,
  resolveSelectedSkills,
  uniqueSorted,
} from './ai-install-project.js';

export type AiCommandResult = {
  mode: 'install' | 'update';
  targetDir: string;
  projectType: ProjectType;
  local: boolean;
  skillsOnly: boolean;
  vendorSkills: string[];
  updatedSkills: string[];
  preservedLocalSkills: string[];
  manifestPath: string;
  agents: 'installed' | 'overwritten' | 'kept' | 'skipped';
  claudeInstalled: boolean;
  projectContextInstalled: boolean;
  projectContextSampleInstalled: boolean;
  copilotInstalled: boolean;
  geminiInstalled: boolean;
  cursorrulesInstalled: boolean;
  projectSkillsInstalled: string[];
  projectAgentsInstalled: string[];
  workspaceRulesInstalled: string[];
  workspaceToolTargetsUpdated: string[];
  rulesManifestPath: string;
  officialWorkspaceFilesDetected: string[];
  selectedSkills: string[];
  warnings: string[];
  nextSteps: string[];
  gitignoreEntriesAdded: string[];
  claudeSkillCommandsInstalled: string[];
  projectWorkspaceRulesSynced: string[];
};

type AiDependencies = {
  assets?: AiAssets;
  now?: Date;
};

export async function runAiInstall(
  options: {
    targetDir: string;
    force: boolean;
    local?: boolean;
    skillsOnly: boolean;
    project?: boolean;
    projectContext?: boolean;
    selectedSkills?: string[];
    printer: Printer;
  },
  dependencies?: AiDependencies,
): Promise<AiCommandResult> {
  return applyAiInstall({
    mode: options.skillsOnly ? 'update' : 'install',
    targetDir: path.resolve(options.targetDir),
    projectType: detectProjectType(path.resolve(options.targetDir)),
    force: options.force,
    local: Boolean(options.local),
    skillsOnly: options.skillsOnly,
    project: Boolean(options.project),
    projectContext: Boolean(options.projectContext),
    selectedSkills: uniqueSorted(options.selectedSkills ?? []),
    printer: options.printer,
    assets: dependencies?.assets ?? resolveAiAssets(),
    now: dependencies?.now ?? new Date(),
  });
}

export function formatAiResult(result: AiCommandResult): string {
  const lines = [`Installation completed in: ${result.targetDir}`, ''];
  lines.push(`Project type: ${result.projectType}`);
  if (result.selectedSkills.length > 0) {
    lines.push(`Selected skills: ${result.selectedSkills.join(', ')}`);
  }
  if (result.local) {
    lines.push('Git ignore mode: local');
  }

  if (result.skillsOnly) {
    lines.push(`Updated vendor skills: ${result.updatedSkills.length}`);
    if (result.preservedLocalSkills.length > 0) {
      lines.push(`Preserved local skills: ${result.preservedLocalSkills.length}`);
    }
  } else {
    lines.push(`Installed skills: ${result.updatedSkills.length}`);
    lines.push(`AGENTS.md: ${result.agents}`);
    if (result.claudeInstalled) lines.push('CLAUDE.md: applied');
    if (result.projectContextInstalled) lines.push('docs/ai/project-context.md: applied');
    if (result.projectContextSampleInstalled) lines.push('docs/ai/project-context.md.sample: applied');
    if (result.copilotInstalled) lines.push('.github/copilot-instructions.md: applied');
    if (result.geminiInstalled) lines.push('.gemini/GEMINI.md: applied');
    if (result.cursorrulesInstalled) lines.push('.cursorrules: applied');
    if (result.gitignoreEntriesAdded.length > 0) {
      lines.push(`AI/tooling paths added to .gitignore: ${result.gitignoreEntriesAdded.length}`);
    }
  }
  if (result.workspaceRulesInstalled.length > 0) {
    lines.push(`Installed AI rules: ${result.workspaceRulesInstalled.join(', ')}`);
  }
  if (result.workspaceToolTargetsUpdated.length > 0) {
    lines.push(`Updated tool targets: ${result.workspaceToolTargetsUpdated.join(', ')}`);
  }

  if (result.projectSkillsInstalled.length > 0) {
    lines.push(
      `Installed project skills: ${result.projectSkillsInstalled.length} (${result.projectSkillsInstalled.join(', ')})`,
    );
  }
  if (result.projectAgentsInstalled.length > 0) {
    lines.push(
      `Installed project agents: ${result.projectAgentsInstalled.length} (${result.projectAgentsInstalled.join(', ')})`,
    );
  }
  if (result.claudeSkillCommandsInstalled.length > 0) {
    lines.push(`Claude skills linked: ${result.claudeSkillCommandsInstalled.length} (.claude/skills/)`);
  }
  if (result.projectWorkspaceRulesSynced.length > 0) {
    lines.push(`Project workspace rules synced: ${result.projectWorkspaceRulesSynced.join(', ')}`);
  }

  if (result.nextSteps.length > 0) {
    lines.push('');
    lines.push('Next steps:');
    result.nextSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    result.warnings.forEach((warning) => {
      lines.push(`  - ${warning}`);
    });
  }

  return lines.join('\n');
}

async function applyAiInstall(options: {
  mode: 'install' | 'update';
  targetDir: string;
  projectType: ProjectType;
  force: boolean;
  local: boolean;
  skillsOnly: boolean;
  project: boolean;
  projectContext: boolean;
  selectedSkills: string[];
  printer: Printer;
  assets: AiAssets;
  now: Date;
}): Promise<AiCommandResult> {
  const skillsDestinationDir = path.join(options.targetDir, '.agents', 'skills');
  const manifestPath = path.join(options.targetDir, '.agents', '.vendor-skills');
  const aiRulesManifestPath = rulesManifestPath(options.targetDir);

  await fs.ensureDir(skillsDestinationDir);

  const vendorSkills = await listVendorSkills(options.assets);
  const selectedSkills = resolveSelectedSkills(vendorSkills, options.selectedSkills);
  const managedVendorSkills = selectedSkills.length > 0 ? selectedSkills : vendorSkills;
  const manifestSkills = await readManifestSkills(manifestPath);
  const retiredVendorSkills =
    manifestSkills.length > 0 ? manifestSkills.filter((skillName) => !managedVendorSkills.includes(skillName)) : [];
  const skillsToUpdate = managedVendorSkills;

  for (const skillName of skillsToUpdate) {
    await copyAiTemplatePath(
      path.join(options.assets.skillsSourceDir, skillName),
      path.join(skillsDestinationDir, skillName),
      {
        overwrite: true,
      },
    );
  }

  for (const skillName of retiredVendorSkills) {
    await fs.remove(path.join(skillsDestinationDir, skillName));
  }

  const previousRulesManifest = await readRulesManifest(aiRulesManifestPath);
  const workspaceRuleResult = await installManagedAiRules(options.targetDir, options.assets, options.projectType);
  await cleanupRetiredManagedAiRules(options.targetDir, workspaceRuleResult.installedRules, previousRulesManifest);

  const officialWorkspaceFilesDetected =
    options.projectType === 'blade-workspace' ? await detectOfficialWorkspaceFiles(options.targetDir) : [];

  const preservedLocalSkills = options.skillsOnly
    ? (await collectLocalSkills(skillsDestinationDir)).filter((skillName) => !manifestSkills.includes(skillName))
    : [];

  await writeVendorManifest(manifestPath, managedVendorSkills, options.now);

  await writeRulesManifest(
    aiRulesManifestPath,
    buildRulesManifest({
      now: options.now,
      packageVersion: options.assets.packageVersion,
      targetDir: options.targetDir,
      projectType: options.projectType,
      officialWorkspaceFilesDetected,
      rules: workspaceRuleResult.manifestRules,
    }),
  );

  let projectSkillsInstalled: string[] = [];
  let projectAgentsInstalled: string[] = [];
  const warnings: string[] = [];
  if (options.project) {
    projectSkillsInstalled = await installProjectOwnedSkills(options.targetDir, options.assets, options.projectType);
    projectAgentsInstalled = await installProjectAgents(options.targetDir, options.assets, options.projectType);
    warnings.push(
      ...buildProjectOverlayWarnings({
        projectType: options.projectType,
        projectSkillsInstalled,
        projectAgentsInstalled,
      }),
    );
  }

  warnings.push(...buildWorkspaceCoexistenceWarnings(options.projectType, officialWorkspaceFilesDetected));

  const existingProjectSkills = await collectExistingProjectSkills(skillsDestinationDir);
  const allProjectSkillsForAgentsMd = [...new Set([...projectSkillsInstalled, ...existingProjectSkills])].sort();

  const agents = !options.skillsOnly
    ? await installAgentsFile(options.targetDir, options.assets, options.force, {
        projectType: options.projectType,
        projectSkillsInstalled: allProjectSkillsForAgentsMd,
      })
    : 'skipped';

  const overwriteProjectFiles = options.force;
  const overwriteProjectContextFiles = options.force && options.projectContext;

  const claudeInstalled = !options.skillsOnly
    ? options.projectType === 'blade-workspace'
      ? false
      : await installProjectFile(options.targetDir, options.assets, 'CLAUDE.md', {
          overwrite: overwriteProjectFiles,
        })
    : false;

  const installProjectContext = !options.skillsOnly && (options.project || options.projectContext);

  const projectContextInstalled = installProjectContext
    ? await installProjectFile(options.targetDir, options.assets, path.join('docs', 'ai', 'project-context.md'), {
        overwrite: overwriteProjectContextFiles,
      })
    : false;

  const projectContextSampleInstalled = installProjectContext
    ? await installProjectFile(
        options.targetDir,
        options.assets,
        path.join('docs', 'ai', 'project-context.md.sample'),
        {
          overwrite: overwriteProjectContextFiles,
        },
      )
    : false;

  const copilotInstalled = !options.skillsOnly
    ? options.projectType === 'blade-workspace'
      ? false
      : await installProjectFile(options.targetDir, options.assets, path.join('.github', 'copilot-instructions.md'), {
          overwrite: overwriteProjectFiles,
        })
    : false;

  const geminiInstalled = !options.skillsOnly
    ? await installProjectFile(options.targetDir, options.assets, path.join('.gemini', 'GEMINI.md'), {
        overwrite: overwriteProjectFiles,
      })
    : false;

  const cursorrulesInstalled = !options.skillsOnly
    ? await installProjectFile(options.targetDir, options.assets, '.cursorrules', {
        overwrite: overwriteProjectFiles,
      })
    : false;

  const gitignoreEntriesAdded =
    !options.skillsOnly && options.local ? await ensureLocalAiGitignoreEntries(options.targetDir) : [];

  const allCommandSkills = [...new Set([...managedVendorSkills, ...allProjectSkillsForAgentsMd])];
  const claudeSkillCommandsInstalled = await installClaudeSkillCommands(
    options.targetDir,
    allCommandSkills,
    retiredVendorSkills,
  );

  const projectWorkspaceRulesSynced = await syncProjectWorkspaceRules(options.targetDir);

  return {
    mode: options.mode,
    targetDir: options.targetDir,
    projectType: options.projectType,
    local: options.local,
    skillsOnly: options.skillsOnly,
    vendorSkills: managedVendorSkills,
    updatedSkills: skillsToUpdate,
    preservedLocalSkills,
    manifestPath,
    agents,
    claudeInstalled,
    projectContextInstalled,
    projectContextSampleInstalled,
    copilotInstalled,
    geminiInstalled,
    cursorrulesInstalled,
    projectSkillsInstalled,
    projectAgentsInstalled,
    workspaceRulesInstalled: workspaceRuleResult.installedRules,
    workspaceToolTargetsUpdated: workspaceRuleResult.touchedTargets,
    rulesManifestPath: aiRulesManifestPath,
    officialWorkspaceFilesDetected,
    selectedSkills,
    warnings,
    nextSteps: buildNextSteps(
      options.targetDir,
      options.projectType,
      options.local,
      options.skillsOnly,
      options.project,
      installProjectContext,
      selectedSkills,
    ),
    gitignoreEntriesAdded,
    claudeSkillCommandsInstalled,
    projectWorkspaceRulesSynced,
  };
}
