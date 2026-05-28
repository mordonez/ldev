import path from 'node:path';

import fs from 'fs-extra';

import {isCliError} from '../../core/errors.js';
import type {DeployContext} from './deploy-gradle.js';
import {DeployErrors} from './errors/deploy-error-factory.js';
import {DeployErrorCode} from './errors/deploy-error-codes.js';

const BFS_SKIP_DIRS = new Set(['build', '.gradle', 'node_modules', '.git']);

export type DeployModuleTarget = {
  label: string;
  moduleDir: string;
  artifactDirs: string[];
  gradleTasks: string[][];
};

const DOCKER_DEPLOY_ENV = '-Pliferay.workspace.environment=dockerenv';

export async function resolveDeployModuleTarget(context: DeployContext, module: string): Promise<DeployModuleTarget> {
  const requested = normalizeModuleInput(module);

  const direct = await resolveDirectDeployTarget(context, requested);
  if (direct) {
    return direct;
  }

  const nestedModule = await findNestedModule(context, requested);
  if (nestedModule) {
    return moduleDirectoryTarget(context, nestedModule, requested);
  }

  const candidates = await listDeployableModuleNames(context);
  const hint = candidates.length > 0 ? ` Available modules include: ${candidates.slice(0, 12).join(', ')}.` : '';

  throw DeployErrors.moduleNotFound(`No module, theme, client extension, or war named ${module} exists.${hint}`);
}

export async function resolveDeployModuleArtifactDirs(context: DeployContext, module: string): Promise<string[]> {
  const requested = normalizeModuleInput(module);
  try {
    const target = await resolveDeployModuleTarget(context, module);
    return uniqueDirs([...target.artifactDirs, ...legacyArtifactDirs(context, requested)]);
  } catch (error) {
    if (isCliError(error) && error.code === DeployErrorCode.MODULE_NOT_FOUND) {
      return legacyArtifactDirs(context, requested);
    }
    throw error;
  }
}

function normalizeModuleInput(module: string): string {
  return module.trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

async function resolveDirectDeployTarget(context: DeployContext, module: string): Promise<DeployModuleTarget | null> {
  const themeDir = path.join(context.liferayDir, 'themes', module);
  if (await fs.pathExists(themeDir)) {
    return {
      label: module,
      moduleDir: themeDir,
      artifactDirs: [path.join(themeDir, 'dist')],
      gradleTasks: [[`:themes:${module}:dockerDeploy`, '-q']],
    };
  }

  const clientExtDir = path.join(context.liferayDir, 'client-extensions', module);
  if (await fs.pathExists(clientExtDir)) {
    return {
      label: module,
      moduleDir: clientExtDir,
      artifactDirs: [path.join(clientExtDir, 'dist')],
      gradleTasks: [[`:client-extensions:${module}:dockerDeploy`, DOCKER_DEPLOY_ENV]],
    };
  }

  const warDir = path.join(context.liferayDir, 'wars', module);
  if (await fs.pathExists(warDir)) {
    return {
      label: module,
      moduleDir: warDir,
      artifactDirs: [path.join(warDir, 'build', 'libs')],
      gradleTasks: [[`:wars:${module}:dockerDeploy`, DOCKER_DEPLOY_ENV]],
    };
  }

  const apiDir = path.join(context.liferayDir, 'modules', module, `${module}-api`);
  const serviceDir = path.join(context.liferayDir, 'modules', module, `${module}-service`);
  if ((await fs.pathExists(apiDir)) && (await fs.pathExists(serviceDir))) {
    return {
      label: module,
      moduleDir: path.join(context.liferayDir, 'modules', module),
      artifactDirs: [path.join(apiDir, 'build', 'libs'), path.join(serviceDir, 'build', 'libs')],
      gradleTasks: [
        [`:modules:${module}:${module}-api:dockerDeploy`, DOCKER_DEPLOY_ENV],
        [`:modules:${module}:${module}-service:dockerDeploy`, DOCKER_DEPLOY_ENV],
      ],
    };
  }

  const moduleDir = path.join(context.liferayDir, module);
  if (module.startsWith('modules/') && (await isDeployableModuleDir(moduleDir))) {
    return moduleDirectoryTarget(context, moduleDir, module);
  }

  const topLevelModuleDir = path.join(context.liferayDir, 'modules', module);
  if (await isDeployableModuleDir(topLevelModuleDir)) {
    return moduleDirectoryTarget(context, topLevelModuleDir, module);
  }

  return null;
}

async function findNestedModule(context: DeployContext, module: string): Promise<string | null> {
  const modulesDir = path.join(context.liferayDir, 'modules');
  if (!(await fs.pathExists(modulesDir))) {
    return null;
  }

  const matches: string[] = [];
  const queue = [modulesDir];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isDirectory() || BFS_SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      queue.push(entryPath);

      if (!(await isDeployableModuleDir(entryPath))) {
        continue;
      }

      if (entry.name === module || (await hasBundleSymbolicName(entryPath, module))) {
        matches.push(entryPath);
      }
    }
  }

  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  if (matches.length > 1) {
    const labels = matches.map((match) => path.relative(context.liferayDir, match).replaceAll(path.sep, '/'));
    throw DeployErrors.moduleAmbiguous(`Module ${module} is ambiguous. Matching modules: ${labels.join(', ')}.`);
  }

  return null;
}

