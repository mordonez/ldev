import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import {upsertEnvFileValues} from '../../core/config/env-file.js';
import {
  gitAddPaths,
  gitCommit,
  hasStagedChanges,
  initializeGitRepository,
  isGitRepository,
} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {
  copyProjectScaffoldFiles,
  ensureBootstrapModule,
  ensureDockerScaffold,
  ensureLiferayScaffold,
  resolveProjectAssets,
  type ProjectAssets,
} from './project-scaffold.js';

type ProjectMode = 'init' | 'add' | 'add-community';

export type ProjectCommandResult = {
  mode: ProjectMode;
  targetDir: string;
  gitInitialized: boolean;
  toolingLinked: boolean;
  changes: {
    dockerCreated: boolean;
    liferayCreated: boolean;
    bootstrapModuleCreated: boolean;
    scaffoldFilesCopied: string[];
    committed: boolean;
  };
  nextSteps: string[];
};

type ProjectCommandDependencies = {
  assets?: ProjectAssets;
};

export async function runProjectInit(
  options: {name: string; targetDir: string; printer: Printer},
  dependencies?: ProjectCommandDependencies,
): Promise<ProjectCommandResult> {
  const targetDir = path.resolve(options.targetDir);
  await fs.ensureDir(targetDir);

  const hadGit = await isGitRepository(targetDir);
  if (!hadGit) {
    await initializeGitRepository(targetDir);
  }

  return applyProjectTooling({
    mode: 'init',
    projectName: options.name,
    targetDir,
    assets: dependencies?.assets ?? resolveProjectAssets(),
    printer: options.printer,
    includeDocker: true,
    includeLiferay: true,
    commitMessage: 'chore: scaffold inicial del proyecto Liferay',
    gitInitialized: !hadGit,
  });
}

export async function runProjectAdd(
  options: {targetDir: string; printer: Printer},
  dependencies?: ProjectCommandDependencies,
): Promise<ProjectCommandResult> {
  const targetDir = path.resolve(options.targetDir);
  await requireGitRepository(targetDir);

  return applyProjectTooling({
    mode: 'add',
    projectName: path.basename(targetDir),
    targetDir,
    assets: dependencies?.assets ?? resolveProjectAssets(),
    printer: options.printer,
    includeDocker: false,
    includeLiferay: false,
    commitMessage: 'chore: añadir ficheros de configuración del tooling',
    gitInitialized: false,
  });
}

export async function runProjectAddCommunity(
  options: {targetDir: string; printer: Printer},
  dependencies?: ProjectCommandDependencies,
): Promise<ProjectCommandResult> {
  const targetDir = path.resolve(options.targetDir);
  await requireGitRepository(targetDir);

  return applyProjectTooling({
    mode: 'add-community',
    projectName: path.basename(targetDir),
    targetDir,
    assets: dependencies?.assets ?? resolveProjectAssets(),
    printer: options.printer,
    includeDocker: true,
    includeLiferay: true,
    commitMessage: 'chore: añadir scaffold y ficheros de configuración del tooling',
    gitInitialized: false,
  });
}

export function formatProjectResult(result: ProjectCommandResult): string {
  const lines = [`Proyecto listo en: ${result.targetDir}`, ''];
  lines.push('Próximos pasos:');
  result.nextSteps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${step}`);
  });
  return lines.join('\n');
}

async function applyProjectTooling(options: {
  mode: ProjectMode;
  projectName: string;
  targetDir: string;
  assets: ProjectAssets;
  printer: Printer;
  includeDocker: boolean;
  includeLiferay: boolean;
  commitMessage: string;
  gitInitialized: boolean;
}): Promise<ProjectCommandResult> {
  const dockerCreated = options.includeDocker ? await ensureDockerScaffold(options.targetDir, options.assets) : false;
  const liferayCreated = options.includeLiferay
    ? await ensureLiferayScaffold(options.targetDir, options.assets)
    : false;
  const scaffoldFilesCopied = await copyProjectScaffoldFiles(options.targetDir, options.assets);
  const bootstrapModuleCreated = await ensureBootstrapModule(options.targetDir, options.assets);
  await configureGeneratedProjectFiles(options.targetDir, options.projectName);

  const toolingLinked = false;
  const touchedPaths = await collectTouchedPaths(options.targetDir, {
    dockerCreated,
    liferayCreated,
    bootstrapModuleCreated,
    scaffoldFilesCopied,
  });

  let committed = false;
  await gitAddPaths(options.targetDir, touchedPaths);
  if (await hasStagedChanges(options.targetDir)) {
    await gitCommit(options.targetDir, options.commitMessage);
    committed = true;
  }

  return {
    mode: options.mode,
    targetDir: options.targetDir,
    gitInitialized: options.gitInitialized,
    toolingLinked,
    changes: {
      dockerCreated,
      liferayCreated,
      bootstrapModuleCreated,
      scaffoldFilesCopied,
      committed,
    },
    nextSteps: getNextSteps(options.targetDir),
  };
}

async function requireGitRepository(targetDir: string): Promise<void> {
  if (!(await isGitRepository(targetDir))) {
    throw new CliError(`${targetDir} no es un repositorio git.`, {code: 'PROJECT_NOT_A_REPO'});
  }
}

function getNextSteps(targetDir: string): string[] {
  return [
    'Edita docker/.env y ajusta COMPOSE_PROJECT_NAME, puertos y variables locales.',
    'Edita .liferay-cli.yml y revisa los paths del proyecto.',
    `cd ${targetDir}`,
    'Instala ldev globalmente con npm i -g ldev o usa npm link desde tu checkout local de ldev.',
    'ldev setup',
    'Si necesitas datos locales, usa ldev db import --file ruta/backup.gz.',
    'Reserva ldev db sync --project <id> --environment <env> --force para un paso explícito y consciente, no como onboarding por defecto.',
    'ldev start',
    'ldev osgi liferaycli-creds',
  ];
}

async function configureGeneratedProjectFiles(targetDir: string, projectName: string): Promise<void> {
  const slug = toProjectSlug(projectName);
  await updateDockerEnv(path.join(targetDir, 'docker', '.env'), slug, process.env.BIND_IP?.trim());
}

async function updateDockerEnv(dockerEnvFile: string, projectSlug: string, bindIp?: string): Promise<void> {
  if (!(await fs.pathExists(dockerEnvFile))) {
    return;
  }

  const currentContent = await fs.readFile(dockerEnvFile, 'utf8');
  const envValues: Record<string, string> = {
    COMPOSE_PROJECT_NAME: projectSlug,
    DOCLIB_VOLUME_NAME: `${projectSlug}-doclib`,
  };

  if (bindIp && bindIp !== '') {
    envValues.BIND_IP = bindIp;
  }

  const updatedContent = upsertEnvFileValues(currentContent, envValues);
  await fs.writeFile(dockerEnvFile, `${updatedContent}\n`);
}

function toProjectSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized === '' ? 'liferay' : normalized;
}

async function collectTouchedPaths(
  targetDir: string,
  changes: {
    dockerCreated: boolean;
    liferayCreated: boolean;
    bootstrapModuleCreated: boolean;
    scaffoldFilesCopied: string[];
  },
): Promise<string[]> {
  const touchedPaths = [...changes.scaffoldFilesCopied];

  if (changes.dockerCreated) {
    touchedPaths.push('docker');
  }

  if (changes.liferayCreated) {
    touchedPaths.push('liferay');
  }

  if (changes.bootstrapModuleCreated) {
    touchedPaths.push(path.join('liferay', 'modules', 'liferay-cli-bootstrap'));
  }

  return touchedPaths;
}
