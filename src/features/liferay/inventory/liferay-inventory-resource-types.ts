/**
 * Inventories for the client-extension-first resource types, keyed by ERC:
 * object definitions, picklists, taxonomy vocabularies, workspace client
 * extensions (with OSGi state) and asset libraries ("spaces").
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import {
  listWorkspaceClientExtensions,
  readBundleStates,
  type BundleState,
} from '../../../core/runtime/client-extensions.js';
import {resolveSite} from '../portal/site-resolution.js';
import type {ResourceDependencies} from '../resource/liferay-resource-artifact-shared.js';
import {listAllPages} from '../resource/liferay-resource-headless-shared.js';
import {asRecords, normalizeObjectDefinition, textOf} from '../resource/liferay-resource-object-diff.js';
import {listObjectDefinitions, listObjectRelationships} from '../resource/liferay-resource-object-shared.js';
import {LIST_TYPE_ADMIN_BASE, listPicklists} from '../resource/liferay-resource-picklist-shared.js';

export type InventoryObjectDefinition = {
  id: number;
  externalReferenceCode: string;
  name: string;
  scope: string;
  status: string;
  restContextPath: string;
  fields: string[];
  relationships: {name: string; type: string; target: string}[];
  picklists: string[];
};

export type InventoryPicklist = {id: number; externalReferenceCode: string; name: string; entryKeys: string[]};

export type InventoryVocabulary = {
  id: number;
  externalReferenceCode: string;
  name: string;
  categories: number;
  assetTypes: string[];
};

export type InventoryClientExtension = {
  name: string;
  types: string[];
  bundle: string;
  state: string;
  batchFiles: string[];
};

export type InventorySpace = {id: number; externalReferenceCode: string; name: string; type: string | null};

export async function runLiferayInventoryObjects(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<{inventoryType: 'objects'; count: number; objects: InventoryObjectDefinition[]}> {
  const objects: InventoryObjectDefinition[] = [];
  for (const raw of await listObjectDefinitions(config, dependencies)) {
    const relationships = await listObjectRelationships(config, Number(raw.id), dependencies);
    const definition = normalizeObjectDefinition({...raw, objectRelationships: relationships});
    const fields = asRecords(definition.objectFields);
    objects.push({
      id: Number(raw.id),
      externalReferenceCode: textOf(raw.externalReferenceCode),
      name: textOf(raw.name),
      scope: textOf(raw.scope),
      status: textOf(raw.status?.label),
      restContextPath: textOf(raw.restContextPath),
      fields: fields.map((field) => textOf(field.name)),
      relationships: asRecords(definition.objectRelationships).map((rel) => ({
        name: textOf(rel.name),
        type: textOf(rel.type),
        target: textOf(rel.objectDefinitionExternalReferenceCode2),
      })),
      picklists: [
        ...new Set(fields.map((field) => textOf(field.listTypeDefinitionExternalReferenceCode)).filter(Boolean)),
      ],
    });
  }
  objects.sort((a, b) => a.externalReferenceCode.localeCompare(b.externalReferenceCode));
  return {inventoryType: 'objects', count: objects.length, objects};
}

export async function runLiferayInventoryPicklists(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<{inventoryType: 'picklists'; count: number; picklists: InventoryPicklist[]}> {
  const picklists: InventoryPicklist[] = [];
  for (const raw of await listPicklists(config, dependencies)) {
    const entries = await listAllPages<Record<string, unknown>>(
      config,
      `${LIST_TYPE_ADMIN_BASE}/list-type-definitions/${Number(raw.id)}/list-type-entries`,
      'inventory-picklist-entries',
      dependencies,
    );
    picklists.push({
      id: Number(raw.id),
      externalReferenceCode: textOf(raw.externalReferenceCode),
      name: textOf(raw.name),
      entryKeys: entries.map((entry) => textOf(entry.key)).sort(),
    });
  }
  picklists.sort((a, b) => a.externalReferenceCode.localeCompare(b.externalReferenceCode));
  return {inventoryType: 'picklists', count: picklists.length, picklists};
}

/** Company-wide vocabularies live in the global site, hence the default. */
export async function runLiferayInventoryVocabularies(
  config: AppConfig,
  options: {site?: string},
  dependencies?: ResourceDependencies,
): Promise<{
  inventoryType: 'vocabularies';
  siteFriendlyUrl: string;
  count: number;
  vocabularies: InventoryVocabulary[];
}> {
  const site = await resolveSite(config, options.site ?? '/global', dependencies);
  const vocabularies = (
    await listAllPages<Record<string, unknown>>(
      config,
      `/o/headless-admin-taxonomy/v1.0/sites/${site.id}/taxonomy-vocabularies`,
      'inventory-vocabularies',
      dependencies,
    )
  )
    .map((raw) => ({
      id: Number(raw.id),
      externalReferenceCode: textOf(raw.externalReferenceCode),
      name: textOf(raw.name),
      categories: Number(raw.numberOfTaxonomyCategories ?? 0),
      assetTypes: asRecords(raw.assetTypes).map((assetType) => textOf(assetType.type)),
    }))
    .sort((a, b) => a.externalReferenceCode.localeCompare(b.externalReferenceCode));
  return {
    inventoryType: 'vocabularies',
    siteFriendlyUrl: site.friendlyUrlPath,
    count: vocabularies.length,
    vocabularies,
  };
}

