import type {AppConfig} from '../../../core/config/load-config.js';
import path from 'node:path';
import {resolveSiteToken} from '../portal/artifact-paths.js';
import {runLiferayResourceGetTemplate} from './liferay-resource-get-template.js';
import fs from 'fs-extra';
import {normalizeLiferayTemplateScript} from './liferay-resource-template-normalize.js';
import {resolveArtifactSiteDir} from '../portal/artifact-paths.js';
import type {ResourceImportDependencies as ResourceImportDependencies} from './liferay-resource-artifact-shared.js';

export async function runLiferayResourceExportTemplate(
  config: AppConfig,
  options: {site?: string; id: string; output?: string},
  dependencies?: ResourceImportDependencies,
): Promise<{outputPath: string}> {
  const result = await runLiferayResourceGetTemplate(config, {site: options.site, id: options.id}, dependencies);
  const siteToken = resolveSiteToken(result.siteFriendlyUrl);
  const outputPath = path.resolve(
    options.output ?? path.join(resolveArtifactSiteDir(config, 'template', siteToken), `${result.templateKey}.ftl`),
  );
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, normalizeLiferayTemplateScript(result.templateScript));

  return {outputPath};
}
