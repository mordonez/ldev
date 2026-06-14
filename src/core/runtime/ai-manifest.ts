import path from 'node:path';
import {fileURLToPath} from 'node:url';

import fs from 'fs-extra';

import {CliError} from '../errors.js';
import {isRecord} from '../utils/json.js';

export type AiAssets = {
  repoRoot: string;
  packageVersion: string;
  aiRoot: string;
  installDir: string;
  projectDir: string;
  skillsSourceDir: string;
  agentsTemplatePath: string;
  workspaceAgentsTemplatePath: string;
};

export function resolveAiAssets(repoRoot = getDefaultRepoRoot()): AiAssets {
  const aiRoot = path.join(repoRoot, 'templates', 'ai');
  const installDir = path.join(aiRoot, 'install');
  const projectDir = path.join(aiRoot, 'project');
  const packageJson: unknown = fs.readJsonSync(path.join(repoRoot, 'package.json'));
  const packageVersion =
    isRecord(packageJson) && typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

  return {
    repoRoot,
    packageVersion,
    aiRoot,
    installDir,
    projectDir,
    skillsSourceDir: path.join(repoRoot, 'skills'),
    agentsTemplatePath: path.join(installDir, 'AGENTS.md'),
    workspaceAgentsTemplatePath: path.join(installDir, 'AGENTS.workspace.md'),
  };
}

function getDefaultRepoRoot(): string {
  return findPackageRoot(fileURLToPath(import.meta.url));
}

function findPackageRoot(fromFile: string): string {
  let current = path.dirname(fromFile);

  for (;;) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'templates', 'ai'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new CliError(`Could not resolve the ldev package root from ${fromFile}`, {
        code: 'AI_PACKAGE_ROOT_NOT_FOUND',
      });
    }
    current = parent;
  }
}
