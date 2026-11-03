import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {runLiferayResourceGetObject} from './liferay-resource-get-object.js';
import {defaultObjectDefinitionFile, serializeObjectDefinition} from './liferay-resource-object-shared.js';

export async function runLiferayResourceExportObject(
  config: AppConfig,
  options: {id: string; output?: string},
  dependencies?: ResourceDependencies,
): Promise<{outputPath: string; externalReferenceCode: string}> {
  const result = await runLiferayResourceGetObject(config, {id: options.id}, dependencies);
  const outputPath = path.resolve(options.output ?? defaultObjectDefinitionFile(config, result.externalReferenceCode));
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, serializeObjectDefinition(result.definition));

  return {outputPath, externalReferenceCode: result.externalReferenceCode};
}
