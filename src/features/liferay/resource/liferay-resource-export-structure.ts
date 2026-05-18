import type {AppConfig} from '../../../core/config/load-config.js';
import {resolveSiteToken} from '../portal/artifact-paths.js';
import {runLiferayResourceGetStructure} from './liferay-resource-get-structure.js';
import {writeLiferayResourceFile} from './liferay-resource-export-shared.js';
import {normalizeLiferayStructurePayload} from './liferay-resource-structure-normalize.js';
import path from 'node:path';
import {resolveArtifactSiteDir} from '../portal/artifact-paths.js';
import type {ResourceImportDependencies as ResourceImportDependencies} from './liferay-resource-artifact-shared.js';

export async function runLiferayResourceExportStructure(
  config: AppConfig,
  options: {site?: string; key?: string; id?: string; output?: string; pretty?: boolean},
  dependencies?: ResourceImportDependencies,
): Promise<{outputPath: string}> {
  const result = await runLiferayResourceGetStructure(
    config,
    {site: options.site, key: options.key, id: options.id},
    dependencies,
  );
  const siteToken = resolveSiteToken(result.siteFriendlyUrl);
  const outputPath = await writeLiferayResourceFile(
    result.raw,
    options.output ?? path.join(resolveArtifactSiteDir(config, 'structure', siteToken), `${result.key}.json`),
    {
      payloadNormalizer: normalizeLiferayStructurePayload,
      pretty: options.pretty,
    },
  );

  return {outputPath};
}
