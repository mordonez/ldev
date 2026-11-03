import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {asRecords, findObjectDefinition, normalizeObjectDefinition, textOf} from './liferay-resource-object-shared.js';

export type LiferayResourceObjectResult = {
  id: number;
  externalReferenceCode: string;
  name: string;
  className: string;
  scope: string;
  status: string;
  fieldNames: string[];
  relationshipNames: string[];
  picklists: string[];
  /** Portable definition, as written by export-object. */
  definition: Record<string, unknown>;
};

export async function runLiferayResourceGetObject(
  config: AppConfig,
  options: {id: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceObjectResult> {
  const raw = await findObjectDefinition(config, options.id, dependencies);
  if (!raw) {
    throw LiferayErrors.resourceError(`Object definition not found: ${options.id}`);
  }

  const definition = normalizeObjectDefinition(raw);
  const fields = asRecords(definition.objectFields);

  return {
    id: Number(raw.id ?? -1),
    externalReferenceCode: String(raw.externalReferenceCode ?? ''),
    name: String(raw.name ?? ''),
    className: textOf(raw.className),
    scope: textOf(raw.scope),
    status: String(raw.status?.label ?? ''),
    fieldNames: fields.map((field) => String(field.name)),
    relationshipNames: asRecords(definition.objectRelationships).map((rel) => String(rel.name)),
    picklists: [
      ...new Set(
        fields.map((field) => textOf(field.listTypeDefinitionExternalReferenceCode)).filter((erc) => erc !== ''),
      ),
    ],
    definition,
  };
}

export function formatLiferayResourceObject(result: LiferayResourceObjectResult): string {
  return [
    'RESOURCE_OBJECT',
    `id=${result.id}`,
    `externalReferenceCode=${result.externalReferenceCode}`,
    `name=${result.name}`,
    `className=${result.className}`,
    `scope=${result.scope}`,
    `status=${result.status}`,
    `fields=${result.fieldNames.join(',')}`,
    `relationships=${result.relationshipNames.join(',')}`,
    `picklists=${result.picklists.join(',')}`,
  ].join('\n');
}
