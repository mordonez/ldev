import path from 'node:path';

import fs from 'fs-extra';

import type {Printer} from '../../core/output/printer.js';
import {detectProjectType, type ProjectType} from '../../core/config/project-type.js';
import {
  computeContentHash,
  detectManagedRuleNamespace,
  detectOfficialWorkspaceFiles,
  detectRuleLayer,
  listVendorSkills,
  readRulesManifest,
  readManifestSkills,
  rulesManifestPath,
  resolveAiAssets,
  writeRulesManifest,
  writeVendorManifest,
  type AiRulesManifest,
  type AiRulesManifestRule,
  type AiAssets,
} from './ai-manifest.js';

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
    if (result.claudeInstalled) lines.push('CLAUDE.md: installed');
    if (result.projectContextInstalled) lines.push('docs/ai/project-context.md: installed');
    if (result.projectContextSampleInstalled) lines.push('docs/ai/project-context.md.sample: installed');
    if (result.copilotInstalled) lines.push('.github/copilot-instructions.md: installed');
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

  // For AGENTS.md rendering, include all project skills present in the target
  // (both newly installed and already-existing) so the section is accurate on
  // forced re-installs where skills already exist.
  const existingProjectSkills = await collectExistingProjectSkills(skillsDestinationDir);
  const allProjectSkillsForAgentsMd = [...new Set([...projectSkillsInstalled, ...existingProjectSkills])].sort();

  const agents = !options.skillsOnly
    ? await installAgentsFile(options.targetDir, options.assets, options.force, {
        projectType: options.projectType,
        projectSkillsInstalled: allProjectSkillsForAgentsMd,
      })
    : 'skipped';

  const claudeInstalled = !options.skillsOnly
    ? options.projectType === 'blade-workspace'
      ? false
      : await installProjectFile(options.targetDir, options.assets, 'CLAUDE.md')
    : false;

  const installProjectContext = !options.skillsOnly && (options.project || options.projectContext);

  const projectContextInstalled = installProjectContext
    ? await installProjectFile(options.targetDir, options.assets, path.join('docs', 'ai', 'project-context.md'))
    : false;

  const projectContextSampleInstalled = installProjectContext
    ? await installProjectFile(options.targetDir, options.assets, path.join('docs', 'ai', 'project-context.md.sample'))
    : false;

  const copilotInstalled = !options.skillsOnly
    ? options.projectType === 'blade-workspace'
      ? false
      : await installProjectFile(options.targetDir, options.assets, path.join('.github', 'copilot-instructions.md'))
    : false;

  const gitignoreEntriesAdded =
    !options.skillsOnly && options.local ? await ensureLocalAiGitignoreEntries(options.targetDir) : [];

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
  };
}

type WorkspaceRuleInstallResult = {
  installedRules: string[];
  touchedTargets: string[];
  manifestRules: AiRulesManifestRule[];
};

const LEGACY_RETIRED_RULE_IDS = ['ldev-agent-workflow'];

