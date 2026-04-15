import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';

export type ArtifactType = 'template' | 'structure' | 'adt' | 'fragment';

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

export function resolveSiteToken(siteFriendlyUrl: string): string {
  const token = siteFriendlyUrl.replace(/^\//, '').trim();
  return token === '' ? 'global' : token;
}

/** Inverse of resolveSiteToken: converts a directory token back to a site friendly URL. */
export function siteTokenToFriendlyUrl(token: string): string {
  return token === 'global' ? '/global' : `/${token}`;
}

type ResolveArtifactFileOptions =
  | {
      type: 'structure';
      key: string;
      fileOverride?: string;
    }
  | {
      type: 'template';
      key: string;
      siteToken: string;
      fileOverride?: string;
    }
  | {
      type: 'adt';
      key: string;
      widgetType: string;
      fileOverride?: string;
    };

/**
 * Sanitizes a value for use as a file/directory token.
 * Consolidates the duplicated sanitizeFileToken helper across export modules.
 */
export function sanitizeArtifactToken(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9_.-]+/g, '_')
    .replaceAll(/_+/g, '_');
  return normalized === '' ? 'unnamed' : normalized;
}

/**
 * Resolves the base directory for an artifact type, without a site subdirectory.
 * Used for bulk exports that iterate multiple sites and append siteToken per iteration.
 *
 * - templates / structures / adt: returns the configured type base dir (or dirOverride resolved)
 * - fragment: returns the fragments base dir (or dirOverride); the 'sites/{token}' subdir
 *   is appended by resolveArtifactSiteDir
 */
export function resolveArtifactBaseDir(config: AppConfig, type: ArtifactType, dirOverride?: string): string {
  if (dirOverride?.trim()) {
    return path.resolve(resolveRepoPath(config, dirOverride));
  }
  switch (type) {
    case 'template':
      return resolveTemplatesBaseDir(config);
    case 'structure':
      return resolveStructuresBaseDir(config);
    case 'adt':
      return resolveAdtsBaseDir(config);
    case 'fragment':
      return resolveFragmentsBaseDir(config);
  }
}

export async function resolveArtifactFile(config: AppConfig, options: ResolveArtifactFileOptions): Promise<string> {
  if (options.fileOverride) {
    return resolveExistingArtifactFile(config, options.fileOverride);
  }

  switch (options.type) {
    case 'structure':
      return resolveStructureArtifactFile(config, options.key);
    case 'template':
      return resolveTemplateArtifactFile(config, options.siteToken, options.key);
    case 'adt':
      return resolveAdtArtifactFile(config, options.key, options.widgetType);
  }
}

/**
 * Resolves the output directory for a specific site+type combination.
 *
 * - templates / structures / adt: (dirOverride ?? typeBaseDir) / siteToken
 * - fragment: uses historical 'sites/' prefix → fragmentsBaseDir / sites / siteToken
 *   When dirOverride is provided for fragments, uses dirOverride directly
 *   (preserves legacy --dir behavior where the dir IS the project root for that site).
 */
export function resolveArtifactSiteDir(
  config: AppConfig,
  type: ArtifactType,
  siteToken: string,
  dirOverride?: string,
): string {
  if (type === 'fragment') {
    if (dirOverride?.trim()) {
      return path.resolve(resolveRepoPath(config, dirOverride));
    }
    return path.join(resolveFragmentsBaseDir(config), 'sites', siteToken);
  }
  return path.join(resolveArtifactBaseDir(config, type, dirOverride), siteToken);
}

export function resolveFragmentProjectDir(config: AppConfig, siteToken: string, dirOverride?: string): string {
  if ((dirOverride ?? '').trim() === '') {
    return resolveArtifactSiteDir(config, 'fragment', siteToken);
  }

  const configuredDir = (dirOverride ?? '').trim();
  const configured = path.resolve(resolveRepoPath(config, configuredDir));
  const detectedFromConfigured = detectFragmentsProjectRoot(configured);
  if (detectedFromConfigured) {
    return detectedFromConfigured;
  }

  const configuredWithSite = path.join(configured, siteToken);
  const detectedFromSitePath = detectFragmentsProjectRoot(configuredWithSite);
  if (detectedFromSitePath) {
    return detectedFromSitePath;
  }

  return configuredWithSite;
}

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

async function resolveStructureArtifactFile(config: AppConfig, key: string): Promise<string> {
  if (!config.paths?.structures) {
    throw createConfigIncompleteError('Structure', key);
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

async function resolveTemplateArtifactFile(config: AppConfig, siteToken: string, key: string): Promise<string> {
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
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new CliError(`Template file ambiguo para ${key}: ${matches.join(', ')}`, {
      code: 'LIFERAY_RESOURCE_FILE_AMBIGUOUS',
    });
  }

  throw new CliError(`Template file not found for ${key} in ${baseDir}. Use --file.`, {
    code: 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
  });
}

async function resolveAdtArtifactFile(config: AppConfig, key: string, widgetType: string): Promise<string> {
  if (!config.paths?.adts) {
    throw createConfigIncompleteError(`ADT (${widgetType})`, key);
  }

  const baseDir = resolveAdtsBaseDir(config);
  const widgetDir = ADT_WIDGET_DIR_BY_TYPE[widgetType];
  if (!widgetDir) {
    throw new CliError(`widget-type ADT no soportado: ${widgetType}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  const matches = await findFilesByPathSuffix(baseDir, path.join(widgetDir, `${key}.ftl`));
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new CliError(`ADT file ambiguo para ${key} (${widgetType}): ${matches.join(', ')}`, {
      code: 'LIFERAY_RESOURCE_FILE_AMBIGUOUS',
    });
  }

  throw new CliError(`ADT file not found for ${key} (${widgetType}) in ${baseDir}. Use --file.`, {
    code: 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
  });
}

async function resolveExistingArtifactFile(config: AppConfig, candidate: string): Promise<string> {
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

function detectFragmentsProjectRoot(startPath: string): string | null {
  let current = path.resolve(startPath);

  while (true) {
    if (fs.existsSync(path.join(current, 'src'))) {
      return current;
    }

    if (path.basename(current).toLowerCase() === 'src') {
      return path.dirname(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
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
