import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {
  ADT_WIDGET_DIR_BY_TYPE,
  resolveAdtsBaseDir,
  resolveStructuresBaseDir,
  resolveTemplatesBaseDir,
} from './artifact-paths.js';

function createConfigIncompleteError(resourceType: string, exampleName: string): CliError {
  return new CliError(
    `${resourceType} file not found for '${exampleName}'.\n\n` +
      `The project configuration is incomplete. To resolve this:\n` +
      `  1. Use --file to specify the full path directly (quick workaround)\n` +
      `  2. Create .liferay-cli.yml in the repository root with paths configuration\n` +
      `  3. Run 'ldev project init' to scaffold the configuration file\n\n` +
      `See: https://ldev.dev/reference/configuration#liferay-cli-yml`,
    {code: 'LIFERAY_CONFIG_INCOMPLETE'},
  );
}

export async function resolveStructureArtifactFile(config: AppConfig, key: string): Promise<string> {
  if (!config.paths?.structures) {
    throw createConfigIncompleteError('Structure', key);
  }

  const baseDir = resolveStructuresBaseDir(config);
  const matches = await findFilesByName(baseDir, `${key}.json`);
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw LiferayErrors.resourceFileAmbiguous(`structure:${key}`, matches, {
      details: {key, type: 'structure', matches},
    });
  }

  throw LiferayErrors.resourceFileNotFound(`structure:${key} in ${baseDir} (use --file)`, {
    details: {key, type: 'structure', baseDir},
  });
}

export async function resolveTemplateArtifactFile(config: AppConfig, siteToken: string, key: string): Promise<string> {
  if (!config.paths?.templates) {
    throw createConfigIncompleteError('Template', key);
  }

  const baseDir = resolveTemplatesBaseDir(config);
  const candidates = [
    path.join(baseDir, siteToken, `${key}.ftl`),
    siteToken === 'global' ? null : path.join(baseDir, 'global', `${key}.ftl`),
    path.join(baseDir, `${key}.ftl`),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }

  const matches = await findFilesByName(baseDir, `${key}.ftl`);
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw LiferayErrors.resourceFileAmbiguous(`template:${key}`, matches, {
      details: {key, type: 'template', siteToken, matches},
    });
  }

  throw LiferayErrors.resourceFileNotFound(`template:${key} in ${baseDir} (use --file)`, {
    details: {key, type: 'template', siteToken, baseDir},
  });
}

export async function resolveAdtArtifactFile(config: AppConfig, key: string, widgetType: string): Promise<string> {
  if (!config.paths?.adts) {
    throw createConfigIncompleteError('ADT', key);
  }

  const baseDir = resolveAdtsBaseDir(config);
  const widgetDir = ADT_WIDGET_DIR_BY_TYPE[widgetType];
  if (!widgetDir) {
    throw LiferayErrors.resourceError(`widget-type ADT no soportado: ${widgetType}`);
  }

  const matches = await findFilesByPathSuffix(baseDir, path.join(widgetDir, `${key}.ftl`));
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw LiferayErrors.resourceFileAmbiguous(`adt:${key}:${widgetType}`, matches, {
      details: {key, type: 'adt', widgetType, matches},
    });
  }

  throw LiferayErrors.resourceFileNotFound(`adt:${key}:${widgetType} in ${baseDir} (use --file)`, {
    details: {key, type: 'adt', widgetType, baseDir},
  });
}

export async function resolveExistingArtifactFile(config: AppConfig, fileOverride: string): Promise<string> {
  const direct = path.resolve(fileOverride);
  if (await fs.pathExists(direct)) {
    return direct;
  }

  const relativeToBase = path.resolve(config.repoRoot ?? config.cwd, fileOverride);
  if (await fs.pathExists(relativeToBase)) {
    return relativeToBase;
  }

  for (const baseDir of [
    resolveStructuresBaseDir(config),
    resolveTemplatesBaseDir(config),
    resolveAdtsBaseDir(config),
  ]) {
    const nested = path.resolve(baseDir, fileOverride);
    if (await fs.pathExists(nested)) {
      return nested;
    }
  }

  throw LiferayErrors.resourceFileNotFound(fileOverride, {
    details: {candidate: fileOverride},
  });
}

export function detectFragmentsProjectRoot(startPath: string): string | undefined {
  let current = path.resolve(startPath);

  for (;;) {
    if (fs.existsSync(path.join(current, 'src'))) {
      return current;
    }

    if (path.basename(current).toLowerCase() === 'src') {
      return path.dirname(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function findFilesByName(baseDir: string, fileName: string): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }

  const matches: string[] = [];
  const queue = [baseDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === fileName) {
        matches.push(fullPath);
      }
    }
  }

  return matches;
}

async function findFilesByPathSuffix(baseDir: string, suffixPath: string): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }

  const normalizedSuffix = suffixPath.split(path.sep).join('/');
  const matches: string[] = [];
  await walk(baseDir, (entryPath) => {
    const normalized = entryPath.split(path.sep).join('/');
    if (normalized.endsWith(normalizedSuffix)) {
      matches.push(entryPath);
    }
  });
  return matches.sort();
}

async function walk(dir: string, visit: (entryPath: string) => void | Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, visit);
      continue;
    }
    if (entry.isFile()) {
      await visit(entryPath);
    }
  }
}