async function installManagedAiRules(
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

    for (const target of targets) {
      await fs.ensureDir(path.dirname(target.path));
      await writeTextFileLf(target.path, target.transform(content));
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

async function cleanupRetiredManagedAiRules(
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

function buildRulesManifest(options: {
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

function currentVerifiedProducts(projectType: ProjectType, targetDir: string): string[] {
  if (projectType !== 'blade-workspace') {
    return [];
  }

  const gradlePropertiesPath = path.join(targetDir, 'gradle.properties');
  if (!fs.existsSync(gradlePropertiesPath)) {
    return [];
  }

  const content = fs.readFileSync(gradlePropertiesPath, 'utf8');
  const productLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('liferay.workspace.product='));

  if (!productLine) {
    return [];
  }

  const product = productLine.split('=')[1]?.trim();
  return product ? [product] : [];
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

async function installAgentsFile(
  targetDir: string,
  assets: AiAssets,
  force: boolean,
  options: {projectType: ProjectType; projectSkillsInstalled: string[]},
): Promise<AiCommandResult['agents']> {
  const destination = path.join(targetDir, 'AGENTS.md');
  const exists = await fs.pathExists(destination);

  if (exists && !force) {
    return 'kept';
  }

  const content = await renderAgentsFile(assets, options);
  await writeTextFileLf(destination, content);
  return exists ? 'overwritten' : 'installed';
}

async function renderAgentsFile(
  assets: AiAssets,
  options: {projectType: ProjectType; projectSkillsInstalled: string[]},
): Promise<string> {
  const templatePath =
    options.projectType === 'blade-workspace' ? assets.workspaceAgentsTemplatePath : assets.agentsTemplatePath;
  const template = await fs.readFile(templatePath, 'utf8');
  const projectSection =
    options.projectSkillsInstalled.length > 0
      ? [
          '',
          '## Project-Owned Skills Installed By `--project`',
          '',
          'These project-owned skills were installed:',
          '',
          ...options.projectSkillsInstalled.map((skill) => `- \`${skill}\``),
        ].join('\n')
      : '';

  return template.replace('{{LIFECYCLE_SKILLS_SECTION}}', projectSection);
}

function buildNextSteps(
  targetDir: string,
  projectType: ProjectType,
  local: boolean,
  skillsOnly: boolean,
  project: boolean,
  projectContext: boolean,
  selectedSkills: string[],
): string[] {
  if (skillsOnly) {
    if (projectType === 'blade-workspace') {
      return [
        'Run git diff .workspace-rules .claude .cursor .gemini .github .windsurf .agents/skills to review vendor changes.',
      ];
    }
    if (selectedSkills.length > 0) {
      return ['Run git diff .agents/skills/ to review vendor changes in the selected skills.'];
    }
    return ['Run git diff .agents/skills/ to review vendor changes.'];
  }

  const steps: string[] = [];
  if (projectType === 'blade-workspace') {
    steps.push(
      projectContext
        ? 'Review AGENTS.md, docs/ai/project-context.md, and the installed ldev-* files under .workspace-rules/ and the tool-specific directories.'
        : 'Review AGENTS.md and the installed ldev-* files under .workspace-rules/ and the tool-specific directories.',
    );
    steps.push('Keep the official Liferay Workspace AI files as the base layer; ldev is the augmentation layer.');
  } else {
    steps.push(
      projectContext
        ? 'Review AGENTS.md, CLAUDE.md, and docs/ai/project-context.md. Treat docs/ai/project-context.md.sample as a human template only.'
        : 'Review AGENTS.md and CLAUDE.md.',
    );
  }
  if (local) {
    steps.push('Review the ldev AI block in .gitignore and keep docs/ai tracked if you want shared project context.');
  }
  steps.push('Review .agents/skills/.');
  if (project) {
    steps.push('Project skills are project-owned: ldev ai update will not overwrite them.');
  }
  steps.push(`From ${targetDir}, run ldev doctor --json and ldev context --json before starting an agent session.`);
  return steps;
}
function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort();
}

function resolveSelectedSkills(vendorSkills: string[], requestedSkills: string[]): string[] {
  if (requestedSkills.length === 0) {
    return [];
  }

  const invalid = requestedSkills.filter((skillName) => !vendorSkills.includes(skillName));
  if (invalid.length > 0) {
    throw new Error(`Unknown vendor skill(s): ${invalid.join(', ')}. Available skills: ${vendorSkills.join(', ')}`);
  }

  return requestedSkills;
}

async function collectLocalSkills(skillsDestinationDir: string): Promise<string[]> {
  const entries = await fs.readdir(skillsDestinationDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function collectExistingProjectSkills(skillsDestinationDir: string): Promise<string[]> {
  if (!(await fs.pathExists(skillsDestinationDir))) {
    return [];
  }
  const entries = await fs.readdir(skillsDestinationDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('project-'))
    .map((entry) => entry.name)
    .sort();
}

async function installProjectFile(targetDir: string, assets: AiAssets, relativePath: string): Promise<boolean> {
  const source = path.join(assets.projectDir, relativePath);
  if (!(await fs.pathExists(source))) {
    return false;
  }

  const destination = path.join(targetDir, relativePath);
  if (await fs.pathExists(destination)) {
    return false;
  }

  await fs.ensureDir(path.dirname(destination));
  await copyAiTemplatePath(source, destination);
  return true;
}

async function installProjectOwnedSkills(
  targetDir: string,
  assets: AiAssets,
  projectType: ProjectType,
): Promise<string[]> {
  const skillsManifest = resolveProjectSkillsManifest(assets.projectDir, projectType);
  if (!(await fs.pathExists(skillsManifest))) {
    return [];
  }

  const content = await fs.readFile(skillsManifest, 'utf8');
  const skillNames = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const projectSkillsDir = path.join(assets.projectDir, 'skills');
  const destinationDir = path.join(targetDir, '.agents', 'skills');
  const installed: string[] = [];

  for (const skillName of skillNames) {
    const source = path.join(projectSkillsDir, skillName);
    if (!(await fs.pathExists(source))) {
      continue;
    }
    const destinationName = `project-${skillName}`;
    const destination = path.join(destinationDir, destinationName);
    if (await fs.pathExists(destination)) {
      continue;
    }
    await copyAiTemplatePath(source, destination, {overwrite: false});
    installed.push(destinationName);
  }

  return installed;
}

async function installProjectAgents(targetDir: string, assets: AiAssets, projectType: ProjectType): Promise<string[]> {
  const agentsDir = path.join(assets.projectDir, '.claude', 'agents');
  if (!(await fs.pathExists(agentsDir))) {
    return [];
  }

  const allowedAgents = await resolveProjectAgentNames(assets.projectDir, projectType);
  if (allowedAgents.length === 0) {
    return [];
  }

  const destinationDir = path.join(targetDir, '.claude', 'agents');
  await fs.ensureDir(destinationDir);

  const entries = await fs.readdir(agentsDir, {withFileTypes: true});
  const agentFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith('.md') && allowedAgents.includes(e.name.replace('.md', '')),
  );
  const installed: string[] = [];

  for (const entry of agentFiles) {
    const destination = path.join(destinationDir, entry.name);
    if (await fs.pathExists(destination)) {
      continue;
    }
    await copyAiTemplatePath(path.join(agentsDir, entry.name), destination);
    installed.push(entry.name.replace('.md', ''));
  }

  return installed;
}

function buildProjectOverlayWarnings(options: {
  projectType: ProjectType;
  projectSkillsInstalled: string[];
  projectAgentsInstalled: string[];
}): string[] {
  const warnings: string[] = [];

  if (
    options.projectAgentsInstalled.length > 0 &&
    !options.projectSkillsInstalled.includes('project-issue-engineering')
  ) {
    warnings.push('Some project Claude agents were installed without the expected project issue-engineering skill.');
  }

  return warnings;
}

function buildWorkspaceCoexistenceWarnings(
  projectType: ProjectType,
  officialWorkspaceFilesDetected: string[],
): string[] {
  if (projectType !== 'blade-workspace' || officialWorkspaceFilesDetected.length === 0) {
    return [];
  }

  const warnings = [
    'Official Liferay Workspace AI files were detected. Keep them as the base layer and treat ldev-managed files as augmentation.',
  ];

  if (officialWorkspaceFilesDetected.includes('.workspace-rules/liferay-rules.md')) {
    warnings.push(
      'If the official Workspace MCP guidance conflicts with ldev-managed MCP rules, prefer the verified runtime-specific guidance in ldev-liferay-mcp.',
    );
  }

  return warnings;
}

function resolveProjectSkillsManifest(projectDir: string, projectType: ProjectType): string {
  const projectTypeSpecific = path.join(projectDir, `project-skills.${projectType}.txt`);
  if (fs.existsSync(projectTypeSpecific)) {
    return projectTypeSpecific;
  }
  const genericSafe = path.join(projectDir, 'project-skills.unknown.txt');
  if (projectType === 'unknown' && fs.existsSync(genericSafe)) {
    return genericSafe;
  }
  return path.join(projectDir, 'project-skills.txt');
}

async function resolveProjectAgentNames(projectDir: string, projectType: ProjectType): Promise<string[]> {
  const manifestPath = path.join(projectDir, `project-agents.${projectType}.txt`);
  if (!(await fs.pathExists(manifestPath))) {
    if (projectType === 'unknown') {
      const unknownManifestPath = path.join(projectDir, 'project-agents.unknown.txt');
      if (await fs.pathExists(unknownManifestPath)) {
        return readSimpleManifest(unknownManifestPath);
      }
    }
    if (projectType === 'ldev-native') {
      return [];
    }
    return [];
  }

  return readSimpleManifest(manifestPath);
}

async function readSimpleManifest(manifestPath: string): Promise<string[]> {
  const content = await fs.readFile(manifestPath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

const LOCAL_AI_GITIGNORE_MARKER = '# ldev ai install --local';
const LOCAL_AI_GITIGNORE_ENTRIES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/',
  '.claude/',
  '.cursor/',
  '.gemini/',
  '.windsurf/',
  '.workspace-rules/',
  '.github/instructions/',
  '.github/copilot-instructions.md',
  '.ldev/ai/',
  '.liferay-cli.yml',
];

async function ensureLocalAiGitignoreEntries(targetDir: string): Promise<string[]> {
  const gitignorePath = path.join(targetDir, '.gitignore');
  const exists = await fs.pathExists(gitignorePath);
  const currentContent = exists ? await fs.readFile(gitignorePath, 'utf8') : '';
  const currentLines = currentContent.split(/\r?\n/);
  const normalizedCurrentEntries = new Set(
    currentLines.map((line) => normalizeGitignoreEntryForComparison(line)).filter((line) => line.length > 0),
  );
  const missingEntries = LOCAL_AI_GITIGNORE_ENTRIES.filter(
    (entry) => !normalizedCurrentEntries.has(normalizeGitignoreEntryForComparison(entry)),
  );

  const lines = currentContent.length > 0 ? [...currentLines] : [];

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  if (lines.length > 0) {
    lines.push('');
  }
  if (!lines.includes(LOCAL_AI_GITIGNORE_MARKER)) {
    lines.push(LOCAL_AI_GITIGNORE_MARKER);
  }
  lines.push(...missingEntries);

  await fs.writeFile(gitignorePath, `${lines.join('\n')}\n`);
  return missingEntries;
}

async function copyAiTemplatePath(
  source: string,
  destination: string,
  options: {overwrite?: boolean} = {},
): Promise<void> {
  if ((await fs.pathExists(destination)) && options.overwrite === false) {
    return;
  }

  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await copyAiTemplateDirectory(source, destination, options);
    return;
  }

  await fs.ensureDir(path.dirname(destination));
  const buffer = await fs.readFile(source);
  if (isProbablyBinary(buffer)) {
    await fs.copy(source, destination, {overwrite: options.overwrite ?? true});
    return;
  }

  await fs.writeFile(destination, normalizeTextLineEndings(buffer.toString('utf8')));
  await fs.chmod(destination, stat.mode);
}

async function copyAiTemplateDirectory(
  sourceDir: string,
  destinationDir: string,
  options: {overwrite?: boolean},
): Promise<void> {
  await fs.ensureDir(destinationDir);
  const entries = await fs.readdir(sourceDir, {withFileTypes: true});

  for (const entry of entries) {
    await copyAiTemplatePath(path.join(sourceDir, entry.name), path.join(destinationDir, entry.name), options);
  }
}

async function writeTextFileLf(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, normalizeTextLineEndings(content));
}

function normalizeTextLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

function isProbablyBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function normalizeGitignoreEntryForComparison(line: string): string {
  const withoutComment = line.replace(/\s+#.*$/, '').trim();

  if (withoutComment.length === 0 || withoutComment.startsWith('#')) {
    return '';
  }

  return withoutComment.replace(/^\/+/, '');
}
