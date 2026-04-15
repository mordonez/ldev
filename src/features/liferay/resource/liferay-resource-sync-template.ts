/**
 * Liferay template synchronization.
 *
 * Syncs a local template file with remote Liferay instance.
 * Uses generic SyncEngine with template-specific strategy.
 *
 * Public API maintained for backward compatibility:
 * - runLiferayResourceSyncTemplate: main entry point
 * - formatLiferayResourceSyncTemplate: format result for output
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResourceSyncDependencies, ResourceSyncResult} from './liferay-resource-sync-shared.js';
import {resolveResourceSite} from './liferay-resource-shared.js';
import {resolveSiteToken, resolveTemplateFile} from './liferay-resource-paths.js';
import {syncArtifact} from './sync-engine.js';
import {templateSyncStrategy} from './sync-strategies/template-sync-strategy.js';

export type LiferayResourceSyncTemplateResult = ResourceSyncResult & {
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
export async function runLiferayResourceSyncTemplate(
  config: AppConfig,
  options: {
    site?: string;
    key: string;
    file?: string;
    structureKey?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncTemplateResult> {
  const site = await resolveResourceSite(config, options.site ?? '/global', dependencies);

  // Use SyncEngine with template strategy
  const engineResult = await syncArtifact(
    config,
    site,
    templateSyncStrategy,
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
export function formatLiferayResourceSyncTemplate(result: LiferayResourceSyncTemplateResult): string {
  return [
    `${result.status}\t${result.name}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.templateFile}`,
  ].join('\n');
}
