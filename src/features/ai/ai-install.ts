import path from 'node:path';

import fs from 'fs-extra';

import type {Printer} from '../../core/output/print.js';
import {
  listVendorSkills,
  readManifestSkills,
  resolveAiAssets,
  writeVendorManifest,
  type AiAssets,
} from './ai-manifest.js';

export type AiCommandResult = {
  mode: 'install' | 'update';
  targetDir: string;
  skillsOnly: boolean;
  vendorSkills: string[];
  updatedSkills: string[];
  preservedLocalSkills: string[];
  manifestPath: string;
  agents: 'installed' | 'overwritten' | 'kept' | 'skipped';
  nextSteps: string[];
};

type AiDependencies = {
  assets?: AiAssets;
  now?: Date;
};

export async function runAiInstall(
  options: {targetDir: string; force: boolean; skillsOnly: boolean; printer: Printer},
  dependencies?: AiDependencies,
): Promise<AiCommandResult> {
  return applyAiInstall({
    mode: options.skillsOnly ? 'update' : 'install',
    targetDir: path.resolve(options.targetDir),
    force: options.force,
    skillsOnly: options.skillsOnly,
    printer: options.printer,
    assets: dependencies?.assets ?? resolveAiAssets(),
    now: dependencies?.now ?? new Date(),
  });
}

export function formatAiResult(result: AiCommandResult): string {
  const lines = [`Instalación completada en: ${result.targetDir}`, ''];

  if (result.skillsOnly) {
    lines.push(`Skills del vendor actualizadas: ${result.updatedSkills.length}`);
    if (result.preservedLocalSkills.length > 0) {
      lines.push(`Skills locales conservadas: ${result.preservedLocalSkills.length}`);
    }
  } else {
    lines.push(`Skills instaladas: ${result.updatedSkills.length}`);
    lines.push(`AGENTS.md: ${result.agents}`);
  }

  if (result.nextSteps.length > 0) {
    lines.push('');
    lines.push('Próximos pasos:');
    result.nextSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
  }

  return lines.join('\n');
}

async function applyAiInstall(options: {
  mode: 'install' | 'update';
  targetDir: string;
  force: boolean;
  skillsOnly: boolean;
  printer: Printer;
  assets: AiAssets;
  now: Date;
}): Promise<AiCommandResult> {
  const skillsDestinationDir = path.join(options.targetDir, '.agents', 'skills');
  const manifestPath = path.join(options.targetDir, '.agents', '.vendor-skills');

  await fs.ensureDir(skillsDestinationDir);

  const vendorSkills = await listVendorSkills(options.assets);
  const manifestSkills = options.skillsOnly ? await readManifestSkills(manifestPath) : [];
  const retiredVendorSkills =
    options.skillsOnly && manifestSkills.length > 0
      ? manifestSkills.filter((skillName) => !vendorSkills.includes(skillName))
      : [];
  const skillsToUpdate = vendorSkills;

  for (const skillName of skillsToUpdate) {
    await fs.copy(path.join(options.assets.skillsSourceDir, skillName), path.join(skillsDestinationDir, skillName), {
      overwrite: true,
    });
  }

  for (const skillName of retiredVendorSkills) {
    await fs.remove(path.join(skillsDestinationDir, skillName));
  }

  const preservedLocalSkills = options.skillsOnly
    ? (await collectLocalSkills(skillsDestinationDir)).filter((skillName) => !manifestSkills.includes(skillName))
    : [];

  await writeVendorManifest(manifestPath, vendorSkills, options.now);

  let agents: AiCommandResult['agents'] = 'skipped';
  if (!options.skillsOnly) {
    agents = await installAgentsFile(options.targetDir, options.assets, options.force);
  }

  return {
    mode: options.mode,
    targetDir: options.targetDir,
    skillsOnly: options.skillsOnly,
    vendorSkills,
    updatedSkills: skillsToUpdate,
    preservedLocalSkills,
    manifestPath,
    agents,
    nextSteps: buildNextSteps(options.targetDir, options.skillsOnly),
  };
}

async function collectLocalSkills(skillsDestinationDir: string): Promise<string[]> {
  const entries = await fs.readdir(skillsDestinationDir, {withFileTypes: true});
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function installAgentsFile(targetDir: string, assets: AiAssets, force: boolean): Promise<AiCommandResult['agents']> {
  const destination = path.join(targetDir, 'AGENTS.md');
  const exists = await fs.pathExists(destination);

  if (exists && !force) {
    return 'kept';
  }

  await fs.copy(assets.agentsTemplatePath, destination, {overwrite: true});
  return exists ? 'overwritten' : 'installed';
}

function buildNextSteps(targetDir: string, skillsOnly: boolean): string[] {
  if (skillsOnly) {
    return ['Ejecuta git diff .agents/skills/ para revisar cambios del vendor.'];
  }

  const steps: string[] = [];
  steps.push('Revisa AGENTS.md y ajusta cualquier documento local de contexto que el proyecto necesite.');
  steps.push('Revisa .agents/skills/ y añade skills propias del proyecto con un prefijo del proyecto si hacen falta.');
  steps.push(`Desde ${targetDir}, ejecuta ldev start cuando el entorno esté listo.`);
  return steps;
}
