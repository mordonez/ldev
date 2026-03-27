import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/liferay/auth.js';
import type {LiferayApiClient} from '../../core/liferay/client.js';
import path from 'node:path';
import {resolveSiteToken, resolveTemplatesBaseDir} from './liferay-resource-paths.js';
import {runLiferayResourceGetTemplate} from './liferay-resource-get-template.js';
import fs from 'fs-extra';
import {normalizeLiferayTemplateScript} from './liferay-resource-template-normalize.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export async function runLiferayResourceExportTemplate(
  config: AppConfig,
  options: {site?: string; id: string; output?: string},
  dependencies?: ResourceDependencies,
): Promise<{outputPath: string}> {
  const result = await runLiferayResourceGetTemplate(
    config,
    {site: options.site, id: options.id},
    dependencies,
  );
  const outputPath = path.resolve(options.output ?? buildDefaultOutputPath(config, result.siteFriendlyUrl, result.templateKey));
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, normalizeLiferayTemplateScript(result.templateScript));

  return {outputPath};
}

function buildDefaultOutputPath(config: AppConfig, siteFriendlyUrl: string, templateKey: string): string {
  return path.join(resolveTemplatesBaseDir(config), resolveSiteToken(siteFriendlyUrl), `${templateKey}.ftl`);
}
