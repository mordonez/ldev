import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LIFERAY_RESOURCE_PATH_DEFAULTS} from '../../../core/config/liferay-resource-path-defaults.js';
import {LiferayErrors} from '../errors/index.js';
import {
  detectFragmentsProjectRoot,
  resolveAdtArtifactFile,
  resolveExistingArtifactFile,
  resolveStructureArtifactFile,
  resolveTemplateArtifactFile,
} from './artifact-file-lookup.js';

export function resolveSiteToken(siteFriendlyUrl: string): string {
  const token = siteFriendlyUrl.replace(/^\//, '').trim();
  return token === '' ? 'global' : token;
}

export function siteTokenToFriendlyUrl(token: string): string {
  return token === 'global' ? '/global' : `/${token}`;
}

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
    throw LiferayErrors.resourceRepoNotFound('project repository', {
      details: {hint: 'This command must be run inside a project repository.'},
    });
  }

  return config.repoRoot;
}

export function resolveRepoPath(config: AppConfig, relativePath: string): string {
  return path.resolve(requireRepoRoot(config), relativePath);
}

/**
 * Resolves a path relative to the repo root when available, falling back to cwd.
 * Use this instead of resolveRepoPath for resource file paths that should work
 * even when ldev is invoked outside a project repository (remote portal mode).
 */
export function resolveBasePath(config: AppConfig, relativePath: string): string {
  return path.resolve(config.repoRoot ?? config.cwd, relativePath);
}

export function tryResolveRepoPath(config: AppConfig, relativePath: string): string | undefined {
  if (!config.repoRoot) {
    return undefined;
  }

  return path.resolve(config.repoRoot, relativePath);
}

export function resolveStructuresBaseDir(config: AppConfig): string {
  return resolveBasePath(config, config.paths?.structures ?? LIFERAY_RESOURCE_PATH_DEFAULTS.structures);
}

export function resolveTemplatesBaseDir(config: AppConfig): string {
  return resolveBasePath(config, config.paths?.templates ?? LIFERAY_RESOURCE_PATH_DEFAULTS.templates);
}

export function resolveAdtsBaseDir(config: AppConfig): string {
  return resolveBasePath(config, config.paths?.adts ?? LIFERAY_RESOURCE_PATH_DEFAULTS.adts);
}

export function resolveFragmentsBaseDir(config: AppConfig): string {
  return resolveBasePath(config, config.paths?.fragments ?? LIFERAY_RESOURCE_PATH_DEFAULTS.fragments);
}

export function tryResolveFragmentsBaseDir(config: AppConfig): string | undefined {
  return tryResolveRepoPath(config, config.paths?.fragments ?? LIFERAY_RESOURCE_PATH_DEFAULTS.fragments);
}

export function resolveMigrationsBaseDir(config: AppConfig): string {
  return resolveBasePath(config, config.paths?.migrations ?? LIFERAY_RESOURCE_PATH_DEFAULTS.migrations);
}

export function resolveObjectsBaseDir(config: AppConfig): string {
  return resolveBasePath(config, config.paths?.objects ?? LIFERAY_RESOURCE_PATH_DEFAULTS.objects);
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

export function sanitizeArtifactToken(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9_.-]+/g, '_')
    .replaceAll(/_+/g, '_');
  return normalized === '' ? 'unnamed' : normalized;
}

export function resolveArtifactBaseDir(config: AppConfig, type: ArtifactType, dirOverride?: string): string {
  if (dirOverride?.trim()) {
    return path.resolve(resolveBasePath(config, dirOverride));
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

export function tryResolveArtifactBaseDir(
  config: AppConfig,
  type: ArtifactType,
  dirOverride?: string,
): string | undefined {
  if (dirOverride?.trim()) {
    return tryResolveRepoPath(config, dirOverride);
  }

  switch (type) {
    case 'template':
      return tryResolveRepoPath(config, config.paths?.templates ?? LIFERAY_RESOURCE_PATH_DEFAULTS.templates);
    case 'structure':
      return tryResolveRepoPath(config, config.paths?.structures ?? LIFERAY_RESOURCE_PATH_DEFAULTS.structures);
    case 'adt':
      return tryResolveRepoPath(config, config.paths?.adts ?? LIFERAY_RESOURCE_PATH_DEFAULTS.adts);
    case 'fragment':
      return tryResolveFragmentsBaseDir(config);
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

export async function resolveStructureFile(config: AppConfig, key: string, file?: string): Promise<string> {
  return resolveArtifactFile(config, {type: 'structure', key, fileOverride: file});
}

export async function resolveTemplateFile(
  config: AppConfig,
  siteToken: string,
  name: string,
  file?: string,
): Promise<string> {
  return resolveArtifactFile(config, {type: 'template', key: name, siteToken, fileOverride: file});
}

export async function resolveAdtFile(
  config: AppConfig,
  name: string,
  widgetType: string,
  file?: string,
): Promise<string> {
  return resolveArtifactFile(config, {type: 'adt', key: name, widgetType, fileOverride: file});
}

export function resolveArtifactSiteDir(
  config: AppConfig,
  type: ArtifactType,
  siteToken: string,
  dirOverride?: string,
): string {
  if (type === 'fragment') {
    if (dirOverride?.trim()) {
      return path.resolve(resolveBasePath(config, dirOverride));
    }
    return path.join(resolveFragmentsBaseDir(config), 'sites', siteToken);
  }
  return path.join(resolveArtifactBaseDir(config, type, dirOverride), siteToken);
}

export function tryResolveArtifactSiteDir(
  config: AppConfig,
  type: ArtifactType,
  siteToken: string,
  dirOverride?: string,
): string | undefined {
  if (type === 'fragment') {
    if (dirOverride?.trim()) {
      return tryResolveRepoPath(config, dirOverride);
    }

    const fragmentsBaseDir = tryResolveFragmentsBaseDir(config);
    return fragmentsBaseDir ? path.join(fragmentsBaseDir, 'sites', siteToken) : undefined;
  }

  const baseDir = tryResolveArtifactBaseDir(config, type, dirOverride);
  return baseDir ? path.join(baseDir, siteToken) : undefined;
}

export function resolveFragmentProjectDir(config: AppConfig, siteToken: string, dirOverride?: string): string {
  if ((dirOverride ?? '').trim() === '') {
    return resolveArtifactSiteDir(config, 'fragment', siteToken);
  }

  const configuredDir = (dirOverride ?? '').trim();
  const configured = path.resolve(resolveBasePath(config, configuredDir));
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
