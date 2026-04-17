import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import path from 'node:path';
import {resolveSiteToken} from './liferay-resource-paths.js';
import {runLiferayResourceGetTemplate} from './liferay-resource-get-template.js';
import fs from 'fs-extra';
import {normalizeLiferayTemplateScript} from './liferay-resource-template-normalize.js';
import {resolveArtifactSiteDir} from './artifact-paths.js';

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export async function runLiferayResourceExportTemplate(
  config: AppConfig,
  options: {site?: string; id: string; output?: string},
  dependencies?: ResourceDependencies,
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
