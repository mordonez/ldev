import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import {runLiferayResourceGetStructure} from './liferay-resource-get-structure.js';
import {resolveMigrationsBaseDir, resolveSiteToken, resolveStructureFile} from './liferay-resource-paths.js';

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceMigrationInitResult = {
  site: string;
  structureKey: string;
  structureId: number;
  structureFile: string;
  outputPath: string;
  dependentStructures: string[];
  removedFieldReferences: string[];
  candidateTargetFieldReferences: string[];
};

export async function runLiferayResourceMigrationInit(
  config: AppConfig,
  options: {
    site?: string;
    key?: string;
    id?: string;
    file?: string;
    output?: string;
    templates?: boolean;
    overwrite?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceMigrationInitResult> {
  const structure = await runLiferayResourceGetStructure(
    config,
    {
      site: options.site,
      key: options.key,
      id: options.id,
    },
    dependencies,
  );
  const structureFile = await resolveStructureFile(config, structure.key, options.file);
  const localStructure = (await fs.readJson(structureFile)) as Record<string, unknown>;
  const dependentStructures = [...collectReferencedDependentStructures(localStructure, structure.key)].sort();
  const removedFieldReferences = [
    ...setDifference(collectFieldReferences(structure.raw), collectFieldReferences(localStructure)),
  ].sort();
  const candidateTargetFieldReferences = [...collectMigrationTargets(localStructure)].sort();
  const outputPath = resolveMigrationDescriptorOutputPath(
    config,
    options.output,
    structure.siteFriendlyUrl,
    structure.key,
  );

  if ((await fs.pathExists(outputPath)) && !options.overwrite) {
    throw LiferayErrors.resourceError(
      `The descriptor already exists: ${outputPath}. Use --overwrite to regenerate it.`,
    );
  }

  const descriptor = {
    site: structure.siteFriendlyUrl,
    structureKey: structure.key,
    templates: Boolean(options.templates),
    dependentStructures,
    introduce: {
      notes: [
        'Fill in introduce.mappings before running migration-run or migration-pipeline.',
        'Use target with fieldset[].field syntax when the destination lives inside a fieldset.',
        'Limit the scope with articleIds, folderIds, or rootFolderIds to avoid migrating the whole site when it is not needed.',
      ],
      articleIds: [],
      folderIds: [],
      rootFolderIds: [],
      mappings: [],
      scopeHelp: {
        articleIds: 'Optional list of structured content article IDs/keys to limit the migration to specific items.',
        folderIds: 'Optional list of Web Content folder IDs. Only migrates content from those exact folders.',
        rootFolderIds:
          'Optional list of root folder IDs. Expands their subfolders recursively and limits the migration to that tree.',
        recommendation:
          'Use one of these scopes in validations and real runs to avoid scanning every content item in the site.',
      },
      mappingHelp: {
        source: 'Current field reference you want to migrate from the old structure.',
        target: 'Target field reference in the new structure. If it lives inside a fieldset, use fieldset[].field.',
        cleanupSource:
          'Set to true when the source field should be cleaned in the second phase and removed from the final structure.',
        examples: [
          {source: 'oldTitle', target: 'newTitle', cleanupSource: false},
          {source: 'legacyBody', target: 'content[].body', cleanupSource: true},
        ],
      },
      suggestions: {
        removedFieldReferences,
        candidateTargetFieldReferences,
        suggestedMappings: removedFieldReferences.map((source) => ({
          source,
          target: candidateTargetFieldReferences[0] ?? '',
          cleanupSource: false,
        })),
      },
    },
  };

  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeJson(outputPath, descriptor, {spaces: 2});

  return {
    site: structure.siteFriendlyUrl,
    structureKey: structure.key,
    structureId: structure.id,
    structureFile,
    outputPath,
    dependentStructures,
    removedFieldReferences,
    candidateTargetFieldReferences,
  };
}

export function formatLiferayResourceMigrationInit(result: LiferayResourceMigrationInitResult): string {
  return [
    `CREATED\t${result.structureKey}\t${result.structureId}`,
    `site=${result.site}`,
    `file=${result.structureFile}`,
    `output=${result.outputPath}`,
    `dependentStructures=${result.dependentStructures.join(',')}`,
    `removedFieldReferences=${result.removedFieldReferences.join(',')}`,
    `candidateTargetFieldReferences=${result.candidateTargetFieldReferences.join(',')}`,
  ].join('\n');
}

function resolveMigrationDescriptorOutputPath(
  config: AppConfig,
  output: string | undefined,
  siteFriendlyUrl: string,
  structureKey: string,
): string {
  if (output) {
    return path.isAbsolute(output) ? output : path.resolve(config.repoRoot ?? config.cwd, output);
  }

  const baseDir = resolveMigrationsBaseDir(config);
  return path.join(baseDir, resolveSiteToken(siteFriendlyUrl), `${structureKey}.migration.json`);
}

function collectFieldReferences(definition: Record<string, unknown>): Set<string> {
  const refs = new Set<string>();
  collectFieldReferencesRecursive(definition.dataDefinitionFields, refs);
  return refs;
}

function collectFieldReferencesRecursive(fields: unknown, refs: Set<string>): void {
  if (!Array.isArray(fields)) {
    return;
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = field as Record<string, unknown>;
    const customProperties = (record.customProperties ?? {}) as Record<string, unknown>;
    const fieldReference = String(customProperties.fieldReference ?? record.name ?? '').trim();
    if (fieldReference !== '') {
      refs.add(fieldReference);
    }
    collectFieldReferencesRecursive(record.nestedDataDefinitionFields, refs);
  }
}

function collectMigrationTargets(definition: Record<string, unknown>): Set<string> {
  const targets = new Set<string>();
  collectMigrationTargetsRecursive(definition.dataDefinitionFields, targets, undefined);
  return targets;
}

function collectReferencedDependentStructures(
  definition: Record<string, unknown>,
  mainStructureKey: string,
): Set<string> {
  const structures = new Set<string>();
  collectReferencedDependentStructuresRecursive(definition.dataDefinitionFields, structures, mainStructureKey);
  return structures;
}

function collectReferencedDependentStructuresRecursive(
  fields: unknown,
  structures: Set<string>,
  mainStructureKey: string,
): void {
  if (!Array.isArray(fields)) {
    return;
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = field as Record<string, unknown>;
    const customProperties = (record.customProperties ?? {}) as Record<string, unknown>;
    const fieldsetKey = String(customProperties.ddmStructureKey ?? '').trim();
    if (
      String(record.fieldType ?? '')
        .trim()
        .toLowerCase() === 'fieldset' &&
      fieldsetKey !== '' &&
      fieldsetKey !== mainStructureKey
    ) {
      structures.add(fieldsetKey);
    }
    collectReferencedDependentStructuresRecursive(record.nestedDataDefinitionFields, structures, mainStructureKey);
  }
}

function collectMigrationTargetsRecursive(
  fields: unknown,
  targets: Set<string>,
  fieldsetName: string | undefined,
): void {
  if (!Array.isArray(fields)) {
    return;
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }
    const record = field as Record<string, unknown>;
    const reference = fieldReference(record);
    if (reference === '') {
      continue;
    }

    const nestedFields = Array.isArray(record.nestedDataDefinitionFields)
      ? (record.nestedDataDefinitionFields as Array<Record<string, unknown>>)
      : [];
    const isFieldset = nestedFields.length > 0 && isFieldsetField(record);

    if (fieldsetName) {
      targets.add(`${fieldsetName}[].${reference}`);
    } else if (!isFieldset) {
      targets.add(reference);
    }

    if (nestedFields.length > 0) {
      collectMigrationTargetsRecursive(nestedFields, targets, isFieldset ? reference : fieldsetName);
    }
  }
}

function fieldReference(field: Record<string, unknown>): string {
  const customProperties = (field.customProperties ?? {}) as Record<string, unknown>;
  return String(customProperties.fieldReference ?? field.name ?? '').trim();
}

function isFieldsetField(field: Record<string, unknown>): boolean {
  return (
    String(field.fieldType ?? '')
      .trim()
      .toLowerCase() === 'fieldset'
  );
}

function setDifference<T>(left: Set<T>, right: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of left) {
    if (!right.has(item)) {
      result.add(item);
    }
  }
  return result;
}
