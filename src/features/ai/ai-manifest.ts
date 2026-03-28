import path from 'node:path';
import {fileURLToPath} from 'node:url';

import fs from 'fs-extra';

export type AiAssets = {
  repoRoot: string;
  aiRoot: string;
  installDir: string;
  vendorSkillsManifestPath: string;
  skillsSourceDir: string;
  agentsTemplatePath: string;
};

export function resolveAiAssets(repoRoot = getDefaultRepoRoot()): AiAssets {
  const aiRoot = path.join(repoRoot, 'templates', 'ai');
  const installDir = path.join(aiRoot, 'install');

  return {
    repoRoot,
    aiRoot,
    installDir,
    vendorSkillsManifestPath: path.join(installDir, 'vendor-skills.txt'),
    skillsSourceDir: path.join(aiRoot, 'skills'),
    agentsTemplatePath: path.join(installDir, 'AGENTS.md'),
  };
}

export async function listVendorSkills(assets: AiAssets): Promise<string[]> {
  const content = await fs.readFile(assets.vendorSkillsManifestPath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .sort();
}

export async function readManifestSkills(manifestPath: string): Promise<string[]> {
  if (!(await fs.pathExists(manifestPath))) {
    return [];
  }

  const content = await fs.readFile(manifestPath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export async function writeVendorManifest(manifestPath: string, skills: string[], generatedAt: Date): Promise<void> {
  const lines = [
    '# Skills instaladas desde ldev',
    `# Actualizado: ${generatedAt.toISOString()}`,
    '# NO editar manualmente — generado por ldev ai',
    ...skills,
    '',
  ];

  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeFile(manifestPath, lines.join('\n'));
}

function getDefaultRepoRoot(): string {
  return findPackageRoot(fileURLToPath(import.meta.url));
}

function findPackageRoot(fromFile: string): string {
  let current = path.dirname(fromFile);

  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'templates', 'ai'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`No se pudo resolver la raíz del paquete ldev desde ${fromFile}`);
    }
    current = parent;
  }
}
