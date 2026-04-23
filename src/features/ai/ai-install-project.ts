import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {ProjectType} from '../../core/config/project-type.js';
import type {AiAssets} from './ai-manifest.js';
import {copyAiTemplatePath, writeTextFileLf} from './ai-install-fs.js';

export type AgentsInstallStatus = 'installed' | 'overwritten' | 'kept' | 'skipped';

export function normalizeRelativePath(value: string): string {
  return value.replace(/\\+/g, '/').split(path.sep).join('/');
}

export function currentVerifiedProducts(projectType: ProjectType, targetDir: string): string[] {
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

export async function installAgentsFile(
  targetDir: string,
  assets: AiAssets,
  force: boolean,
  options: {projectType: ProjectType; projectSkillsInstalled: string[]},
): Promise<AgentsInstallStatus> {
  const destination = path.join(targetDir, 'AGENTS.md');
  const exists = await fs.pathExists(destination);

  if (exists && !force) {
    return 'kept';
  }

  const content = await renderAgentsFile(assets, options);
  await writeTextFileLf(destination, content);
  return exists ? 'overwritten' : 'installed';
}

export async function renderAgentsFile(
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

export function buildNextSteps(
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
  steps.push('Run playwright-cli install --skills so agents have the official playwright-cli command reference.');
  if (project) {
    steps.push('Project skills are project-owned: ldev ai update will not overwrite them.');
  }
  steps.push('Run `ldev ai bootstrap --intent=develop --json` to verify the agent can operate.');
  steps.push(
    'If OAuth2 credential status is missing in bootstrap context, run `ldev oauth install --write-env` to enable portal commands.',
  );
  return steps;
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort();
}

export function resolveSelectedSkills(vendorSkills: string[], requestedSkills: string[]): string[] {
  if (requestedSkills.length === 0) {
    return [];
  }

  const invalid = requestedSkills.filter((skillName) => !vendorSkills.includes(skillName));
  if (invalid.length > 0) {
    throw new CliError(`Unknown vendor skill(s): ${invalid.join(', ')}. Available skills: ${vendorSkills.join(', ')}`, {
      code: 'AI_INSTALL_INVALID_VENDOR',
    });
  }

  return requestedSkills;
}

export async function collectLocalSkills(skillsDestinationDir: string): Promise<string[]> {
  const entries = await fs.readdir(skillsDestinationDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function collectExistingProjectSkills(skillsDestinationDir: string): Promise<string[]> {
  if (!(await fs.pathExists(skillsDestinationDir))) {
    return [];
  }
  const entries = await fs.readdir(skillsDestinationDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('project-'))
    .map((entry) => entry.name)
    .sort();
}

export async function installProjectFile(
  targetDir: string,
  assets: AiAssets,
  relativePath: string,
  options?: {overwrite?: boolean},
): Promise<boolean> {
  const source = path.join(assets.projectDir, relativePath);
  if (!(await fs.pathExists(source))) {
    return false;
  }

  const destination = path.join(targetDir, relativePath);
  if ((await fs.pathExists(destination)) && !options?.overwrite) {
    return false;
  }

  await fs.ensureDir(path.dirname(destination));
  await copyAiTemplatePath(source, destination, {overwrite: options?.overwrite ?? true});
  return true;
}

export async function installProjectOwnedSkills(
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

export async function installClaudeSkillCommands(
  targetDir: string,
  skillNames: string[],
  retiredSkillNames: string[],
): Promise<string[]> {
  const skillsDir = path.join(targetDir, '.claude', 'skills');
  await fs.ensureDir(skillsDir);

  for (const skillName of retiredSkillNames) {
    await fs.remove(path.join(skillsDir, skillName));
  }

  const installed: string[] = [];
  for (const skillName of skillNames) {
    const linkPath = path.join(skillsDir, skillName);
    const absoluteSource = path.join(targetDir, '.agents', 'skills', skillName);

    if (!(await fs.pathExists(absoluteSource))) {
      continue;
    }

    if (await fs.pathExists(linkPath)) {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink()) {
        continue;
      }
      await fs.remove(linkPath);
    }

    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    const symlinkTarget = process.platform === 'win32' ? absoluteSource : path.relative(skillsDir, absoluteSource);
    await fs.symlink(symlinkTarget, linkPath, symlinkType);
    installed.push(skillName);
  }
  return installed;
}

export async function installProjectAgents(
  targetDir: string,
  assets: AiAssets,
  projectType: ProjectType,
): Promise<string[]> {
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

export function buildProjectOverlayWarnings(options: {
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

export function buildWorkspaceCoexistenceWarnings(
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

export function resolveProjectSkillsManifest(projectDir: string, projectType: ProjectType): string {
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

export async function resolveProjectAgentNames(projectDir: string, projectType: ProjectType): Promise<string[]> {
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

export async function readSimpleManifest(manifestPath: string): Promise<string[]> {
  const content = await fs.readFile(manifestPath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
