import path from 'node:path';

import fs from 'fs-extra';

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
  ensureDockerScaffold,
  ensureLiferayDockerenvScaffold,
  ensureLiferayScaffold,
  resolveProjectAssets,
  type DockerService,
  type ProjectAssets,
} from './project-scaffold.js';

export type ProjectCommandResult = {
  targetDir: string;
  gitInitialized: boolean;
  commitRequested: boolean;
  changes: {
    dockerCreated: boolean;
    liferayCreated: boolean;
    scaffoldFilesCopied: string[];
    committed: boolean;
  };
  nextSteps: string[];
};

type ProjectCommandDependencies = {
  assets?: ProjectAssets;
};

export async function runProjectInit(
  options: {name: string; targetDir: string; printer: Printer; commit?: boolean; services?: DockerService[]},
  dependencies?: ProjectCommandDependencies,
): Promise<ProjectCommandResult> {
  const targetDir = path.resolve(options.targetDir);
  await fs.ensureDir(targetDir);

  const hadGit = await isGitRepository(targetDir);
  if (!hadGit) {
    await initializeGitRepository(targetDir);
  }

  return applyProjectTooling({
    projectName: options.name,
    targetDir,
    assets: dependencies?.assets ?? resolveProjectAssets(),
    printer: options.printer,
    commitMessage: 'chore: scaffold initial Liferay project files',
    gitInitialized: !hadGit,
    commitRequested: Boolean(options.commit),
    services: options.services ?? [],
  });
}

export function formatProjectResult(result: ProjectCommandResult): string {
  const lines = [`Project ready in: ${result.targetDir}`];
  lines.push(`Git repository: ${result.gitInitialized ? 'initialized' : 'existing'}`);
  lines.push(
    `Git commit: ${result.changes.committed ? 'created' : result.commitRequested ? 'skipped (no staged changes)' : 'not created'}`,
  );
  lines.push('');
  lines.push('Review the generated files before committing them.');
  lines.push('');
  lines.push('Next steps:');
  result.nextSteps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${step}`);
  });
  return lines.join('\n');
}

async function applyProjectTooling(options: {
  projectName: string;
  targetDir: string;
  assets: ProjectAssets;
  printer: Printer;
  commitMessage: string;
  gitInitialized: boolean;
  commitRequested: boolean;
  services: DockerService[];
}): Promise<ProjectCommandResult> {
  const dockerCreated = await ensureDockerScaffold(options.targetDir, options.assets, options.services);
  const liferayCreated = await ensureLiferayScaffold(options.targetDir, options.assets);
  const dockerenvCreated = liferayCreated
    ? false
    : await ensureLiferayDockerenvScaffold(options.targetDir, options.assets);
  const scaffoldFilesCopied = await copyProjectScaffoldFiles(options.targetDir, options.assets);
  await configureGeneratedProjectFiles(options.targetDir, options.projectName, options.services);

  const touchedPaths = await collectTouchedPaths(options.targetDir, {
    dockerCreated,
    liferayCreated,
    dockerenvCreated,
    scaffoldFilesCopied,
  });

  let committed = false;
  if (options.commitRequested) {
    await gitAddPaths(options.targetDir, touchedPaths);
    if (await hasStagedChanges(options.targetDir)) {
      await gitCommit(options.targetDir, options.commitMessage);
      committed = true;
    }
  }

  return {
    targetDir: options.targetDir,
    gitInitialized: options.gitInitialized,
    commitRequested: options.commitRequested,
    changes: {
      dockerCreated,
      liferayCreated,
      scaffoldFilesCopied,
      committed,
    },
    nextSteps: getNextSteps(options.targetDir),
  };
}

function getNextSteps(targetDir: string): string[] {
  return [
    'Review the generated files with git diff or your editor.',
    'If everything looks right, create your own git commit or rerun with --commit.',
    'Edit docker/.env and adjust COMPOSE_PROJECT_NAME, ports, and local variables.',
    'Edit .liferay-cli.yml and review the project paths.',
    `cd ${targetDir}`,
    'Install ldev globally with npm i -g @mordonezdev/ldev or use npm link from your local ldev checkout.',
    'ldev setup',
    'If you need local data, use ldev db import --file path/to/backup.gz.',
    'Reserve ldev db sync --project <id> --environment <env> --force for an explicit and conscious step, not as default onboarding.',
    'ldev start',
    'ldev oauth install --write-env',
  ];
}

async function configureGeneratedProjectFiles(
  targetDir: string,
  projectName: string,
  services: DockerService[],
): Promise<void> {
  const slug = toProjectSlug(projectName);
  await updateDockerEnv(path.join(targetDir, 'docker', '.env'), slug, services, process.env.BIND_IP?.trim());
}

async function updateDockerEnv(
  dockerEnvFile: string,
  projectSlug: string,
  services: DockerService[],
  bindIp?: string,
): Promise<void> {
  if (!(await fs.pathExists(dockerEnvFile))) {
    return;
  }

  const currentContent = await fs.readFile(dockerEnvFile, 'utf8');
  const envValues: Record<string, string> = {
    COMPOSE_PROJECT_NAME: projectSlug,
    DOCLIB_VOLUME_NAME: `${projectSlug}-doclib`,
  };

  if (services.length > 0) {
    const composeFiles = ['docker-compose.yml', ...services.map((s) => `docker-compose.${s}.yml`)];
    envValues.COMPOSE_FILE = composeFiles.join(':');
  }

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
    dockerenvCreated: boolean;
    scaffoldFilesCopied: string[];
  },
): Promise<string[]> {
  const touchedPaths = [...changes.scaffoldFilesCopied];

  if (changes.dockerCreated) {
    touchedPaths.push('docker');
  }

  if (changes.liferayCreated) {
    touchedPaths.push('liferay');
  } else if (changes.dockerenvCreated) {
    touchedPaths.push(path.join('liferay', 'configs', 'dockerenv'));
  }

  return touchedPaths;
}
