import type {AppConfig} from '../../../core/config/load-config.js';

export {
  ADT_WIDGET_DIR_BY_TYPE,
  requireRepoRoot,
  resolveAdtsBaseDir,
  resolveArtifactBaseDir,
  resolveArtifactSiteDir,
  resolveFragmentsBaseDir,
  resolveMigrationsBaseDir,
  resolveRepoPath,
  resolveSiteToken,
  resolveStructuresBaseDir,
  resolveTemplatesBaseDir,
  siteTokenToFriendlyUrl,
} from './artifact-paths.js';

import {resolveArtifactFile} from './artifact-paths.js';

export async function resolveStructureFile(config: AppConfig, key: string, file?: string): Promise<string> {
  return resolveArtifactFile(config, {
    type: 'structure',
    key,
    fileOverride: file,
  });
}

export async function resolveTemplateFile(
  config: AppConfig,
  siteToken: string,
  name: string,
  file?: string,
): Promise<string> {
  return resolveArtifactFile(config, {
    type: 'template',
    key: name,
    siteToken,
    fileOverride: file,
  });
}

export async function resolveAdtFile(
  config: AppConfig,
  name: string,
  widgetType: string,
  file?: string,
): Promise<string> {
  return resolveArtifactFile(config, {
    type: 'adt',
    key: name,
    widgetType,
    fileOverride: file,
  });
}
