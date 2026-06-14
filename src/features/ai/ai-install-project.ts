import path from 'node:path';

import fs from 'fs-extra';

import type {ProjectType} from '../../core/config/project-type.js';
import type {AiAssets} from './ai-manifest.js';
import {copyAiTemplatePath, writeTextFileLf} from './ai-install-fs.js';

export type AgentsInstallStatus = 'installed' | 'overwritten' | 'kept';

export async function installAgentsFile(
  targetDir: string,
  assets: AiAssets,
  force: boolean,
  options: {projectType: ProjectType},
): Promise<AgentsInstallStatus> {
  const destination = path.join(targetDir, 'AGENTS.md');
  const exists = await fs.pathExists(destination);

  if (exists && !force) {
    return 'kept';
  }

  const templatePath =
    options.projectType === 'blade-workspace' ? assets.workspaceAgentsTemplatePath : assets.agentsTemplatePath;
  const content = await fs.readFile(templatePath, 'utf8');
  await writeTextFileLf(destination, content);
  return exists ? 'overwritten' : 'installed';
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

export function buildNextSteps(projectType: ProjectType): string[] {
  const steps: string[] = [];
  if (projectType === 'blade-workspace') {
    steps.push('Review AGENTS.md and CLAUDE.md.');
    steps.push('Keep the official Liferay Workspace AI files as the base layer; ldev is the augmentation layer.');
  } else {
    steps.push('Review AGENTS.md and CLAUDE.md.');
  }
  steps.push('Run `npx skills add https://github.com/mordonez/ldev` to install skills.');
  steps.push('Run `ldev ai bootstrap --intent=develop --json` to verify the agent can operate.');
  return steps;
}
