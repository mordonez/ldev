import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';

export const ADT_WIDGET_DIR_BY_TYPE: Record<string, string> = {
  'asset-entry': 'asset_entry',
  breadcrumb: 'breadcrumb',
  'category-facet': 'category_facet',
  'custom-facet': 'custom_facet',
  'custom-filter': 'custom_filter',
  'language-selector': 'language_selector',
  'navigation-menu': 'navigation_menu',
  'search-result-summary': 'search_result_summary',
  searchbar: 'searchbar',
  'similar-results': 'search_results',
};

export function requireRepoRoot(config: AppConfig): string {
  if (!config.repoRoot) {
    throw new CliError('This command must be run inside a project repository.', {
      code: 'LIFERAY_REPO_NOT_FOUND',
    });
  }

  return config.repoRoot;
}

export function resolveRepoPath(config: AppConfig, relativePath: string): string {
  return path.resolve(requireRepoRoot(config), relativePath);
}

export function resolveStructuresBaseDir(config: AppConfig): string {
  return resolveRepoPath(config, config.paths?.structures ?? 'liferay/resources/journal/structures');
}

export function resolveTemplatesBaseDir(config: AppConfig): string {
  return resolveRepoPath(config, config.paths?.templates ?? 'liferay/resources/journal/templates');
}

export function resolveAdtsBaseDir(config: AppConfig): string {
  return resolveRepoPath(config, config.paths?.adts ?? 'liferay/resources/templates/application_display');
}

export function resolveFragmentsBaseDir(config: AppConfig): string {
  return resolveRepoPath(config, config.paths?.fragments ?? 'liferay/fragments');
}

export function resolveMigrationsBaseDir(config: AppConfig): string {
  return resolveRepoPath(config, config.paths?.migrations ?? 'liferay/resources/journal/migrations');
}

export async function resolveStructureFile(config: AppConfig, key: string, file?: string): Promise<string> {
  if (file) {
    return resolveExistingResourceFile(config, file);
  }

  // Detect missing configuration before searching
  if (!config.paths?.structures) {
    throw new CliError(
      `Structure file not found for key '${key}'.\n\n` +
        `The project configuration is incomplete. To resolve this:\n` +
        `  1. Use --file to specify the full path directly (quick workaround)\n` +
        `  2. Create .liferay-cli.yml in the repository root with paths configuration\n` +
        `  3. Run 'ldev project init' to scaffold the configuration file\n\n` +
        `See: https://ldev.dev/reference/configuration#liferay-cli-yml`,
      {code: 'LIFERAY_CONFIG_INCOMPLETE'},
    );
  }

  const baseDir = resolveStructuresBaseDir(config);
  const matches = await findFilesByName(baseDir, `${key}.json`);
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new CliError(`Structure file ambiguo para ${key}: ${matches.join(', ')}`, {
      code: 'LIFERAY_RESOURCE_FILE_AMBIGUOUS',
    });
  }

  throw new CliError(`Structure file not found for ${key} in ${baseDir}. Use --file.`, {
    code: 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
  });
}

export async function resolveTemplateFile(
  config: AppConfig,
  siteToken: string,
  name: string,
  file?: string,
): Promise<string> {
  if (file) {
    return resolveExistingResourceFile(config, file);
  }

  // Detect missing configuration before searching
  if (!config.paths?.templates) {
    throw new CliError(
      `Template file not found for '${name}'.\n\n` +
        `The project configuration is incomplete. To resolve this:\n` +
        `  1. Use --file to specify the full path directly (quick workaround)\n` +
        `  2. Create .liferay-cli.yml in the repository root with paths configuration\n` +
        `  3. Run 'ldev project init' to scaffold the configuration file\n\n` +
        `See: https://ldev.dev/reference/configuration#liferay-cli-yml`,
      {code: 'LIFERAY_CONFIG_INCOMPLETE'},
    );
  }

  const baseDir = resolveTemplatesBaseDir(config);
  const candidates = [
    path.join(baseDir, siteToken, `${name}.ftl`),
    siteToken === 'global' ? null : path.join(baseDir, 'global', `${name}.ftl`),
    path.join(baseDir, `${name}.ftl`),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }

  const matches = await findFilesByName(baseDir, `${name}.ftl`);
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new CliError(`Template file ambiguo para ${name}: ${matches.join(', ')}`, {
      code: 'LIFERAY_RESOURCE_FILE_AMBIGUOUS',
    });
  }

  throw new CliError(`Template file not found for ${name} in ${baseDir}. Use --file.`, {
    code: 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
  });
}

