import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {runLiferayResourceGetPicklist} from './liferay-resource-get-picklist.js';
import {defaultPicklistFile, serializePicklist} from './liferay-resource-picklist-shared.js';

export async function runLiferayResourceExportPicklist(
  config: AppConfig,
  options: {id: string; output?: string},
  dependencies?: ResourceDependencies,
): Promise<{outputPath: string; externalReferenceCode: string}> {
  const result = await runLiferayResourceGetPicklist(config, {id: options.id}, dependencies);
  const outputPath = path.resolve(options.output ?? defaultPicklistFile(config, result.externalReferenceCode));
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, serializePicklist(result.picklist));

  return {outputPath, externalReferenceCode: result.externalReferenceCode};
}