export async function runLiferayInventoryClientExtensions(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<{inventoryType: 'client-extensions'; count: number; clientExtensions: InventoryClientExtension[]}> {
  const workspace = config.liferayDir ? await listWorkspaceClientExtensions(config.liferayDir) : [];
  const bundles: Map<string, BundleState> =
    workspace.length > 0 ? await readBundleStates(config, options?.processEnv) : new Map<string, BundleState>();
  const clientExtensions = workspace.map((cx) => ({
    name: cx.project,
    types: cx.entries.map((entry) => entry.type),
    bundle: cx.bundleSymbolicName,
    state: bundles.get(cx.bundleSymbolicName)?.state ?? 'NOT_DEPLOYED',
    batchFiles: cx.batchFiles,
  }));
  return {inventoryType: 'client-extensions', count: clientExtensions.length, clientExtensions};
}

export async function runLiferayInventorySpaces(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<{inventoryType: 'spaces'; count: number; spaces: InventorySpace[]}> {
  const spaces = (
    await listAllPages<Record<string, unknown>>(
      config,
      '/o/headless-asset-library/v1.0/asset-libraries',
      'inventory-spaces',
      dependencies,
    )
  )
    .map((raw) => ({
      id: Number(raw.id),
      externalReferenceCode: textOf(raw.externalReferenceCode),
      name: textOf(raw.name),
      type: textOf(raw.type) || null,
    }))
    .sort((a, b) => a.externalReferenceCode.localeCompare(b.externalReferenceCode));
  return {inventoryType: 'spaces', count: spaces.length, spaces};
}

export function formatInventoryObjects(result: {objects: InventoryObjectDefinition[]}): string {
  return result.objects
    .map(
      (object) =>
        `${object.externalReferenceCode}\t${object.name}\t${object.scope}\t${object.status}\tfields=${object.fields.length}` +
        `\trelationships=${object.relationships.map((rel) => `${rel.name}->${rel.target}`).join(',') || '-'}` +
        `\tpicklists=${object.picklists.join(',') || '-'}`,
    )
    .join('\n');
}

export function formatInventoryPicklists(result: {picklists: InventoryPicklist[]}): string {
  return result.picklists
    .map((picklist) => `${picklist.externalReferenceCode}\t${picklist.name}\t${picklist.entryKeys.join(',')}`)
    .join('\n');
}

export function formatInventoryVocabularies(result: {
  siteFriendlyUrl: string;
  vocabularies: InventoryVocabulary[];
}): string {
  return [
    `site=${result.siteFriendlyUrl}`,
    ...result.vocabularies.map(
      (vocabulary) => `${vocabulary.externalReferenceCode}\t${vocabulary.name}\tcategories=${vocabulary.categories}`,
    ),
  ].join('\n');
}

export function formatInventoryClientExtensions(result: {clientExtensions: InventoryClientExtension[]}): string {
  return result.clientExtensions
    .map((cx) => `${cx.name}\t${cx.state}\t${cx.types.join(',') || 'unknown type'}`)
    .join('\n');
}

export function formatInventorySpaces(result: {spaces: InventorySpace[]}): string {
  return result.spaces.map((space) => `${space.externalReferenceCode}\t${space.name}\t${space.type ?? '-'}`).join('\n');
}
