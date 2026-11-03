import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {asRecords, textOf} from './liferay-resource-object-diff.js';
import {findPicklist, normalizePicklist} from './liferay-resource-picklist-shared.js';

export type LiferayResourcePicklistResult = {
  id: number;
  externalReferenceCode: string;
  name: string;
  entryKeys: string[];
  /** Portable picklist, as written by export-picklist. */
  picklist: Record<string, unknown>;
};

export async function runLiferayResourceGetPicklist(
  config: AppConfig,
  options: {id: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourcePicklistResult> {
  const raw = await findPicklist(config, options.id, dependencies);
  if (!raw) {
    throw LiferayErrors.resourceError(`Picklist not found: ${options.id}`);
  }

  const picklist = normalizePicklist(raw);
  return {
    id: Number(raw.id ?? -1),
    externalReferenceCode: textOf(raw.externalReferenceCode),
    name: textOf(raw.name),
    entryKeys: asRecords(picklist.listTypeEntries).map((entry) => textOf(entry.key)),
    picklist,
  };
}

export function formatLiferayResourcePicklist(result: LiferayResourcePicklistResult): string {
  return [
    'RESOURCE_PICKLIST',
    `id=${result.id}`,
    `externalReferenceCode=${result.externalReferenceCode}`,
    `name=${result.name}`,
    `entries=${result.entryKeys.join(',')}`,
  ].join('\n');
}
