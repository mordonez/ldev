/**
 * Liferay template import.
 *
 * Imports a local template file into a remote Liferay instance.
 * Uses ImportEngine with template-specific import strategy.
 *
 * Public API maintained for backward compatibility:
 * - runLiferayResourceImportTemplate: main entry point
 * - formatLiferayResourceImportTemplate: format result for output
 */

import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResourceImportDependencies, ImportArtifactResult} from './liferay-resource-artifact-shared.js';
import {resolveResourceSite} from './liferay-resource-shared.js';
import {
  resolveSiteToken,
  resolveTemplateFile,
  resolveTemplatesBaseDir,
  siteTokenToFriendlyUrl,
} from '../portal/artifact-paths.js';
import {runImportArtifact} from './import-engine.js';
import {templateImportStrategy} from './import-strategies/template-import-strategy.js';

export type LiferayResourceImportTemplateResult = ImportArtifactResult & {
  templateFile: string;
  siteId: number;
  siteFriendlyUrl: string;
};

/**
 * Sync a template from local filesystem to remote Liferay instance.
 *
 * @param config App configuration with Liferay URL and credentials
 * @param options Sync options (site, key, file, structure, flags)
 * @param dependencies Optional DI for API client and token client
 * @returns Sync result with status, id, file path, and site info
 */
export async function runLiferayResourceImportTemplate(
  config: AppConfig,
  options: {
    site?: string;
    key: string;
    file?: string;
    structureKey?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
  },
  dependencies?: ResourceImportDependencies,
): Promise<LiferayResourceImportTemplateResult> {
  const site = await resolveResourceSite(config, inferTemplateSite(config, options) ?? '/global', dependencies);

  // Use ImportEngine with template import strategy
  const engineResult = await runImportArtifact(
    config,
    site,
    templateImportStrategy,
    {
      checkOnly: options.checkOnly,
      createMissing: options.createMissing,
      strategyOptions: {
        key: options.key,
        file: options.file,
        structureKey: options.structureKey,
      },
    },
    dependencies,
  );

  // Resolve templateFile from strategy for result
  const siteToken = resolveSiteToken(site.friendlyUrlPath);
  const templateFile = await resolveTemplateFile(config, siteToken, options.key, options.file);

  // Return result with extended fields for backward compatibility
  return {
    ...engineResult,
    templateFile,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
  };
}

/**
 * Format template sync result for console output.
 */
export function formatLiferayResourceImportTemplate(result: LiferayResourceImportTemplateResult): string {
  return [
    `${result.status}\t${result.name}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.templateFile}`,
  ].join('\n');
}

function inferTemplateSite(
  config: AppConfig,
  options: {
    site?: string;
    file?: string;
  },
): string | undefined {
  if (options.site?.trim()) {
    return options.site;
  }

  const file = options.file?.trim();
  if (!file) {
    return undefined;
  }

  const baseDir = resolveTemplatesBaseDir(config);
  const candidates = [path.resolve(file)];
  if (config.repoRoot) {
    candidates.push(path.resolve(config.repoRoot, file));
  }

  for (const candidate of candidates) {
    const relative = path.relative(baseDir, candidate);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      continue;
    }

    const segments = relative.split(path.sep).filter(Boolean);
    if (segments.length === 1) {
      return '/global';
    }

    return siteTokenToFriendlyUrl(segments[0]);
  }

  return undefined;
}