export async function resolveAdtFile(
  config: AppConfig,
  name: string,
  widgetType: string,
  file?: string,
): Promise<string> {
  if (file) {
    return resolveExistingResourceFile(config, file);
  }

  // Detect missing configuration before searching
  if (!config.paths?.adts) {
    throw new CliError(
      `ADT file not found for '${name}' (${widgetType}).\n\n` +
        `The project configuration is incomplete. To resolve this:\n` +
        `  1. Use --file to specify the full path directly (quick workaround)\n` +
        `  2. Create .liferay-cli.yml in the repository root with paths configuration\n` +
        `  3. Run 'ldev project init' to scaffold the configuration file\n\n` +
        `See: https://ldev.dev/reference/configuration#liferay-cli-yml`,
      {code: 'LIFERAY_CONFIG_INCOMPLETE'},
    );
  }

  const baseDir = resolveAdtsBaseDir(config);
  const widgetDir = ADT_WIDGET_DIR_BY_TYPE[widgetType];
  if (!widgetDir) {
    throw new CliError(`widget-type ADT no soportado: ${widgetType}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  const matches = await findFilesByPathSuffix(baseDir, path.join(widgetDir, `${name}.ftl`));
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new CliError(`ADT file ambiguo para ${name} (${widgetType}): ${matches.join(', ')}`, {
      code: 'LIFERAY_RESOURCE_FILE_AMBIGUOUS',
    });
  }

  throw new CliError(`ADT file not found for ${name} (${widgetType}) in ${baseDir}. Use --file.`, {
    code: 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
  });
}

export function resolveSiteToken(siteFriendlyUrl: string): string {
  const token = siteFriendlyUrl.replace(/^\//, '').trim();
  return token === '' ? 'global' : token;
}

async function resolveExistingResourceFile(config: AppConfig, candidate: string): Promise<string> {
  const repoRoot = requireRepoRoot(config);
  const direct = path.resolve(candidate);
  if (await fs.pathExists(direct)) {
    return direct;
  }

  const relativeToRepo = path.resolve(repoRoot, candidate);
  if (await fs.pathExists(relativeToRepo)) {
    return relativeToRepo;
  }

  for (const baseDir of [
    resolveStructuresBaseDir(config),
    resolveTemplatesBaseDir(config),
    resolveAdtsBaseDir(config),
  ]) {
    const nested = path.resolve(baseDir, candidate);
    if (await fs.pathExists(nested)) {
      return nested;
    }
  }

  throw new CliError(`File not found: ${candidate}`, {
    code: 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
  });
}

async function findFilesByName(baseDir: string, filename: string): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }

  const matches: string[] = [];
  await walk(baseDir, async (entryPath) => {
    if (path.basename(entryPath) === filename) {
      matches.push(entryPath);
    }
  });
  return matches.sort();
}

async function findFilesByPathSuffix(baseDir: string, suffixPath: string): Promise<string[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }

  const normalizedSuffix = suffixPath.split(path.sep).join('/');
  const matches: string[] = [];
  await walk(baseDir, async (entryPath) => {
    const normalized = entryPath.split(path.sep).join('/');
    if (normalized.endsWith(normalizedSuffix)) {
      matches.push(entryPath);
    }
  });
  return matches.sort();
}

async function walk(dir: string, visit: (entryPath: string) => Promise<void>): Promise<void> {
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
