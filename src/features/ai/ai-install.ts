import path from 'node:path';

import fs from 'fs-extra';

import type {Printer} from '../../core/output/printer.js';
import {detectProjectType, type ProjectType} from '../../core/config/project-type.js';
import {resolveAiAssets, type AiAssets} from './ai-manifest.js';
import {buildNextSteps, installAgentsFile, installProjectFile, installProjectSkill} from './ai-install-project.js';

export type AiCommandResult = {
  mode: 'install';
  targetDir: string;
  projectType: ProjectType;
  agents: 'installed' | 'overwritten' | 'kept';
  claudeInstalled: boolean;
  copilotInstalled: boolean;
  geminiInstalled: boolean;
  projectContextSampleInstalled: boolean;
  projectIssueSkillInstalled: boolean;
  nextSteps: string[];
};

export async function runAiInstall(
  options: {
    targetDir: string;
    force: boolean;
    printer?: Printer;
  },
  dependencies?: {assets?: AiAssets},
): Promise<AiCommandResult> {
  const targetDir = path.resolve(options.targetDir);
  const projectType = detectProjectType(targetDir);
  const assets = dependencies?.assets ?? resolveAiAssets();
  const overwrite = options.force;

  const agents = await installAgentsFile(targetDir, assets, options.force, {projectType});

  const claudeInstalled =
    projectType !== 'blade-workspace' ? await installProjectFile(targetDir, assets, 'CLAUDE.md', {overwrite}) : false;

  const copilotInstalled =
    projectType !== 'blade-workspace'
      ? await installProjectFile(targetDir, assets, path.join('.github', 'copilot-instructions.md'), {overwrite})
      : false;

  const geminiInstalled = await installProjectFile(targetDir, assets, path.join('.gemini', 'GEMINI.md'), {overwrite});
  const projectContextSampleInstalled = await installProjectFile(
    targetDir,
    assets,
    path.join('docs', 'ai', 'project-context.md.sample'),
    {overwrite},
  );

  const projectIssueSkillInstalled = await installProjectSkill(targetDir, assets, 'issue-engineering', {overwrite});

  // Ensure .claude/skills/ exists so that `npx skills add` can create Claude Code symlinks there.
  // skills.sh silently skips Claude Code symlink creation when .claude/ does not exist.
  await fs.ensureDir(path.join(targetDir, '.claude', 'skills'));

  return {
    mode: 'install',
    targetDir,
    projectType,
    agents,
    claudeInstalled,
    copilotInstalled,
    geminiInstalled,
    projectContextSampleInstalled,
    projectIssueSkillInstalled,
    nextSteps: buildNextSteps(projectType),
  };
}

export function formatAiResult(result: AiCommandResult): string {
  const lines = [`Installation completed in: ${result.targetDir}`, ''];
  lines.push(`Project type: ${result.projectType}`);
  lines.push(`AGENTS.md: ${result.agents}`);
  if (result.claudeInstalled) lines.push('CLAUDE.md: applied');
  if (result.copilotInstalled) lines.push('.github/copilot-instructions.md: applied');
  if (result.geminiInstalled) lines.push('.gemini/GEMINI.md: applied');
  if (result.projectContextSampleInstalled) lines.push('docs/ai/project-context.md.sample: applied');
  if (result.projectIssueSkillInstalled) lines.push('.agents/skills/project-issue-engineering: applied');

  if (result.nextSteps.length > 0) {
    lines.push('', 'Next steps:');
    result.nextSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
  }

  return lines.join('\n');
}