function moduleDirectoryTarget(context: DeployContext, moduleDir: string, label: string): DeployModuleTarget {
  const relativePath = path.relative(context.liferayDir, moduleDir).replaceAll(path.sep, '/');
  const taskPath = `:${relativePath.split('/').join(':')}:dockerDeploy`;

  return {
    label,
    moduleDir,
    artifactDirs: [path.join(moduleDir, 'build', 'libs')],
    gradleTasks: [[taskPath, DOCKER_DEPLOY_ENV]],
  };
}

async function isDeployableModuleDir(moduleDir: string): Promise<boolean> {
  return fs.pathExists(path.join(moduleDir, 'build.gradle'));
}

async function hasBundleSymbolicName(moduleDir: string, bundleSymbolicName: string): Promise<boolean> {
  const bndPath = path.join(moduleDir, 'bnd.bnd');
  if (!(await fs.pathExists(bndPath))) {
    return false;
  }

  const content = await fs.readFile(bndPath, 'utf8');
  return content
    .split(/\r?\n/)
    .some((line) => line.trim().toLowerCase() === `bundle-symbolicname: ${bundleSymbolicName}`.toLowerCase());
}

async function listDeployableModuleNames(context: DeployContext): Promise<string[]> {
  const names = new Set<string>();
  for (const root of ['themes', 'client-extensions', 'wars', 'modules']) {
    const rootDir = path.join(context.liferayDir, root);
    if (!(await fs.pathExists(rootDir))) {
      continue;
    }

    const queue = [rootDir];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const entries = await fs.readdir(current, {withFileTypes: true});
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const entryPath = path.join(current, entry.name);
        queue.push(entryPath);
        if (root !== 'modules' || (await isDeployableModuleDir(entryPath))) {
          names.add(entry.name);
        }
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function legacyArtifactDirs(context: DeployContext, module: string): string[] {
  return [
    path.join(context.liferayDir, 'themes', module, 'dist'),
    path.join(context.liferayDir, 'modules', module, `${module}-api`, 'build', 'libs'),
    path.join(context.liferayDir, 'modules', module, `${module}-service`, 'build', 'libs'),
    path.join(context.liferayDir, 'modules', module, 'build', 'libs'),
    path.join(context.liferayDir, 'client-extensions', module, 'dist'),
    path.join(context.liferayDir, 'wars', module, 'build', 'libs'),
  ];
}

function uniqueDirs(directories: string[]): string[] {
  return [...new Set(directories)];
}
